"use strict";

const { Participant } = require("./participant");
const { SignalingError, ErrorCodes } = require("../utils/errors");
const config = require("../config");
const { logger } = require("../utils/logger");

class Room {
  constructor(roomId, opts = {}) {
    this.roomId = roomId;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.metadata = opts.metadata || {};
    // Voice channel style metadata (Discord-like)
    this.channelType = opts.channelType || "voice"; // voice | video | screen
    this.maxParticipants = opts.maxParticipants || config.rooms.maxParticipantsPerRoom;

    // Active participants: Map<peerId, Participant>
    this.participants = new Map();
    // Lookup by userId -> peerId (one peer per user per room for now; can extend to multi-session)
    this.userToPeer = new Map();
    // Stale participants pending reconnect: Map<peerId, { participant, disconnectedAt }>
    this.stale = new Map();

    // SFU router attached externally (set by RoomManager)
    this.sfuRouter = null;
  }

  touch() {
    this.lastActivity = Date.now();
  }

  isFull() {
    return this.participants.size >= this.maxParticipants;
  }

  isEmpty() {
    return this.participants.size === 0 && this.stale.size === 0;
  }

  hasPeer(peerId) {
    return this.participants.has(peerId);
  }

  getPeer(peerId) {
    return this.participants.get(peerId) || null;
  }

  getPeerByUserId(userId) {
    const peerId = this.userToPeer.get(userId);
    if (!peerId) return null;
    return this.participants.get(peerId) || this.stale.get(peerId)?.participant || null;
  }

  addParticipant({ userId, sessionId, displayName, ws, peerId }) {
    if (this.isFull()) {
      throw new SignalingError(ErrorCodes.ROOM_FULL, `Room ${this.roomId} is full (${this.maxParticipants})`);
    }
    // If user already in room (re-join without leave), treat as duplicate
    if (this.userToPeer.has(userId) && this.participants.has(this.userToPeer.get(userId))) {
      throw new SignalingError(ErrorCodes.ROOM_ALREADY_JOINED, `User ${userId} already in room ${this.roomId}`);
    }
    // If stale entry exists for this user (reconnect window), reclaim it
    const staleKey = [...this.stale.keys()].find((k) => this.stale.get(k).participant.userId === userId);
    if (staleKey) {
      const entry = this.stale.get(staleKey);
      this.stale.delete(staleKey);
      const p = entry.participant;
      p.isConnected = true;
      p.ws = ws;
      p.sessionId = sessionId;
      if (displayName) p.displayName = displayName;
      p.touch();
      this.participants.set(p.peerId, p);
      this.userToPeer.set(userId, p.peerId);
      p.roomId = this.roomId;
      this.touch();
      logger.info("room reconnect reclaim", { roomId: this.roomId, peerId: p.peerId, userId });
      return { participant: p, isReconnected: true };
    }

    const participant = new Participant({ peerId, userId, sessionId, displayName, ws });
    participant.roomId = this.roomId;
    this.participants.set(participant.peerId, participant);
    this.userToPeer.set(userId, participant.peerId);
    this.touch();
    return { participant, isReconnected: false };
  }

  removeParticipant(peerId, reason = "leave") {
    const p = this.participants.get(peerId);
    if (!p) return null;
    this.participants.delete(peerId);
    this.userToPeer.delete(p.userId);
    p.isConnected = false;
    p.ws = null;
    this.touch();

    // For disconnect (not explicit leave), keep stale for reconnect window
    if (reason === "disconnect") {
      this.stale.set(peerId, { participant: p, disconnectedAt: Date.now() });
    } else {
      // On explicit leave, also remove SFU tracks
      if (this.sfuRouter) {
        this.sfuRouter.removePeer(peerId);
      }
    }
    return p;
  }

  /**
   * Called when a disconnected participant's WS re-attaches within window.
   * Returns participant if found, else null.
   */
  tryReconnect(peerId, newWs, newSessionId) {
    const entry = this.stale.get(peerId);
    if (!entry) return null;
    const age = Date.now() - entry.disconnectedAt;
    if (age > config.rooms.reconnectWindowMs) {
      this.stale.delete(peerId);
      if (this.sfuRouter) this.sfuRouter.removePeer(peerId);
      return null;
    }
    const p = entry.participant;
    this.stale.delete(peerId);
    p.isConnected = true;
    p.ws = newWs;
    p.sessionId = newSessionId;
    p.touch();
    this.participants.set(peerId, p);
    this.userToPeer.set(p.userId, peerId);
    this.touch();
    return p;
  }

  // Broadcast to all participants except optional excludePeerId
  broadcast(event, payload, excludePeerId = null) {
    let count = 0;
    for (const [pid, p] of this.participants.entries()) {
      if (pid === excludePeerId) continue;
      if (!p.ws || p.ws.readyState !== 1) continue; // 1 = OPEN
      try {
        p.ws.send(JSON.stringify({ event, payload }));
        count++;
      } catch (e) {
        logger.warn("broadcast send failed", { roomId: this.roomId, peerId: pid, error: e.message });
      }
    }
    return count;
  }

  // Sweep stale entries past reconnect window
  sweepStale() {
    const now = Date.now();
    let removed = 0;
    for (const [peerId, entry] of [...this.stale.entries()]) {
      if (now - entry.disconnectedAt > config.rooms.reconnectWindowMs) {
        this.stale.delete(peerId);
        if (this.sfuRouter) this.sfuRouter.removePeer(peerId);
        removed++;
        logger.info("stale participant expired", { roomId: this.roomId, peerId });
      }
    }
    return removed;
  }

  listPublicParticipants() {
    return [...this.participants.values()].map((p) => p.toPublic());
  }

  toJSON() {
    return {
      roomId: this.roomId,
      channelType: this.channelType,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
      participantCount: this.participants.size,
      staleCount: this.stale.size,
      participants: this.listPublicParticipants(),
      metadata: this.metadata,
    };
  }
}

module.exports = { Room };

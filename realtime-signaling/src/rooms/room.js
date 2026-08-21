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
    this.channelType = opts.channelType || "voice";
    this.maxParticipants = opts.maxParticipants || config.rooms.maxParticipantsPerRoom;

    this.participants = new Map();
    this.userToPeer = new Map();
    this.stale = new Map();
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

    const existingPeerId = this.userToPeer.get(userId);
    if (existingPeerId) {
      const active = this.participants.get(existingPeerId);
      if (active) {
        if (active.sessionId === sessionId) {
          return { participant: active, isReconnected: true, alreadyJoined: true };
        }
        throw new SignalingError(ErrorCodes.ROOM_ALREADY_JOINED, `User ${userId} already in room ${this.roomId}`);
      }
    }

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
      return { participant: p, isReconnected: true, alreadyJoined: false };
    }

    const participant = new Participant({ peerId, userId, sessionId, displayName, ws });
    participant.roomId = this.roomId;
    this.participants.set(participant.peerId, participant);
    this.userToPeer.set(userId, participant.peerId);
    this.touch();
    return { participant, isReconnected: false, alreadyJoined: false };
  }

  removeParticipant(peerId, reason = "leave") {
    const p = this.participants.get(peerId);
    if (!p) return null;

    this.participants.delete(peerId);
    this.userToPeer.delete(p.userId);
    p.isConnected = false;
    p.ws = null;
    this.touch();

    if (reason === "disconnect") {
      this.stale.set(peerId, { participant: p, disconnectedAt: Date.now() });
    } else {
      if (this.sfuRouter) this.sfuRouter.removePeer(peerId);
      try { require("../media/trackManager").trackManager.removePeer(peerId); } catch {}
    }
    return p;
  }

  tryReconnect(peerId, newWs, newSessionId) {
    const entry = this.stale.get(peerId);
    if (!entry) return null;
    const age = Date.now() - entry.disconnectedAt;
    if (age > config.rooms.reconnectWindowMs) {
      this.stale.delete(peerId);
      if (this.sfuRouter) this.sfuRouter.removePeer(peerId);
      try { require("../media/trackManager").trackManager.removePeer(peerId); } catch {}
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

  broadcast(event, payload, excludePeerId = null) {
    let count = 0;
    for (const [pid, p] of this.participants.entries()) {
      if (pid === excludePeerId) continue;
      if (!p.ws || p.ws.readyState !== 1) continue;
      try {
        p.ws.send(JSON.stringify({ event, payload }));
        count++;
      } catch (e) {
        logger.warn("broadcast send failed", { roomId: this.roomId, peerId: pid, error: e.message });
      }
    }
    return count;
  }

  sweepStale() {
    const now = Date.now();
    let removed = 0;
    for (const [peerId, entry] of [...this.stale.entries()]) {
      if (now - entry.disconnectedAt > config.rooms.reconnectWindowMs) {
        this.stale.delete(peerId);
        if (this.sfuRouter) this.sfuRouter.removePeer(peerId);
        try { require("../media/trackManager").trackManager.removePeer(peerId); } catch {}
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

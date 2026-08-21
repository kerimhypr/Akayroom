"use strict";

const { Room } = require("./room");
const config = require("../config");
const { logger } = require("../utils/logger");
const { SignalingError, ErrorCodes } = require("../utils/errors");
const { SFURouter } = require("../sfu/router");

class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> Room
    this.sessionToRoom = new Map(); // sessionId -> Set<roomId> (normally 1 room per session but allow multiple)
    this.peerIdToRoom = new Map(); // peerId -> roomId
  }

  getOrCreateRoom(roomId, opts = {}) {
    if (!roomId || typeof roomId !== "string" || roomId.length > 64) {
      throw new SignalingError(ErrorCodes.ROOM_ID_INVALID, "Invalid roomId");
    }
    if (!/^[a-zA-Z0-9_\-:.]+$/.test(roomId)) {
      throw new SignalingError(ErrorCodes.ROOM_ID_INVALID, "roomId may contain alphanumeric, _ - : . only");
    }
    let room = this.rooms.get(roomId);
    if (!room) {
      if (this.rooms.size >= config.rooms.maxRooms) {
        throw new SignalingError(ErrorCodes.ROOM_LIMIT_EXCEEDED, "Server room limit reached");
      }
      room = new Room(roomId, opts);
      // Attach SFU router
      room.sfuRouter = new SFURouter(roomId);
      this.rooms.set(roomId, room);
      logger.info("room created", { roomId });
    }
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  listRooms() {
    return [...this.rooms.values()].map((r) => ({
      roomId: r.roomId,
      participantCount: r.participants.size,
      createdAt: r.createdAt,
      channelType: r.channelType,
    }));
  }

  joinRoom({ roomId, userId, sessionId, displayName, ws, peerId }) {
    const room = this.getOrCreateRoom(roomId);
    const { participant, isReconnected } = room.addParticipant({ userId, sessionId, displayName, ws, peerId });
    this.peerIdToRoom.set(participant.peerId, roomId);
    if (!this.sessionToRoom.has(sessionId)) this.sessionToRoom.set(sessionId, new Set());
    this.sessionToRoom.get(sessionId).add(roomId);
    return { room, participant, isReconnected };
  }

  leaveRoom({ roomId, peerId, reason = "leave" }) {
    const room = this.rooms.get(roomId);
    if (!room) throw new SignalingError(ErrorCodes.ROOM_NOT_FOUND, `Room ${roomId} not found`);
    const p = room.removeParticipant(peerId, reason);
    if (p) {
      this.peerIdToRoom.delete(peerId);
      // Clean session mapping if no longer in any room
      for (const [sess, set] of this.sessionToRoom.entries()) {
        if (set.has(roomId) && p.sessionId === sess) {
          set.delete(roomId);
          if (set.size === 0) this.sessionToRoom.delete(sess);
        }
      }
    }
    return { room, participant: p };
  }

  // Called on WS disconnect – move all participants of that session to stale
  handleDisconnect(sessionId, reason = "disconnect") {
    const roomIds = this.sessionToRoom.get(sessionId);
    if (!roomIds) return [];
    const affected = [];
    for (const roomId of [...roomIds]) {
      const room = this.rooms.get(roomId);
      if (!room) continue;
      // Find peer(s) belonging to this session
      const peers = [...room.participants.values()].filter((p) => p.sessionId === sessionId);
      for (const peer of peers) {
        const p = room.removeParticipant(peer.peerId, "disconnect");
        // Also need to broadcast peer:left after? Caller will handle per room.
        this.peerIdToRoom.delete(peer.peerId);
        affected.push({ room, participant: p });
        logger.info("participant stale on disconnect", { roomId, peerId: peer.peerId, userId: peer.userId, reason });
      }
      // Remove session entry after processing (peers are now stale, not active)
      // Keep sessionToRoom entry removed.
    }
    this.sessionToRoom.delete(sessionId);
    return affected;
  }

  // Try to reconnect stale participant (called before join)
  tryReconnect({ roomId, peerId, ws, sessionId }) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const p = room.tryReconnect(peerId, ws, sessionId);
    if (p) {
      this.peerIdToRoom.set(peerId, roomId);
      if (!this.sessionToRoom.has(sessionId)) this.sessionToRoom.set(sessionId, new Set());
      this.sessionToRoom.get(sessionId).add(roomId);
      return { room, participant: p };
    }
    return null;
  }

  getRoomByPeerId(peerId) {
    const roomId = this.peerIdToRoom.get(peerId);
    if (!roomId) return null;
    return this.rooms.get(roomId) || null;
  }

  // Periodic cleanup
  sweep() {
    let staleRemoved = 0;
    let roomsRemoved = 0;
    for (const room of this.rooms.values()) {
      staleRemoved += room.sweepStale();
      // Idle room cleanup: if empty and idle longer than threshold
      if (room.isEmpty() && Date.now() - room.lastActivity > config.rooms.roomIdleTimeoutMs) {
        this.rooms.delete(room.roomId);
        roomsRemoved++;
        logger.info("room idle removed", { roomId: room.roomId });
      }
    }
    if (staleRemoved || roomsRemoved) {
      logger.debug("sweep", { staleRemoved, roomsRemoved, rooms: this.rooms.size });
    }
    return { staleRemoved, roomsRemoved };
  }

  stats() {
    let participants = 0;
    let stale = 0;
    for (const r of this.rooms.values()) {
      participants += r.participants.size;
      stale += r.stale.size;
    }
    return { rooms: this.rooms.size, participants, stale };
  }
}

// Singleton
const roomManager = new RoomManager();

module.exports = { RoomManager, roomManager };

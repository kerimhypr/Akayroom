"use strict";

const { v4: uuidv4 } = require("uuid");

class Participant {
  constructor({ peerId, userId, sessionId, displayName, ws }) {
    this.peerId = peerId || `peer_${uuidv4().slice(0, 8)}`;
    this.userId = userId;
    this.sessionId = sessionId;
    this.displayName = displayName || userId;
    this.ws = ws || null; // WebSocket reference (may be null after disconnect for reconnect window)
    this.joinedAt = Date.now();
    this.lastSeen = Date.now();
    this.isConnected = true;

    // Media state – mirrors what client publishes
    this.mediaState = {
      micMuted: false,
      camEnabled: false,
      screenEnabled: false,
      audioEnabled: true,
      videoEnabled: false,
    };

    // Tracks published by this participant: Map<trackId, { kind, muted, simulcast, createdAt }>
    this.tracks = new Map();

    // Room membership
    this.roomId = null;
  }

  setMediaState(patch) {
    Object.assign(this.mediaState, patch);
    this.lastSeen = Date.now();
  }

  addTrack(trackId, kind, opts = {}) {
    this.tracks.set(trackId, {
      trackId,
      kind,
      muted: false,
      simulcast: !!opts.simulcast,
      codec: opts.codec || null,
      createdAt: Date.now(),
    });
  }

  removeTrack(trackId) {
    return this.tracks.delete(trackId);
  }

  muteTrack(trackId, muted = true) {
    const t = this.tracks.get(trackId);
    if (t) t.muted = muted;
  }

  touch() {
    this.lastSeen = Date.now();
  }

  toJSON() {
    return {
      peerId: this.peerId,
      userId: this.userId,
      sessionId: this.sessionId,
      displayName: this.displayName,
      mediaState: { ...this.mediaState },
      tracks: [...this.tracks.values()],
      joinedAt: this.joinedAt,
      isConnected: this.isConnected,
      roomId: this.roomId,
    };
  }

  // Public view sent to other peers (no internal ws)
  toPublic() {
    return {
      peerId: this.peerId,
      userId: this.userId,
      displayName: this.displayName,
      mediaState: { ...this.mediaState },
      tracks: [...this.tracks.values()],
      joinedAt: this.joinedAt,
    };
  }
}

module.exports = { Participant };

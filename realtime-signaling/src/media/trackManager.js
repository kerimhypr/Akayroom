"use strict";

const { SignalingError, ErrorCodes } = require("../utils/errors");
const config = require("../config");
const { v4: uuidv4 } = require("uuid");

const VALID_KINDS = new Set(["audio", "video", "screenshare"]);
const VALID_CODECS = new Set(["vp8", "vp9", "h264", "av1", "opus", ""]);

/**
 * Central track lifecycle:
 *   publish -> active
 *   pause (mute) -> paused but still published
 *   resume (unmute)
 *   replace (trackId stays, underlying MediaStreamTrack replaced – signaled via renegotiation)
 *   unpublish -> removed
 *
 * In signaling-only SFU mode, we don't handle media bytes; we route metadata.
 * In mediasoup mode, this would map to Producer/Consumer lifecycle.
 */
class TrackManager {
  constructor() {
    // Global track registry: Map<trackId, { trackId, peerId, roomId, kind, ... }>
    this.tracks = new Map();
  }

  _newTrackId(peerId, kind) {
    return `track_${kind}_${uuidv4().slice(0, 8)}`;
  }

  validateKind(kind) {
    if (!VALID_KINDS.has(kind)) {
      throw new SignalingError(ErrorCodes.TRACK_KIND_INVALID, `Invalid track kind: ${kind}. Must be audio|video|screenshare`);
    }
  }

  publish({ room, participant, kind, trackId, simulcast, codec }) {
    this.validateKind(kind);
    if (participant.tracks.size >= config.rooms.maxTracksPerParticipant) {
      throw new SignalingError(ErrorCodes.TRACK_LIMIT_EXCEEDED, `Max tracks per participant (${config.rooms.maxTracksPerParticipant}) reached`);
    }
    const finalTrackId = trackId || this._newTrackId(participant.peerId, kind);
    if (this.tracks.has(finalTrackId)) {
      throw new SignalingError(ErrorCodes.UNSUPPORTED_OPERATION, `trackId ${finalTrackId} already exists`);
    }
    const track = {
      trackId: finalTrackId,
      peerId: participant.peerId,
      userId: participant.userId,
      roomId: room.roomId,
      kind,
      muted: false,
      simulcast: !!simulcast,
      codec: codec || null,
      createdAt: Date.now(),
      state: "active",
    };
    this.tracks.set(finalTrackId, track);
    participant.addTrack(finalTrackId, kind, { simulcast, codec });

    // Update participant media state flags
    if (kind === "audio") participant.setMediaState({ micMuted: false, audioEnabled: true });
    if (kind === "video") participant.setMediaState({ camEnabled: true, videoEnabled: true });
    if (kind === "screenshare") participant.setMediaState({ screenEnabled: true });

    // Also register in SFU router if present
    if (room.sfuRouter) {
      room.sfuRouter.addProducer(participant.peerId, track);
    }

    return track;
  }

  unpublish({ room, participant, trackId }) {
    const track = this.tracks.get(trackId);
    if (!track) throw new SignalingError(ErrorCodes.TRACK_NOT_FOUND, `Track ${trackId} not found`);
    if (track.peerId !== participant.peerId) {
      throw new SignalingError(ErrorCodes.UNSUPPORTED_OPERATION, "Cannot unpublish another participant's track");
    }
    this.tracks.delete(trackId);
    participant.removeTrack(trackId);

    // Recompute media flags: if no remaining track of that kind, disable flag
    const remainingKinds = new Set([...participant.tracks.values()].map((t) => t.kind));
    if (!remainingKinds.has("audio")) participant.setMediaState({ audioEnabled: false, micMuted: true });
    if (!remainingKinds.has("video")) participant.setMediaState({ videoEnabled: false, camEnabled: false });
    if (!remainingKinds.has("screenshare")) participant.setMediaState({ screenEnabled: false });

    if (room.sfuRouter) {
      room.sfuRouter.removeProducer(trackId);
    }
    return track;
  }

  setMute({ participant, trackId, muted, kind }) {
    // Two modes:
    //  - per-track mute: trackId given
    //  - per-kind mute: kind given, mute all tracks of that kind
    let affected = [];
    if (trackId) {
      const track = this.tracks.get(trackId);
      if (!track) throw new SignalingError(ErrorCodes.TRACK_NOT_FOUND, `Track ${trackId} not found`);
      if (track.peerId !== participant.peerId) throw new SignalingError(ErrorCodes.UNSUPPORTED_OPERATION, "Cannot mute another peer's track");
      track.muted = !!muted;
      participant.muteTrack(trackId, !!muted);
      affected.push(track);
      if (roomSfuMute(participant, track)) {} // placeholder
    } else if (kind) {
      this.validateKind(kind);
      for (const [tid, t] of this.tracks.entries()) {
        if (t.peerId === participant.peerId && t.kind === kind) {
          t.muted = !!muted;
          participant.muteTrack(tid, !!muted);
          affected.push(t);
        }
      }
      // Even if no track published yet (e.g., mute before publish), update mediaState so peers see intended state
      if (kind === "audio") participant.setMediaState({ micMuted: !!muted, audioEnabled: !muted });
      if (kind === "video") participant.setMediaState({ camEnabled: !muted, videoEnabled: !muted });
      if (kind === "screenshare") participant.setMediaState({ screenEnabled: !muted });
      if (affected.length === 0) {
        // Return synthetic muted state event even without track
        return { synthetic: true, kind, muted: !!muted };
      }
    } else {
      throw new SignalingError(ErrorCodes.PAYLOAD_INVALID, "mute requires trackId or kind");
    }
    return affected;
  }

  getTrack(trackId) {
    return this.tracks.get(trackId) || null;
  }

  getTracksByPeer(peerId) {
    return [...this.tracks.values()].filter((t) => t.peerId === peerId);
  }

  getTracksByRoom(roomId) {
    return [...this.tracks.values()].filter((t) => t.roomId === roomId);
  }

  removePeer(peerId) {
    let removed = 0;
    for (const [tid, t] of [...this.tracks.entries()]) {
      if (t.peerId === peerId) {
        this.tracks.delete(tid);
        removed++;
      }
    }
    return removed;
  }

  stats() {
    return { totalTracks: this.tracks.size };
  }
}

function roomSfuMute() { return; }

const trackManager = new TrackManager();
module.exports = { TrackManager, trackManager };

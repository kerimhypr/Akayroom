"use strict";

const { v4: uuidv4 } = require("uuid");
const { Events } = require("./events");
const { validate } = require("../utils/validator");
const { SignalingError, ErrorCodes } = require("../utils/errors");
const { authenticateConnection, requireAuth } = require("../auth/middleware");
const { roomManager } = require("../rooms/roomManager");
const { trackManager } = require("../media/trackManager");
const { logger } = require("../utils/logger");

function send(ws, event, payload, requestId) {
  if (ws.readyState !== 1) return;
  const msg = { event, payload };
  if (requestId) msg.requestId = requestId;
  ws.send(JSON.stringify(msg));
}
function sendSuccess(ws, event, data, requestId) {
  send(ws, event, { success: true, data }, requestId);
}
function sendError(ws, event, code, message, details, requestId) {
  send(ws, event, { success: false, error: { code, message, ...(details ? { details } : {}) } }, requestId);
}

// Helper: find participant by ws peerId mapping
function getParticipantForWs(ws, roomId) {
  // ws keeps map peerId -> roomId via ws._peerRooms
  if (!roomId) return null;
  const room = roomManager.getRoom(roomId);
  if (!room) return null;
  // find peer belonging to this user/session in room
  const peers = [...room.participants.values()].filter((p) => p.userId === ws.userId && p.sessionId === ws.sessionId);
  return peers[0] || null;
}

// ── Handlers ──

async function handleAuthAuthenticate(ws, payload, requestId) {
  const data = validate(Events.AUTH_AUTHENTICATE, payload);
  try {
    const auth = await authenticateConnection(ws, data.token);
    if (data.displayName) ws.displayName = data.displayName.slice(0, 32);
    // If resumeSessionId provided, attempt to reattach stale peers automatically
    let resumed = [];
    if (data.resumeSessionId) {
      // Client wants to resume previous session's rooms – we list stale rooms for this user and try
      // For simplicity we don't auto-rejoin; client should re-issue room:join with same roomIds and we will reclaim stale if present.
      resumed = [];
    }
    send(ws, Events.AUTH_SUCCESS, {
      success: true,
      data: {
        userId: auth.userId,
        sessionId: ws.sessionId,
        peerId: ws.peerIdHint || null,
        displayName: ws.displayName || auth.userId,
        exp: auth.exp,
        resumed,
      },
    }, requestId);
    send(ws, Events.CONNECTION_READY, { sessionId: ws.sessionId, userId: auth.userId }, null);
  } catch (e) {
    const code = e.code || ErrorCodes.AUTH_FAILED;
    const message = e.message || "Authentication failed";
    send(ws, Events.AUTH_FAILED, { success: false, error: { code, message } }, requestId);
    logger.warn("auth failed", { sessionId: ws.sessionId, code, message });
  }
}

async function handleRoomJoin(ws, payload, requestId) {
  requireAuth(ws);
  const data = validate(Events.ROOM_JOIN, payload);
  // DisplayName override per-room
  const displayName = data.displayName || ws.displayName || ws.userId;

  // Check if stale exists for this user in that room – try reclaim first
  const existingRoom = roomManager.getRoom(data.roomId);
  if (existingRoom) {
    const stalePeerId = [...existingRoom.stale.keys()].find((k) => existingRoom.stale.get(k).participant.userId === ws.userId);
    if (stalePeerId) {
      const reclaimed = roomManager.tryReconnect({ roomId: data.roomId, peerId: stalePeerId, ws, sessionId: ws.sessionId });
      if (reclaimed) {
        const participant = reclaimed.participant;
        ws._peerRooms = ws._peerRooms || new Map();
        ws._peerRooms.set(participant.peerId, data.roomId);
        ws._currentPeerId = participant.peerId;

        // Notify others peer:joined (reconnected)
        existingRoom.broadcast(Events.PEER_JOINED, { peer: participant.toPublic(), reconnected: true }, participant.peerId);

        // Send room:joined snapshot to joiner
        const others = existingRoom.listPublicParticipants().filter((p) => p.peerId !== participant.peerId);
        const sfuSnapshot = existingRoom.sfuRouter ? existingRoom.sfuRouter.getSnapshotForPeer(participant.peerId) : [];
        send(ws, Events.ROOM_JOINED, {
          success: true,
          data: {
            roomId: data.roomId,
            peerId: participant.peerId,
            isReconnected: true,
            participants: others,
            sfu: { tracks: sfuSnapshot },
            mediaState: participant.mediaState,
          },
        }, requestId);
        logger.info("room reconnected", { roomId: data.roomId, peerId: participant.peerId, userId: ws.userId });
        return;
      }
    }
  }

  try {
    const { room, participant, isReconnected } = roomManager.joinRoom({
      roomId: data.roomId,
      userId: ws.userId,
      sessionId: ws.sessionId,
      displayName,
      ws,
      peerId: ws._peerIdForNextJoin || undefined,
    });
    // Track mapping
    ws._peerRooms = ws._peerRooms || new Map();
    ws._peerRooms.set(participant.peerId, data.roomId);
    ws._currentPeerId = participant.peerId;
    ws.displayName = displayName;

    // Snapshot for joiner: other participants + SFU tracks
    const others = room.listPublicParticipants().filter((p) => p.peerId !== participant.peerId);
    const sfuSnapshot = room.sfuRouter ? room.sfuRouter.getSnapshotForPeer(participant.peerId) : [];

    send(ws, Events.ROOM_JOINED, {
      success: true,
      data: {
        roomId: data.roomId,
        peerId: participant.peerId,
        isReconnected: !!isReconnected,
        participants: others,
        sfu: { mode: room.sfuRouter ? room.sfuRouter.mode : "signaling", tracks: sfuSnapshot },
        mediaState: participant.mediaState,
      },
    }, requestId);

    // Broadcast to others in room
    room.broadcast(Events.PEER_JOINED, { peer: participant.toPublic(), roomId: data.roomId }, participant.peerId);

    // Also send full room:state to everyone (optional – helps sync)
    // room.broadcast(Events.ROOM_STATE, { roomId: data.roomId, participants: room.listPublicParticipants() });

    logger.info("room joined", { roomId: data.roomId, peerId: participant.peerId, userId: ws.userId, participants: room.participants.size });
  } catch (e) {
    const code = e.code || ErrorCodes.INTERNAL_ERROR;
    sendError(ws, Events.ROOM_ERROR, code, e.message, e.details, requestId);
    logger.warn("room join failed", { roomId: data.roomId, userId: ws.userId, code, error: e.message });
  }
}

async function handleRoomLeave(ws, payload, requestId) {
  requireAuth(ws);
  const data = validate(Events.ROOM_LEAVE, payload);
  const participant = getParticipantForWs(ws, data.roomId);
  if (!participant) {
    // Try lookup via peerRooms mapping
    let peerId = null;
    if (ws._peerRooms) {
      for (const [pid, rid] of ws._peerRooms.entries()) if (rid === data.roomId) peerId = pid;
    }
    if (!peerId) {
      sendError(ws, Events.ROOM_ERROR, ErrorCodes.ROOM_NOT_JOINED, `Not in room ${data.roomId}`, null, requestId);
      return;
    }
    // have peerId
    const { room, participant: p } = roomManager.leaveRoom({ roomId: data.roomId, peerId, reason: "leave" });
    trackManager.removePeer(peerId);
    if (p) {
      if (ws._peerRooms) ws._peerRooms.delete(peerId);
      sendSuccess(ws, Events.ROOM_LEFT, { roomId: data.roomId, peerId }, requestId);
      room.broadcast(Events.PEER_LEFT, { peerId, userId: p.userId, roomId: data.roomId, reason: "leave" });
      logger.info("room left", { roomId: data.roomId, peerId });
    }
    return;
  }
  const peerId = participant.peerId;
  const { room, participant: removed } = roomManager.leaveRoom({ roomId: data.roomId, peerId, reason: "leave" });
  trackManager.removePeer(peerId);
  if (ws._peerRooms) ws._peerRooms.delete(peerId);
  sendSuccess(ws, Events.ROOM_LEFT, { roomId: data.roomId, peerId }, requestId);
  room.broadcast(Events.PEER_LEFT, { peerId, userId: removed.userId, roomId: data.roomId, reason: "leave" });
  logger.info("room left", { roomId: data.roomId, peerId });
}

async function handleRoomList(ws, payload, requestId) {
  requireAuth(ws);
  const rooms = roomManager.listRooms();
  send(ws, Events.ROOM_LIST_RESPONSE, { success: true, data: { rooms } }, requestId);
}

// ── WebRTC routing ──

function routeWebRTC(ws, eventName, payload, requestId) {
  requireAuth(ws);
  // Determine room and target
  const roomId = payload.roomId;
  if (!roomId) throw new SignalingError(ErrorCodes.PAYLOAD_INVALID, "roomId required");
  const room = roomManager.getRoom(roomId);
  if (!room) throw new SignalingError(ErrorCodes.ROOM_NOT_FOUND, `Room ${roomId} not found`);
  // Ensure sender is in room
  const senderPeer = getParticipantForWs(ws, roomId) || [...room.participants.values()].find((p) => p.userId === ws.userId);
  if (!senderPeer) throw new SignalingError(ErrorCodes.NOT_IN_ROOM, `You are not in room ${roomId}`);

  const targetPeerId = payload.targetPeerId || payload.targetId || null;
  if (targetPeerId) {
    const target = room.getPeer(targetPeerId);
    if (!target) throw new SignalingError(ErrorCodes.TARGET_PEER_NOT_FOUND, `Target peer ${targetPeerId} not found in room ${roomId}`);
    if (!target.ws || target.ws.readyState !== 1) throw new SignalingError(ErrorCodes.PEER_NOT_FOUND, `Target peer ${targetPeerId} not connected`);
    // Forward
    send(target.ws, eventName, {
      fromPeerId: senderPeer.peerId,
      fromUserId: ws.userId,
      roomId,
      sdp: payload.sdp,
      candidate: payload.candidate,
      sdpMid: payload.sdpMid,
      sdpMLineIndex: payload.sdpMLineIndex,
      type: payload.type,
    });
    // Ack to sender
    if (requestId) send(ws, eventName, { success: true, data: { forwardedTo: targetPeerId } }, requestId);
    logger.debug("webrtc routed", { event: eventName, roomId, from: senderPeer.peerId, to: targetPeerId });
  } else {
    // Broadcast to all other peers (mesh helper) – used for SFU-less simple mode
    // For SFU mode, this would route to SFU instead of mesh; we still broadcast for compatibility.
    let forwarded = 0;
    for (const [pid, peer] of room.participants.entries()) {
      if (pid === senderPeer.peerId) continue;
      if (!peer.ws || peer.ws.readyState !== 1) continue;
      send(peer.ws, eventName, {
        fromPeerId: senderPeer.peerId,
        fromUserId: ws.userId,
        roomId,
        sdp: payload.sdp,
        candidate: payload.candidate,
        sdpMid: payload.sdpMid,
        sdpMLineIndex: payload.sdpMLineIndex,
        type: payload.type,
      });
      forwarded++;
    }
    if (requestId) send(ws, eventName, { success: true, data: { broadcastCount: forwarded } }, requestId);
    logger.debug("webrtc broadcast", { event: eventName, roomId, from: senderPeer.peerId, count: forwarded });
  }
}

async function handleWebRTCOffer(ws, payload, requestId) {
  const data = validate(Events.WEBRTC_OFFER, payload);
  routeWebRTC(ws, Events.WEBRTC_OFFER, data, requestId);
}
async function handleWebRTCAnswer(ws, payload, requestId) {
  const data = validate(Events.WEBRTC_ANSWER, payload);
  routeWebRTC(ws, Events.WEBRTC_ANSWER, data, requestId);
}
async function handleICECandidate(ws, payload, requestId) {
  const data = validate(Events.WEBRTC_ICE_CANDIDATE, payload);
  routeWebRTC(ws, Events.WEBRTC_ICE_CANDIDATE, data, requestId);
}
async function handleRenegotiate(ws, payload, requestId) {
  const data = validate(Events.WEBRTC_RENEGOTIATE, payload);
  requireAuth(ws);
  const room = roomManager.getRoom(data.roomId);
  if (!room) throw new SignalingError(ErrorCodes.ROOM_NOT_FOUND, `Room ${data.roomId} not found`);
  const peer = getParticipantForWs(ws, data.roomId);
  room.broadcast(Events.WEBRTC_RENEGOTIATE, { fromPeerId: peer ? peer.peerId : null, roomId: data.roomId, reason: data.reason }, peer ? peer.peerId : null);
  if (requestId) sendSuccess(ws, Events.WEBRTC_RENEGOTIATE, { roomId: data.roomId }, requestId);
}

// ── Media ──

async function handleMediaPublish(ws, payload, requestId) {
  requireAuth(ws);
  const data = validate(Events.MEDIA_PUBLISH, payload);
  const room = roomManager.getRoom(data.roomId);
  if (!room) throw new SignalingError(ErrorCodes.ROOM_NOT_FOUND, `Room ${data.roomId} not found`);
  const participant = getParticipantForWs(ws, data.roomId);
  if (!participant) throw new SignalingError(ErrorCodes.NOT_IN_ROOM, `Not in room ${data.roomId}`);
  const track = trackManager.publish({ room, participant, kind: data.kind, trackId: data.trackId, simulcast: data.simulcast, codec: data.codec });
  send(ws, Events.MEDIA_PUBLISHED, { success: true, data: { track } }, requestId);
  // Broadcast track-added to others + screen alias if needed
  const addedEvent = track.kind === "screenshare" ? Events.SCREEN_TRACK_ADDED : Events.MEDIA_TRACK_ADDED;
  room.broadcast(addedEvent, { track, peerId: participant.peerId, roomId: data.roomId }, participant.peerId);
  // Also send media:track-added for screenshare to keep generic listeners happy
  if (track.kind === "screenshare") {
    room.broadcast(Events.MEDIA_TRACK_ADDED, { track, peerId: participant.peerId, roomId: data.roomId }, participant.peerId);
  }
  // Also broadcast peer state updated
  room.broadcast(Events.PEER_STATE, { peerId: participant.peerId, mediaState: participant.mediaState, roomId: data.roomId });
  logger.info("track published", { roomId: data.roomId, peerId: participant.peerId, trackId: track.trackId, kind: track.kind });
}

async function handleMediaUnpublish(ws, payload, requestId) {
  requireAuth(ws);
  const data = validate(Events.MEDIA_UNPUBLISH, payload);
  const room = roomManager.getRoom(data.roomId);
  if (!room) throw new SignalingError(ErrorCodes.ROOM_NOT_FOUND, `Room ${data.roomId} not found`);
  const participant = getParticipantForWs(ws, data.roomId);
  if (!participant) throw new SignalingError(ErrorCodes.NOT_IN_ROOM, `Not in room ${data.roomId}`);
  const track = trackManager.unpublish({ room, participant, trackId: data.trackId });
  send(ws, Events.MEDIA_UNPUBLISHED, { success: true, data: { trackId: track.trackId } }, requestId);
  const removedEvent = track.kind === "screenshare" ? Events.SCREEN_TRACK_REMOVED : Events.MEDIA_TRACK_REMOVED;
  room.broadcast(removedEvent, { trackId: track.trackId, peerId: participant.peerId, kind: track.kind, roomId: data.roomId }, participant.peerId);
  if (track.kind === "screenshare") {
    room.broadcast(Events.MEDIA_TRACK_REMOVED, { trackId: track.trackId, peerId: participant.peerId, kind: track.kind, roomId: data.roomId }, participant.peerId);
  }
  room.broadcast(Events.PEER_STATE, { peerId: participant.peerId, mediaState: participant.mediaState, roomId: data.roomId });
  logger.info("track unpublished", { roomId: data.roomId, peerId: participant.peerId, trackId: track.trackId });
}

async function handleMediaMute(ws, payload, requestId) {
  requireAuth(ws);
  const data = validate(Events.MEDIA_MUTE, payload);
  const room = roomManager.getRoom(data.roomId);
  if (!room) throw new SignalingError(ErrorCodes.ROOM_NOT_FOUND, `Room ${data.roomId} not found`);
  const participant = getParticipantForWs(ws, data.roomId);
  if (!participant) throw new SignalingError(ErrorCodes.NOT_IN_ROOM, `Not in room ${data.roomId}`);
  const muted = data.muted !== undefined ? data.muted : true;
  const result = trackManager.setMute({ participant, trackId: data.trackId, muted, kind: data.kind });
  // Determine kind for broadcast
  const kind = data.kind || (Array.isArray(result) && result[0] ? result[0].kind : null) || "audio";
  sendSuccess(ws, Events.MEDIA_MUTE, { kind, muted }, requestId);
  room.broadcast(Events.MEDIA_TRACK_UPDATED, { peerId: participant.peerId, kind, muted, trackId: data.trackId || null, roomId: data.roomId });
  room.broadcast(Events.PEER_STATE, { peerId: participant.peerId, mediaState: participant.mediaState, roomId: data.roomId });
  logger.info("mute", { roomId: data.roomId, peerId: participant.peerId, kind, muted });
}

async function handleMediaUnmute(ws, payload, requestId) {
  requireAuth(ws);
  const data = validate(Events.MEDIA_UNMUTE, payload);
  const room = roomManager.getRoom(data.roomId);
  if (!room) throw new SignalingError(ErrorCodes.ROOM_NOT_FOUND, `Room ${data.roomId} not found`);
  const participant = getParticipantForWs(ws, data.roomId);
  if (!participant) throw new SignalingError(ErrorCodes.NOT_IN_ROOM, `Not in room ${data.roomId}`);
  // Reuse mute logic with muted=false
  const kind = data.kind;
  const trackId = data.trackId;
  const result = trackManager.setMute({ participant, trackId, muted: false, kind });
  const finalKind = kind || (Array.isArray(result) && result[0] ? result[0].kind : "audio");
  sendSuccess(ws, Events.MEDIA_UNMUTE, { kind: finalKind, muted: false }, requestId);
  room.broadcast(Events.MEDIA_TRACK_UPDATED, { peerId: participant.peerId, kind: finalKind, muted: false, trackId: trackId || null, roomId: data.roomId });
  room.broadcast(Events.PEER_STATE, { peerId: participant.peerId, mediaState: participant.mediaState, roomId: data.roomId });
  logger.info("unmute", { roomId: data.roomId, peerId: participant.peerId, kind: finalKind });
}

async function handleMediaState(ws, payload, requestId) {
  requireAuth(ws);
  const data = validate(Events.MEDIA_STATE, payload);
  const room = roomManager.getRoom(data.roomId);
  if (!room) throw new SignalingError(ErrorCodes.ROOM_NOT_FOUND, `Room ${data.roomId} not found`);
  const participant = getParticipantForWs(ws, data.roomId);
  if (!participant) throw new SignalingError(ErrorCodes.NOT_IN_ROOM, `Not in room ${data.roomId}`);
  const patch = {};
  if (data.audio !== undefined) { patch.audioEnabled = data.audio; patch.micMuted = !data.audio; }
  if (data.video !== undefined) { patch.videoEnabled = data.video; patch.camEnabled = data.video; }
  if (data.screen !== undefined) patch.screenEnabled = data.screen;
  if (data.micMuted !== undefined) patch.micMuted = data.micMuted;
  if (data.camEnabled !== undefined) patch.camEnabled = data.camEnabled;
  if (data.screenEnabled !== undefined) patch.screenEnabled = data.screenEnabled;
  participant.setMediaState(patch);
  sendSuccess(ws, Events.MEDIA_STATE, { mediaState: participant.mediaState }, requestId);
  room.broadcast(Events.PEER_STATE, { peerId: participant.peerId, mediaState: participant.mediaState, roomId: data.roomId }, participant.peerId);
}

async function handleMediaSubscribe(ws, payload, requestId) {
  requireAuth(ws);
  const data = validate(Events.MEDIA_SUBSCRIBE, payload);
  const room = roomManager.getRoom(data.roomId);
  if (!room) throw new SignalingError(ErrorCodes.ROOM_NOT_FOUND, `Room ${data.roomId} not found`);
  const participant = getParticipantForWs(ws, data.roomId);
  if (!participant) throw new SignalingError(ErrorCodes.NOT_IN_ROOM, `Not in room ${data.roomId}`);
  if (!room.sfuRouter) throw new SignalingError(ErrorCodes.SFU_ERROR, "SFU not available for this room");
  const trackId = data.trackId;
  if (!trackId) {
    // Subscribe to all (simple)
    const snapshot = room.sfuRouter.getSnapshotForPeer(participant.peerId);
    for (const t of snapshot) room.sfuRouter.subscribe(participant.peerId, t.trackId);
    send(ws, Events.MEDIA_SUBSCRIBED, { success: true, data: { subscribed: snapshot.map((s) => s.trackId) } }, requestId);
    return;
  }
  const producer = room.sfuRouter.subscribe(participant.peerId, trackId);
  if (!producer) throw new SignalingError(ErrorCodes.TRACK_NOT_FOUND, `Track ${trackId} not found`);
  send(ws, Events.MEDIA_SUBSCRIBED, { success: true, data: { trackId, peerId: producer.peerId, kind: producer.kind } }, requestId);
}

// ── Screen share convenience ──

async function handleScreenStart(ws, payload, requestId) {
  requireAuth(ws);
  const data = validate(Events.SCREEN_START, payload);
  const room = roomManager.getRoom(data.roomId);
  if (!room) throw new SignalingError(ErrorCodes.ROOM_NOT_FOUND, `Room ${data.roomId} not found`);
  const participant = getParticipantForWs(ws, data.roomId);
  if (!participant) throw new SignalingError(ErrorCodes.NOT_IN_ROOM, `Not in room ${data.roomId}`);
  const track = trackManager.publish({ room, participant, kind: "screenshare", trackId: data.trackId });
  send(ws, Events.MEDIA_PUBLISHED, { success: true, data: { track } }, requestId);
  room.broadcast(Events.SCREEN_TRACK_ADDED, { track, peerId: participant.peerId, roomId: data.roomId }, participant.peerId);
  room.broadcast(Events.MEDIA_TRACK_ADDED, { track, peerId: participant.peerId, roomId: data.roomId }, participant.peerId);
  room.broadcast(Events.PEER_STATE, { peerId: participant.peerId, mediaState: participant.mediaState, roomId: data.roomId });
  logger.info("screen start", { roomId: data.roomId, peerId: participant.peerId, trackId: track.trackId });
}

async function handleScreenStop(ws, payload, requestId) {
  requireAuth(ws);
  const data = validate(Events.SCREEN_STOP, payload);
  const room = roomManager.getRoom(data.roomId);
  if (!room) throw new SignalingError(ErrorCodes.ROOM_NOT_FOUND, `Room ${data.roomId} not found`);
  const participant = getParticipantForWs(ws, data.roomId);
  if (!participant) throw new SignalingError(ErrorCodes.NOT_IN_ROOM, `Not in room ${data.roomId}`);
  // Find screenshare track if trackId not specified – pick latest
  let trackId = data.trackId;
  if (!trackId) {
    const tracks = [...participant.tracks.values()].filter((t) => t.kind === "screenshare");
    if (tracks.length === 0) throw new SignalingError(ErrorCodes.TRACK_NOT_FOUND, "No screenshare track to stop");
    trackId = tracks[0].trackId;
  }
  const track = trackManager.unpublish({ room, participant, trackId });
  send(ws, Events.MEDIA_UNPUBLISHED, { success: true, data: { trackId } }, requestId);
  room.broadcast(Events.SCREEN_TRACK_REMOVED, { trackId, peerId: participant.peerId, roomId: data.roomId }, participant.peerId);
  room.broadcast(Events.MEDIA_TRACK_REMOVED, { trackId, peerId: participant.peerId, kind: "screenshare", roomId: data.roomId }, participant.peerId);
  room.broadcast(Events.PEER_STATE, { peerId: participant.peerId, mediaState: participant.mediaState, roomId: data.roomId });
  logger.info("screen stop", { roomId: data.roomId, peerId: participant.peerId, trackId });
}

// Dispatcher map
const handlers = {
  [Events.AUTH_AUTHENTICATE]: handleAuthAuthenticate,
  [Events.ROOM_JOIN]: handleRoomJoin,
  [Events.ROOM_LEAVE]: handleRoomLeave,
  [Events.ROOM_LIST]: handleRoomList,
  [Events.WEBRTC_OFFER]: handleWebRTCOffer,
  [Events.WEBRTC_ANSWER]: handleWebRTCAnswer,
  [Events.WEBRTC_ICE_CANDIDATE]: handleICECandidate,
  [Events.WEBRTC_RENEGOTIATE]: handleRenegotiate,
  [Events.MEDIA_PUBLISH]: handleMediaPublish,
  [Events.MEDIA_UNPUBLISH]: handleMediaUnpublish,
  [Events.MEDIA_MUTE]: handleMediaMute,
  [Events.MEDIA_UNMUTE]: handleMediaUnmute,
  [Events.MEDIA_STATE]: handleMediaState,
  [Events.MEDIA_SUBSCRIBE]: handleMediaSubscribe,
  [Events.SCREEN_START]: handleScreenStart,
  [Events.SCREEN_STOP]: handleScreenStop,
  // ping handled separately
};

module.exports = {
  handlers,
  handleAuthAuthenticate,
  handleRoomJoin,
  handleRoomLeave,
  handleRoomList,
  handleWebRTCOffer,
  handleWebRTCAnswer,
  handleICECandidate,
  handleRenegotiate,
  handleMediaPublish,
  handleMediaUnpublish,
  handleMediaMute,
  handleMediaUnmute,
  handleMediaState,
  handleMediaSubscribe,
  handleScreenStart,
  handleScreenStop,
  send,
  sendError,
  sendSuccess,
};

"use strict";

/**
 * Canonical event names – part of public contract.
 * Direction: C2S = client to server, S2C = server to client, BIDI = both.
 */

const Events = {
  // Connection
  CONNECTION_INIT: "connection:init",       // S2C on TCP connect
  CONNECTION_READY: "connection:ready",     // S2C after auth success (optional alias to auth:success)
  CONNECTION_ERROR: "connection:error",     // S2C
  CONNECTION_CLOSE: "connection:close",     // S2C (before WS close)
  PING: "ping",                             // BIDI
  PONG: "pong",                             // S2C

  // Auth
  AUTH_AUTHENTICATE: "auth:authenticate",   // C2S
  AUTH_SUCCESS: "auth:success",             // S2C
  AUTH_FAILED: "auth:failed",               // S2C

  // Room
  ROOM_JOIN: "room:join",                   // C2S
  ROOM_JOINED: "room:joined",               // S2C (ack)
  ROOM_LEAVE: "room:leave",                 // C2S
  ROOM_LEFT: "room:left",                   // S2C (ack)
  ROOM_ERROR: "room:error",                 // S2C
  ROOM_STATE: "room:state",                 // S2C (full participant list snapshot)
  ROOM_LIST: "room:list",                   // C2S
  ROOM_LIST_RESPONSE: "room:list_response", // S2C

  // Peer lifecycle (broadcast in room)
  PEER_JOINED: "peer:joined",               // S2C broadcast
  PEER_LEFT: "peer:left",                   // S2C broadcast
  PEER_STATE: "peer:state",                 // S2C broadcast (media state changed)
  PEER_UPDATED: "peer:updated",             // alias

  // WebRTC negotiation (routed via server)
  WEBRTC_OFFER: "webrtc:offer",             // BIDI (via server routing)
  WEBRTC_ANSWER: "webrtc:answer",           // BIDI
  WEBRTC_ICE_CANDIDATE: "webrtc:ice-candidate", // BIDI
  WEBRTC_RENEGOTIATE: "webrtc:renegotiate", // BIDI

  // Media / track lifecycle (SFU)
  MEDIA_PUBLISH: "media:publish",           // C2S
  MEDIA_PUBLISHED: "media:published",       // S2C ack
  MEDIA_UNPUBLISH: "media:unpublish",       // C2S
  MEDIA_UNPUBLISHED: "media:unpublished",   // S2C
  MEDIA_MUTE: "media:mute",                 // C2S
  MEDIA_UNMUTE: "media:unmute",             // C2S
  MEDIA_STATE: "media:state",               // C2S (bulk)
  MEDIA_TRACK_ADDED: "media:track-added",   // S2C broadcast
  MEDIA_TRACK_REMOVED: "media:track-removed", // S2C broadcast
  MEDIA_TRACK_UPDATED: "media:track-updated", // S2C broadcast (mute)
  MEDIA_SUBSCRIBE: "media:subscribe",       // C2S (request to consume)
  MEDIA_SUBSCRIBED: "media:subscribed",     // S2C
  MEDIA_ERROR: "media:error",               // S2C

  // Screen share (convenience alias over media)
  SCREEN_START: "screen:start",             // C2S
  SCREEN_STOP: "screen:stop",               // C2S
  SCREEN_TRACK_ADDED: "screen:track-added", // S2C broadcast (alias of media:track-added kind=screenshare)
  SCREEN_TRACK_REMOVED: "screen:track-removed", // S2C
};

module.exports = { Events };

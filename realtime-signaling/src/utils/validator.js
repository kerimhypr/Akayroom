"use strict";

const { z } = require("zod");
const { SignalingError, ErrorCodes } = require("./errors");

// ── Primitive schemas ──
const roomIdSchema = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_\-:.]+$/, "roomId may contain alphanumeric, _ - : .");
const peerIdSchema = z.string().min(1).max(64);
const userIdSchema = z.string().min(1).max(128);
const sdpSchema = z.string().min(1).max(20000);
const candidateSchema = z.string().min(1).max(5000);
const displayNameSchema = z.string().min(1).max(32);
const trackKindSchema = z.enum(["audio", "video", "screenshare"]);
const mediaStateSchema = z.object({
  micMuted: z.boolean().optional(),
  camEnabled: z.boolean().optional(),
  screenEnabled: z.boolean().optional(),
  audioEnabled: z.boolean().optional(),
  videoEnabled: z.boolean().optional(),
});

// ── Event payload schemas ──
const schemas = {
  // auth:authenticate
  "auth:authenticate": z.object({
    token: z.string().min(4).max(8192),
    displayName: displayNameSchema.optional(),
    // Optional: client may send previous sessionId for reconnect
    resumeSessionId: z.string().optional(),
  }),

  // room:join
  "room:join": z.object({
    roomId: roomIdSchema,
    password: z.string().max(128).optional(),
    displayName: displayNameSchema.optional(),
  }),

  // room:leave
  "room:leave": z.object({
    roomId: roomIdSchema,
  }),

  // room:list (no payload or optional filter)
  "room:list": z.object({}).passthrough().optional(),

  // webrtc:offer
  "webrtc:offer": z.object({
    roomId: roomIdSchema,
    targetPeerId: peerIdSchema.optional(), // if omitted => broadcast to SFU or all
    targetId: peerIdSchema.optional(), // alias
    sdp: sdpSchema,
    type: z.enum(["offer"]).optional(),
  }),

  // webrtc:answer
  "webrtc:answer": z.object({
    roomId: roomIdSchema,
    targetPeerId: peerIdSchema.optional(),
    targetId: peerIdSchema.optional(),
    sdp: sdpSchema,
    type: z.enum(["answer"]).optional(),
  }),

  // webrtc:ice-candidate
  "webrtc:ice-candidate": z.object({
    roomId: roomIdSchema,
    targetPeerId: peerIdSchema.optional(),
    targetId: peerIdSchema.optional(),
    candidate: candidateSchema,
    sdpMid: z.string().max(64).nullable().optional(),
    sdpMLineIndex: z.number().int().min(0).max(100).nullable().optional(),
  }),

  // webrtc:renegotiate (client asks to restart negotiation)
  "webrtc:renegotiate": z.object({
    roomId: roomIdSchema,
    reason: z.string().max(256).optional(),
  }),

  // media:publish
  "media:publish": z.object({
    roomId: roomIdSchema,
    kind: trackKindSchema,
    trackId: z.string().max(64).optional(),
    simulcast: z.boolean().optional(),
    codec: z.string().max(32).optional(),
  }),

  // media:unpublish
  "media:unpublish": z.object({
    roomId: roomIdSchema,
    trackId: z.string().min(1).max(64),
  }),

  // media:mute / media:unmute / media:state
  "media:mute": z.object({
    roomId: roomIdSchema,
    kind: trackKindSchema,
    muted: z.boolean().optional(),
    trackId: z.string().max(64).optional(),
  }),
  "media:unmute": z.object({
    roomId: roomIdSchema,
    kind: trackKindSchema,
    trackId: z.string().max(64).optional(),
  }),
  "media:state": z.object({
    roomId: roomIdSchema,
    audio: z.boolean().optional(),
    video: z.boolean().optional(),
    screen: z.boolean().optional(),
    micMuted: z.boolean().optional(),
    camEnabled: z.boolean().optional(),
    screenEnabled: z.boolean().optional(),
  }),

  // media:subscribe (SFU subscribe to a track)
  "media:subscribe": z.object({
    roomId: roomIdSchema,
    trackId: z.string().min(1).max(64).optional(),
    peerId: peerIdSchema.optional(),
    kind: trackKindSchema.optional(),
  }),

  // screen:start / screen:stop
  "screen:start": z.object({
    roomId: roomIdSchema,
    trackId: z.string().max(64).optional(),
  }),
  "screen:stop": z.object({
    roomId: roomIdSchema,
    trackId: z.string().max(64).optional(),
  }),

  // ping
  ping: z.object({}).passthrough().optional(),
  "connection:ping": z.object({}).passthrough().optional(),
};

function validate(event, payload) {
  const schema = schemas[event];
  if (!schema) {
    throw new SignalingError(ErrorCodes.EVENT_UNKNOWN, `Unknown event: ${event}`, { event });
  }
  const result = schema.safeParse(payload ?? {});
  if (!result.success) {
    const details = result.error.errors.map((e) => ({ path: e.path.join("."), message: e.message }));
    throw new SignalingError(ErrorCodes.PAYLOAD_INVALID, `Invalid payload for ${event}`, details);
  }
  // Normalize targetId alias -> targetPeerId
  if (result.data && result.data.targetId && !result.data.targetPeerId) {
    result.data.targetPeerId = result.data.targetId;
    delete result.data.targetId;
  }
  return result.data;
}

// Validate raw envelope { event, payload, requestId }
const envelopeSchema = z.object({
  event: z.string().min(1).max(64),
  payload: z.any().optional(),
  requestId: z.string().max(64).optional(),
});

function validateEnvelope(raw) {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new SignalingError(ErrorCodes.PAYLOAD_INVALID, "Invalid JSON");
    }
  }
  if (typeof raw !== "object" || raw === null) {
    throw new SignalingError(ErrorCodes.PAYLOAD_INVALID, "Envelope must be an object");
  }
  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SignalingError(ErrorCodes.PAYLOAD_INVALID, "Invalid envelope", parsed.error.errors);
  }
  return parsed.data;
}

module.exports = { schemas, validate, validateEnvelope, roomIdSchema, trackKindSchema };

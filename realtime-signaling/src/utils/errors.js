"use strict";

/**
 * Standard error codes for all signaling responses.
 * Agent B must handle these codes – they are part of the contract.
 */
const ErrorCodes = {
  // Auth
  AUTH_REQUIRED: "AUTH_REQUIRED",
  AUTH_FAILED: "AUTH_FAILED",
  AUTH_TOKEN_EXPIRED: "AUTH_TOKEN_EXPIRED",
  AUTH_TOKEN_INVALID: "AUTH_TOKEN_INVALID",
  AUTH_TOKEN_MISSING: "AUTH_TOKEN_MISSING",

  // Connection
  CONNECTION_RATE_LIMITED: "CONNECTION_RATE_LIMITED",
  CONNECTION_BANNED: "CONNECTION_BANNED",

  // Room
  ROOM_NOT_FOUND: "ROOM_NOT_FOUND",
  ROOM_FULL: "ROOM_FULL",
  ROOM_ALREADY_JOINED: "ROOM_ALREADY_JOINED",
  ROOM_NOT_JOINED: "ROOM_NOT_JOINED",
  ROOM_ID_INVALID: "ROOM_ID_INVALID",
  ROOM_LIMIT_EXCEEDED: "ROOM_LIMIT_EXCEEDED",

  // Participant
  PEER_NOT_FOUND: "PEER_NOT_FOUND",
  PEER_ALREADY_EXISTS: "PEER_ALREADY_EXISTS",
  NOT_IN_ROOM: "NOT_IN_ROOM",

  // Media / SFU
  TRACK_NOT_FOUND: "TRACK_NOT_FOUND",
  TRACK_LIMIT_EXCEEDED: "TRACK_LIMIT_EXCEEDED",
  TRACK_KIND_INVALID: "TRACK_KIND_INVALID",
  UNSUPPORTED_OPERATION: "UNSUPPORTED_OPERATION",

  // WebRTC
  SDP_INVALID: "SDP_INVALID",
  ICE_CANDIDATE_INVALID: "ICE_CANDIDATE_INVALID",
  TARGET_PEER_NOT_FOUND: "TARGET_PEER_NOT_FOUND",

  // Payload
  PAYLOAD_INVALID: "PAYLOAD_INVALID",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  EVENT_UNKNOWN: "EVENT_UNKNOWN",
  RATE_LIMITED: "RATE_LIMITED",

  // Server
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SFU_ERROR: "SFU_ERROR",
};

class SignalingError extends Error {
  constructor(code, message, details = null, statusCode = 400) {
    super(message);
    this.code = code;
    this.details = details;
    this.statusCode = statusCode;
  }
  toResponse() {
    return { code: this.code, message: this.message, ...(this.details ? { details: this.details } : {}) };
  }
}

function errorResponse(code, message, details) {
  return { success: false, error: { code, message, ...(details ? { details } : {}) } };
}
function successResponse(data = {}) {
  return { success: true, data };
}

module.exports = { ErrorCodes, SignalingError, errorResponse, successResponse };

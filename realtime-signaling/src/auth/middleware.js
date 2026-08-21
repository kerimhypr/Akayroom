"use strict";

const { verifyToken } = require("./jwt");
const { SignalingError, ErrorCodes } = require("../utils/errors");
const { logger } = require("../utils/logger");

/**
 * Authenticate a WebSocket connection object in-place.
 * Mutates conn.auth = { userId, email, role, exp, token, authenticatedAt }
 */
async function authenticateConnection(conn, token) {
  const result = await verifyToken(token);
  conn.auth = {
    userId: result.userId,
    email: result.email,
    role: result.role,
    exp: result.exp,
    raw: result.raw,
    token,
    authenticatedAt: Date.now(),
  };
  conn.userId = result.userId;
  conn.isAuthenticated = true;
  logger.info("auth success", { userId: result.userId, sessionId: conn.sessionId });
  return conn.auth;
}

function requireAuth(conn) {
  if (!conn.isAuthenticated || !conn.auth) {
    throw new SignalingError(ErrorCodes.AUTH_REQUIRED, "Authentication required. Send auth:authenticate first.", null, 401);
  }
  // Check exp
  if (conn.auth.exp && Date.now() / 1000 > conn.auth.exp) {
    conn.isAuthenticated = false;
    throw new SignalingError(ErrorCodes.AUTH_TOKEN_EXPIRED, "Session expired, please re-authenticate", null, 401);
  }
}

module.exports = { authenticateConnection, requireAuth };

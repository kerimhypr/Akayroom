"use strict";

const jwt = require("jsonwebtoken");
const config = require("../config");
const { logger } = require("../utils/logger");
const { SignalingError, ErrorCodes } = require("../utils/errors");

/**
 * Supabase JWT verification contract
 * ---------------------------------
 * Supabase issues JWTs in two flavours (depending on project age):
 *  1. HS256 – signed with SUPABASE_JWT_SECRET (legacy & still common)
 *  2. RS256 – signed via JWKS at SUPABASE_URL/auth/v1/.well-known/jwks.json
 *
 * This module supports both, plus a generic HS256 fallback (JWT_SECRET)
 * and a dev-bypass mode for local testing without Supabase.
 *
 * Client flow:
 *   1. Client calls `supabase.auth.getSession()` -> session.access_token
 *   2. Client sends `auth:authenticate { token: access_token }` via WS
 *   3. Server validates via verifyToken() -> extracts { userId, email, role, exp }
 */

// For RS256 JWKS support we do lazy dynamic import to avoid extra dep if unused.
// If JWKS_URL is set, we attempt to fetch & cache the JWKS.

let jwksCache = null;
let jwksCacheExpires = 0;

async function fetchJwks() {
  if (!config.auth.jwksUrl) return null;
  const now = Date.now();
  if (jwksCache && now < jwksCacheExpires) return jwksCache;
  try {
    // Use global fetch (Node 18+)
    const res = await fetch(config.auth.jwksUrl);
    if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
    const data = await res.json();
    jwksCache = data;
    jwksCacheExpires = now + 10 * 60 * 1000; // 10 min cache
    return data;
  } catch (e) {
    logger.warn("jwks fetch error", { error: e.message, url: config.auth.jwksUrl });
    return null;
  }
}

function getJwkForKid(jwks, kid) {
  if (!jwks || !jwks.keys) return null;
  return jwks.keys.find((k) => k.kid === kid) || null;
}

// Convert JWK to PEM-like key for jsonwebtoken verification (simplified: use jose would be ideal)
// For now we support HS256 primarily; RS256 via JWKS requires 'jose' which we avoid as mandatory dep.
// If RS256 needed in production, install `jose` and uncomment the RS256 branch below.
// We provide a clear error message instructing operator.

function verifyHs256(token, secret) {
  const opts = {};
  if (config.auth.audience) opts.audience = config.auth.audience;
  if (config.auth.issuer) opts.issuer = config.auth.issuer;
  // Supabase sets audience=authenticated by default; we allow either exact or array check via jsonwebtoken.
  // jsonwebtoken will verify exp/nbf/iat automatically.
  return jwt.verify(token, secret, { algorithms: ["HS256"], ...opts });
}

/**
 * Verify token and return payload { userId, email, role, sessionId, exp, raw }
 * Throws SignalingError on failure.
 */
async function verifyToken(token) {
  if (!token || typeof token !== "string") {
    throw new SignalingError(ErrorCodes.AUTH_TOKEN_MISSING, "Token is required");
  }
  if (token.length > 8192) {
    throw new SignalingError(ErrorCodes.AUTH_TOKEN_INVALID, "Token too long");
  }

  // Dev bypass – allows unsigned dev tokens for local testing
  // Token format: "dev:<userId>"  e.g. "dev:user_123"
  // Only allowed when AUTH_MODE=dev-bypass
  if (config.auth.mode === "dev-bypass") {
    if (token.startsWith("dev:")) {
      const userId = token.slice(4).trim();
      if (!userId) throw new SignalingError(ErrorCodes.AUTH_TOKEN_INVALID, "Invalid dev token format: dev:<userId>");
      if (!/^[a-zA-Z0-9_\-:.]+$/.test(userId)) throw new SignalingError(ErrorCodes.AUTH_TOKEN_INVALID, "Invalid dev userId");
      return {
        userId,
        email: `${userId}@dev.local`,
        role: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
        raw: { sub: userId, dev: true },
      };
    }
    // Also allow real JWT even in dev-bypass
  }

  // Try to decode header to decide algorithm without verifying
  let header;
  try {
    const decoded = jwt.decode(token, { complete: true });
    header = decoded ? decoded.header : null;
  } catch (_) {
    throw new SignalingError(ErrorCodes.AUTH_TOKEN_INVALID, "Token decode failed");
  }
  if (!header || !header.alg) {
    throw new SignalingError(ErrorCodes.AUTH_TOKEN_INVALID, "Token header missing alg");
  }

  // RS256 branch (Supabase new projects) – requires JWKS
  if (header.alg === "RS256") {
    if (!config.auth.jwksUrl) {
      throw new SignalingError(
        ErrorCodes.AUTH_TOKEN_INVALID,
        "RS256 token received but JWKS_URL not configured. Set JWKS_URL=https://<project>.supabase.co/auth/v1/.well-known/jwks.json or switch Supabase project to HS256",
      );
    }
    // Attempt JWKS verification if 'jose' is available; otherwise fail with instructions.
    try {
      // Try to use jose if installed (optional dep). We attempt dynamic require.
      const { createRemoteJWKSet, jwtVerify } = require("jose");
      const jwks = createRemoteJWKSet(new URL(config.auth.jwksUrl));
      const { payload } = await jwtVerify(token, jwks, {
        audience: config.auth.audience || undefined,
        issuer: config.auth.issuer || undefined,
      });
      const userId = payload.sub;
      if (!userId) throw new SignalingError(ErrorCodes.AUTH_TOKEN_INVALID, "Token missing sub");
      return {
        userId: String(userId),
        email: payload.email || "",
        role: payload.role || "authenticated",
        exp: payload.exp,
        raw: payload,
      };
    } catch (e) {
      if (e instanceof SignalingError) throw e;
      if (e.code === "MODULE_NOT_FOUND" || e.message.includes("Cannot find module 'jose'")) {
        throw new SignalingError(
          ErrorCodes.AUTH_TOKEN_INVALID,
          "RS256 verification requires 'jose' package. Run `npm install jose` and set JWKS_URL correctly.",
        );
      }
      // jwtVerify throws on invalid signature/exp
      if (e.code === "ERR_JWT_EXPIRED") throw new SignalingError(ErrorCodes.AUTH_TOKEN_EXPIRED, "Token expired");
      throw new SignalingError(ErrorCodes.AUTH_TOKEN_INVALID, `RS256 verification failed: ${e.message}`);
    }
  }

  // HS256 (most Supabase projects + generic)
  if (header.alg === "HS256") {
    const secret = config.auth.supabaseJwtSecret || config.auth.jwtSecret;
    if (!secret || secret === "dev-secret-change-me-32chars!!") {
      logger.warn("auth using default dev secret – set JWT_SECRET / SUPABASE_JWT_SECRET in production!");
    }
    try {
      const payload = verifyHs256(token, secret);
      const userId = payload.sub;
      if (!userId) throw new SignalingError(ErrorCodes.AUTH_TOKEN_INVALID, "Token missing sub (userId)");
      return {
        userId: String(userId),
        email: payload.email || "",
        role: payload.role || "authenticated",
        exp: payload.exp,
        raw: payload,
      };
    } catch (e) {
      if (e instanceof SignalingError) throw e;
      if (e.name === "TokenExpiredError") throw new SignalingError(ErrorCodes.AUTH_TOKEN_EXPIRED, "Token expired");
      if (e.name === "JsonWebTokenError") throw new SignalingError(ErrorCodes.AUTH_TOKEN_INVALID, `Invalid token: ${e.message}`);
      throw new SignalingError(ErrorCodes.AUTH_TOKEN_INVALID, `Token verification failed: ${e.message}`);
    }
  }

  throw new SignalingError(ErrorCodes.AUTH_TOKEN_INVALID, `Unsupported token alg: ${header.alg}`);
}

/**
 * Issue a dev token for local testing (HS256, short-lived).
 * Not for production.
 */
function issueDevToken(userId, opts = {}) {
  const secret = config.auth.jwtSecret;
  const payload = {
    sub: userId,
    email: opts.email || `${userId}@dev.local`,
    role: opts.role || "authenticated",
    aud: config.auth.audience || "authenticated",
  };
  return jwt.sign(payload, secret, { algorithm: "HS256", expiresIn: opts.expiresIn || "2h" });
}

module.exports = { verifyToken, issueDevToken, fetchJwks };

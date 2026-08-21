"use strict";

const path = require("path");
// Load from project root (.env); if missing, dotenv silently no-ops.
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

function env(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v;
}
function envInt(name, fallback) {
  const v = env(name, null);
  if (v === null) return fallback;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}
function envBool(name, fallback) {
  const v = env(name, null);
  if (v === null) return fallback;
  return v.toLowerCase() === "true" || v === "1";
}

const config = {
  host: env("HOST", "0.0.0.0"),
  port: envInt("PORT", 3001),
  nodeEnv: env("NODE_ENV", "development"),
  publicWsUrl: env("PUBLIC_WS_URL", "ws://localhost:3001/ws"),
  publicHttpUrl: env("PUBLIC_HTTP_URL", "http://localhost:3001"),
  corsOrigin: env("CORS_ORIGIN", "*"),

  auth: {
    mode: env("AUTH_MODE", "generic"), // generic | supabase | dev-bypass
    jwtSecret: env("JWT_SECRET", env("SUPABASE_JWT_SECRET", "dev-secret-change-me-32chars!!")),
    supabaseJwtSecret: env("SUPABASE_JWT_SECRET", ""),
    supabaseUrl: env("SUPABASE_URL", ""),
    supabaseAnonKey: env("SUPABASE_ANON_KEY", ""),
    jwksUrl: env("JWKS_URL", ""),
    audience: env("JWT_AUDIENCE", "authenticated"),
    issuer: env("JWT_ISSUER", ""),
  },

  rooms: {
    maxRooms: envInt("MAX_ROOMS", 1000),
    maxParticipantsPerRoom: envInt("MAX_PARTICIPANTS_PER_ROOM", 50),
    maxTracksPerParticipant: envInt("MAX_TRACKS_PER_PARTICIPANT", 6),
    roomIdleTimeoutMs: envInt("ROOM_IDLE_TIMEOUT_MS", 300_000),
    participantStaleTimeoutMs: envInt("PARTICIPANT_STALE_TIMEOUT_MS", 60_000),
    reconnectWindowMs: envInt("RECONNECT_WINDOW_MS", 60_000),
    heartbeatIntervalMs: envInt("HEARTBEAT_INTERVAL_MS", 25_000),
  },

  rateLimit: {
    windowMs: envInt("RATE_LIMIT_WINDOW_MS", 10_000),
    maxEvents: envInt("RATE_LIMIT_MAX_EVENTS", 30),
    burst: envInt("RATE_LIMIT_BURST", 50),
    banDurationMs: envInt("RATE_LIMIT_BAN_DURATION_MS", 60_000),
  },

  sfu: {
    mode: env("SFU_MODE", "signaling"), // signaling | mediasoup
    rtcMinPort: envInt("MEDIASOUP_RTC_MIN_PORT", 40000),
    rtcMaxPort: envInt("MEDIASOUP_RTC_MAX_PORT", 49999),
    announcedIp: env("MEDIASOUP_ANNOUNCED_IP", ""),
  },

  log: {
    level: env("LOG_LEVEL", "info"),
    format: env("LOG_FORMAT", "json"),
  },
};

module.exports = config;

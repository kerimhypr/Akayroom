"use strict";

const config = require("../config");

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[config.log.level] ?? LEVELS.info;

function shouldLog(level) {
  return LEVELS[level] >= currentLevel;
}

function baseFields() {
  return { ts: new Date().toISOString(), env: config.nodeEnv };
}

// Avoid logging secrets
const SENSITIVE_KEYS = new Set(["token", "jwt", "password", "secret", "authorization", "cookie"]);
function sanitize(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) out[k] = "[REDACTED]";
    else if (typeof v === "object" && v !== null) out[k] = sanitize(v);
    else out[k] = v;
  }
  return out;
}

function log(level, msg, meta = {}) {
  if (!shouldLog(level)) return;
  const entry = { level, msg, ...baseFields(), ...sanitize(meta) };
  const line = config.log.format === "json" ? JSON.stringify(entry) : `[${entry.ts}] [${level.toUpperCase()}] ${msg} ${JSON.stringify(meta)}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

const logger = {
  debug: (msg, meta) => log("debug", msg, meta),
  info: (msg, meta) => log("info", msg, meta),
  warn: (msg, meta) => log("warn", msg, meta),
  error: (msg, meta) => log("error", msg, meta),
  child: (extra) => ({
    debug: (msg, meta) => log("debug", msg, { ...extra, ...meta }),
    info: (msg, meta) => log("info", msg, { ...extra, ...meta }),
    warn: (msg, meta) => log("warn", msg, { ...extra, ...meta }),
    error: (msg, meta) => log("error", msg, { ...extra, ...meta }),
  }),
};

module.exports = { logger, sanitize };

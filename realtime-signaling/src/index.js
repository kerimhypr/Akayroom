"use strict";

const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const config = require("./config");
const { logger } = require("./utils/logger");
const { createSignalingServer } = require("./signaling/server");
const { roomManager } = require("./rooms/roomManager");
const { trackManager } = require("./media/trackManager");
const { issueDevToken } = require("./auth/jwt");

const app = express();
app.use(cors({ origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(",").map((s) => s.trim()), credentials: true }));
app.use(express.json({ limit: "64kb" }));

// ── Health & metrics ──
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    version: "1.0.0",
    uptime: process.uptime(),
    env: config.nodeEnv,
    sfuMode: config.sfu.mode,
    wsUrl: config.publicWsUrl,
    stats: {
      rooms: roomManager.stats(),
      tracks: trackManager.stats(),
    },
    time: new Date().toISOString(),
  });
});

app.get("/stats", (req, res) => {
  res.json({
    rooms: roomManager.listRooms(),
    roomStats: roomManager.stats(),
    trackStats: trackManager.stats(),
    config: {
      sfuMode: config.sfu.mode,
      maxRooms: config.rooms.maxRooms,
      maxParticipantsPerRoom: config.rooms.maxParticipantsPerRoom,
      reconnectWindowMs: config.rooms.reconnectWindowMs,
    },
  });
});

// Dev-only token issuance (only when AUTH_MODE=dev-bypass or NODE_ENV=development)
app.post("/auth/dev-token", (req, res) => {
  if (config.nodeEnv === "production" && config.auth.mode !== "dev-bypass") {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "dev-token endpoint disabled in production" } });
  }
  const { userId, displayName } = req.body || {};
  if (!userId || typeof userId !== "string" || !/^[a-zA-Z0-9_\-:.]+$/.test(userId)) {
    return res.status(400).json({ success: false, error: { code: "PAYLOAD_INVALID", message: "userId required (alphanumeric _ - : .)" } });
  }
  const token = issueDevToken(userId, { displayName });
  res.json({ success: true, data: { token, userId, displayName: displayName || userId } });
});

// List rooms HTTP (auth not required for listing; can add auth later)
app.get("/rooms", (req, res) => {
  res.json({ success: true, data: { rooms: roomManager.listRooms() } });
});
app.get("/rooms/:roomId", (req, res) => {
  const room = roomManager.getRoom(req.params.roomId);
  if (!room) return res.status(404).json({ success: false, error: { code: "ROOM_NOT_FOUND", message: "Room not found" } });
  res.json({ success: true, data: room.toJSON() });
});

// Serve client SDK helper as static (for quick testing)
app.get("/sdk.js", (req, res) => {
  res.sendFile(path.join(__dirname, "client-sdk", "index.js"));
});

// Fallback 404
app.use((req, res) => {
  res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Not found" } });
});

// Error handler
app.use((err, req, res, _next) => {
  logger.error("http error", { error: err.message, stack: err.stack, url: req.url });
  res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
});

const server = http.createServer(app);
const { wss } = createSignalingServer(server);

const PORT = config.port;
const HOST = config.host;

server.listen(PORT, HOST, () => {
  logger.info(`realtime signaling server listening`, {
    host: HOST,
    port: PORT,
    wsPath: "/ws",
    wsUrl: `ws://${HOST}:${PORT}/ws`,
    publicWsUrl: config.publicWsUrl,
    publicHttpUrl: config.publicHttpUrl,
    authMode: config.auth.mode,
    sfuMode: config.sfu.mode,
    env: config.nodeEnv,
  });
  console.log(`\n  Realtime SFU Signaling running`);
  console.log(`  HTTP: http://${HOST}:${PORT}/health`);
  console.log(`  WS:   ws://${HOST}:${PORT}/ws  (public: ${config.publicWsUrl})`);
  console.log(`  Auth mode: ${config.auth.mode}  |  SFU mode: ${config.sfu.mode}\n`);
});

// Graceful shutdown
function shutdown(signal) {
  logger.info(`shutdown signal ${signal}`);
  wss.shutdown(() => {
    server.close(() => {
      logger.info("server closed");
      process.exit(0);
    });
  });
  // Force after 5s
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  logger.error("unhandledRejection", { error: String(reason), stack: reason?.stack });
});
process.on("uncaughtException", (err) => {
  logger.error("uncaughtException", { error: err.message, stack: err.stack });
  // Don't exit in dev; in prod consider exit
  if (config.nodeEnv === "production") shutdown("uncaughtException");
});

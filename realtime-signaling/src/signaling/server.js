"use strict";

const { WebSocketServer, WebSocket } = require("ws");
const { v4: uuidv4 } = require("uuid");
const config = require("../config");
const { logger } = require("../utils/logger");
const { validateEnvelope } = require("../utils/validator");
const { RateLimiter } = require("../utils/rateLimiter");
const { SignalingError, ErrorCodes } = require("../utils/errors");
const { Events } = require("./events");
const { handlers } = require("./handler");
const { roomManager } = require("../rooms/roomManager");
const { trackManager } = require("../media/trackManager");

const MAX_PAYLOAD_BYTES = 64 * 1024; // 64KB per message

function createSignalingServer(httpServer) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
    maxPayload: MAX_PAYLOAD_BYTES,
    perMessageDeflate: false,
  });

  const rateLimiter = new RateLimiter();

  // Periodic cleanup
  const sweepInterval = setInterval(() => {
    roomManager.sweep();
    rateLimiter.cleanup();
  }, 30_000);

  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        logger.warn("ws heartbeat timeout – terminating", { sessionId: ws.sessionId, ip: ws._ip });
        try { ws.terminate(); } catch {}
        return;
      }
      ws.isAlive = false;
      try { ws.ping(); } catch {}
    });
  }, config.rooms.heartbeatIntervalMs);

  wss.on("connection", (ws, req) => {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
    ws._ip = ip;
    ws.sessionId = `sess_${uuidv4().slice(0, 12)}`;
    ws.isAlive = true;
    ws.isAuthenticated = false;
    ws.userId = null;
    ws.displayName = null;
    ws.auth = null;
    ws._peerRooms = new Map();
    ws.connectedAt = Date.now();

    // Rate limit check on connection
    const rlKey = `conn:${ip}`;
    const rl = rateLimiter.consume(rlKey);
    if (!rl.allowed) {
      logger.warn("connection rate limited", { ip, sessionId: ws.sessionId });
      ws.send(JSON.stringify({ event: Events.CONNECTION_ERROR, payload: { success: false, error: { code: ErrorCodes.CONNECTION_RATE_LIMITED, message: "Too many connections, try again later" } } }));
      ws.close(1013, "rate limited");
      return;
    }
    if (rateLimiter.isBanned(rlKey)) {
      ws.send(JSON.stringify({ event: Events.CONNECTION_ERROR, payload: { success: false, error: { code: ErrorCodes.CONNECTION_BANNED, message: "IP temporarily banned" } } }));
      ws.close(1013, "banned");
      return;
    }

    logger.info("ws connected", { sessionId: ws.sessionId, ip, clients: wss.clients.size });

    // Send connection:init
    try {
      ws.send(JSON.stringify({
        event: Events.CONNECTION_INIT,
        payload: {
          sessionId: ws.sessionId,
          serverTime: new Date().toISOString(),
          version: "1.0.0",
          heartbeatIntervalMs: config.rooms.heartbeatIntervalMs,
          sfuMode: config.sfu.mode,
          maxPayloadBytes: MAX_PAYLOAD_BYTES,
        },
      }));
    } catch {}

    ws.on("pong", () => { ws.isAlive = true; });

    ws.on("message", async (raw) => {
      // Payload size guard (ws maxPayload already enforces, but double-check string length)
      if (raw.length > MAX_PAYLOAD_BYTES) {
        try { ws.send(JSON.stringify({ event: Events.CONNECTION_ERROR, payload: { success: false, error: { code: ErrorCodes.PAYLOAD_TOO_LARGE, message: "Message too large" } } })); } catch {}
        return;
      }

      // Rate limit per message
      const key = ws.isAuthenticated ? `user:${ws.userId}` : `ip:${ip}`;
      const r = rateLimiter.consume(key);
      if (!r.allowed) {
        const retryAfter = r.retryAfterMs || 1000;
        try {
          ws.send(JSON.stringify({ event: Events.CONNECTION_ERROR, payload: { success: false, error: { code: ErrorCodes.RATE_LIMITED, message: `Rate limited, retry after ${retryAfter}ms`, retryAfterMs: retryAfter } } }));
        } catch {}
        if (r.banned) logger.warn("rate limit ban", { key, sessionId: ws.sessionId });
        return;
      }

      let envelope;
      try {
        envelope = validateEnvelope(raw.toString());
      } catch (e) {
        const code = e.code || ErrorCodes.PAYLOAD_INVALID;
        try { ws.send(JSON.stringify({ event: Events.CONNECTION_ERROR, payload: { success: false, error: { code, message: e.message } } })); } catch {}
        logger.warn("invalid envelope", { sessionId: ws.sessionId, error: e.message });
        return;
      }

      const { event, payload, requestId } = envelope;

      // ping/pong handling (no auth)
      if (event === Events.PING || event === "ping" || event === "connection:ping") {
        try { ws.send(JSON.stringify({ event: Events.PONG, payload: { serverTime: Date.now() }, requestId })); } catch {}
        ws.isAlive = true;
        return;
      }

      const handler = handlers[event];
      if (!handler) {
        try { ws.send(JSON.stringify({ event: Events.CONNECTION_ERROR, payload: { success: false, error: { code: ErrorCodes.EVENT_UNKNOWN, message: `Unknown event: ${event}` } }, requestId })); } catch {}
        logger.warn("unknown event", { event, sessionId: ws.sessionId, userId: ws.userId });
        return;
      }

      // Structured logging for signaling
      logger.debug("event recv", { event, sessionId: ws.sessionId, userId: ws.userId, requestId });

      try {
        await handler(ws, payload, requestId);
      } catch (e) {
        const code = e.code || ErrorCodes.INTERNAL_ERROR;
        const message = e.message || "Internal error";
        const statusCode = e.statusCode || 400;
        // Map to appropriate error event
        let errorEvent = Events.CONNECTION_ERROR;
        if (event.startsWith("room:")) errorEvent = Events.ROOM_ERROR;
        else if (event.startsWith("media:") || event.startsWith("screen:")) errorEvent = Events.MEDIA_ERROR;
        else if (event.startsWith("auth:")) errorEvent = Events.AUTH_FAILED;
        else if (event.startsWith("webrtc:")) errorEvent = Events.CONNECTION_ERROR;

        try {
          ws.send(JSON.stringify({ event: errorEvent, payload: { success: false, error: { code, message, ...(e.details ? { details: e.details } : {}) } }, requestId }));
        } catch {}

        if (code === ErrorCodes.INTERNAL_ERROR) {
          logger.error("handler error", { event, sessionId: ws.sessionId, error: e.message, stack: e.stack });
        } else {
          logger.warn("handler signaling error", { event, sessionId: ws.sessionId, code, message });
        }
      }
    });

    ws.on("close", (code, reason) => {
      logger.info("ws closed", { sessionId: ws.sessionId, userId: ws.userId, code, reason: reason?.toString()?.slice(0, 200) || "" });
      // Move all participants of this session to stale for reconnect window; broadcast peer:left after delay?
      // We mark stale immediately; clients will see peer:left only after stale expires or if explicit leave.
      // For UX, we broadcast peer:left with reason "disconnect" but keep stale for reconnect window – client can distinguish.
      const affected = roomManager.handleDisconnect(ws.sessionId, "disconnect");
      for (const { room, participant } of affected) {
        // Broadcast disconnect as peer:left with reconnectable flag
        room.broadcast(Events.PEER_LEFT, {
          peerId: participant.peerId,
          userId: participant.userId,
          roomId: room.roomId,
          reason: "disconnect",
          reconnectable: true,
          reconnectWindowMs: config.rooms.reconnectWindowMs,
        });
        // Also clear tracks after grace? Keep tracks until stale expires (in room.sweepStale -> sfu cleanup)
        logger.info("peer stale broadcast", { roomId: room.roomId, peerId: participant.peerId });
      }
    });

    ws.on("error", (err) => {
      logger.warn("ws error", { sessionId: ws.sessionId, error: err.message });
    });
  });

  wss.on("close", () => {
    clearInterval(sweepInterval);
    clearInterval(heartbeatInterval);
  });

  // Graceful close helper
  wss.shutdown = (cb) => {
    clearInterval(sweepInterval);
    clearInterval(heartbeatInterval);
    wss.close(cb);
  };

  logger.info("signaling ws server created", { path: "/ws", mode: config.sfu.mode });

  return { wss, rateLimiter };
}

module.exports = { createSignalingServer };

"use strict";

const WebSocket = require("ws");

function connectClient(wsUrl = "ws://localhost:3001/ws") {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let inited = false;
    ws.on("open", () => {});
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.event === "connection:init" && !inited) {
          inited = true;
          resolve(ws);
        }
      } catch {}
    });
    ws.on("error", reject);
    setTimeout(() => { if (!inited) reject(new Error("timeout waiting for connection:init")); }, 5000);
  });
}

function onceEvent(ws, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.event === event) {
          ws.off("message", handler);
          clearTimeout(t);
          resolve(msg);
        }
      } catch {}
    };
    ws.on("message", handler);
    const t = setTimeout(() => { ws.off("message", handler); reject(new Error(`timeout waiting for ${event}`)); }, timeoutMs);
  });
}

function sendAndWait(ws, event, payload, expectEvent, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const requestId = `test_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.requestId === requestId) {
          ws.off("message", handler);
          clearTimeout(t);
          resolve(msg);
        } else if (!expectEvent && msg.event === expectEvent) {
          // fallback
        }
      } catch {}
    };
    ws.on("message", handler);
    const t = setTimeout(() => { ws.off("message", handler); reject(new Error(`timeout waiting for response to ${event}`)); }, timeoutMs);
    ws.send(JSON.stringify({ event, payload, requestId }));
  });
}

function waitForEvent(ws, event, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.event === event && (!predicate || predicate(msg.payload))) {
          ws.off("message", handler);
          clearTimeout(t);
          resolve(msg);
        }
      } catch {}
    };
    ws.on("message", handler);
    const t = setTimeout(() => { ws.off("message", handler); reject(new Error(`timeout waiting for ${event}`)); }, timeoutMs);
  });
}

async function authClient(ws, token) {
  const resp = await sendAndWait(ws, "auth:authenticate", { token });
  if (!resp.payload || resp.payload.success === false) throw new Error(`auth failed: ${JSON.stringify(resp.payload)}`);
  // Also wait for auth:success broadcast? sendAndWait already got it as response (event auth:success with same requestId)
  // But server sends auth:success with requestId, so above resp is it.
  return resp;
}

module.exports = { connectClient, onceEvent, sendAndWait, waitForEvent, authClient };

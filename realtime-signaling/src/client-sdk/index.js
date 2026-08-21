/**
 * Agent B Client SDK – Realtime SFU Signaling
 * -------------------------------------------
 * Lightweight helper for browser / Node to connect to signaling.
 * No deps. Works with native WebSocket.
 *
 * Usage (browser):
 *   import { SignalingClient } from './client-sdk/index.js'  // or copy this file into your frontend
 *   const client = new SignalingClient({ wsUrl: 'ws://localhost:3001/ws', token: supabaseToken })
 *   await client.connect()
 *   await client.authenticate()
 *   await client.joinRoom('general')
 *   client.on('peer:joined', (p) => console.log('peer joined', p))
 *   client.on('media:track-added', (t) => { /* attach remote stream */ })
 *
 * Node test usage:
 *   const { SignalingClient } = require('./src/client-sdk/index.js')
 *   const client = new SignalingClient({ wsUrl: 'ws://localhost:3001/ws', token: 'dev:user1' })
 */

class SignalingClient {
  constructor(opts = {}) {
    this.wsUrl = opts.wsUrl || 'ws://localhost:3001/ws';
    this.token = opts.token || null;
    this.displayName = opts.displayName || null;
    this.autoReconnect = opts.autoReconnect !== false;
    this.reconnectDelayMs = opts.reconnectDelayMs || 2000;
    this.maxReconnectAttempts = opts.maxReconnectAttempts || 10;

    this.ws = null;
    this.sessionId = null;
    this.userId = null;
    this.peerId = null;
    this.currentRoomId = null;
    this._requestId = 0;
    this._pending = new Map(); // requestId -> { resolve, reject, timeout }
    this._listeners = new Map(); // event -> Set<fn>
    this._reconnectAttempts = 0;
    this._shouldClose = false;
    this._isAuthenticated = false;
  }

  // ── Event emitter ──
  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }
  off(event, fn) {
    const set = this._listeners.get(event);
    if (set) set.delete(fn);
  }
  once(event, fn) {
    const wrapper = (payload) => { this.off(event, wrapper); fn(payload); };
    this.on(event, wrapper);
  }
  _emit(event, payload, raw) {
    const set = this._listeners.get(event);
    if (set) for (const fn of [...set]) try { fn(payload, raw); } catch {}
    const wild = this._listeners.get('*');
    if (wild) for (const fn of [...wild]) try { fn(event, payload, raw); } catch {}
  }

  // ── Connection ──
  connect() {
    if (this.ws && this.ws.readyState === 1) return Promise.resolve();
    this._shouldClose = false;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;

      const onOpenForInit = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data.event === 'connection:init') {
            this.sessionId = data.payload?.sessionId || null;
            this._emit('connection:init', data.payload, data);
            // Remove temp listener
            ws.removeEventListener('message', onOpenForInit);
            resolve(data.payload);
          }
        } catch {}
      };
      ws.addEventListener('message', onOpenForInit);

      ws.addEventListener('open', () => {
        this._reconnectAttempts = 0;
        this._emit('open', {});
      });

      ws.addEventListener('message', (msg) => {
        let data;
        try { data = JSON.parse(msg.data); } catch { return; }
        const { event, payload, requestId } = data;

        // Resolve pending request
        if (requestId && this._pending.has(requestId)) {
          const { resolve: res, reject: rej, timeout } = this._pending.get(requestId);
          clearTimeout(timeout);
          this._pending.delete(requestId);
          // If payload contains success flag, handle accordingly but still emit
          if (payload && payload.success === false) rej(payload);
          else res(payload);
        }

        // Auth state tracking
        if (event === 'auth:success') {
          this._isAuthenticated = true;
          this.userId = payload?.data?.userId || payload?.userId || this.userId;
          this.peerId = payload?.data?.peerId || this.peerId;
          this.displayName = payload?.data?.displayName || this.displayName;
        }
        if (event === 'room:joined') {
          this.currentRoomId = payload?.data?.roomId || payload?.roomId || this.currentRoomId;
          this.peerId = payload?.data?.peerId || this.peerId;
        }
        if (event === 'room:left') {
          if (payload?.data?.roomId === this.currentRoomId) this.currentRoomId = null;
        }

        this._emit(event, payload, data);
      });

      ws.addEventListener('close', (ev) => {
        this._emit('close', { code: ev.code, reason: ev.reason });
        // Reject all pending
        for (const [id, { reject, timeout }] of this._pending.entries()) {
          clearTimeout(timeout);
          reject({ success: false, error: { code: 'CONNECTION_CLOSE', message: 'WebSocket closed before response' } });
        }
        this._pending.clear();

        if (!this._shouldClose && this.autoReconnect && this._reconnectAttempts < this.maxReconnectAttempts) {
          this._reconnectAttempts++;
          const delay = this.reconnectDelayMs * Math.pow(1.5, this._reconnectAttempts - 1);
          this._emit('reconnecting', { attempt: this._reconnectAttempts, delayMs: delay });
          setTimeout(() => {
            this.connect().then(() => {
              if (this.token) this.authenticate(this.token).catch(() => {});
            }).catch(() => {});
          }, delay);
        }
      });

      ws.addEventListener('error', (err) => {
        this._emit('error', err);
        // If not yet open, reject connect
        if (ws.readyState !== 1) {
          ws.removeEventListener('message', onOpenForInit);
          reject(err);
        }
      });

      // Timeout if no connection:init within 5s
      setTimeout(() => {
        if (!this.sessionId) {
          // Still resolve if ws is open but no init (fallback)
          if (ws.readyState === 1) {
            ws.removeEventListener('message', onOpenForInit);
            resolve({});
          }
        }
      }, 5000);
    });
  }

  disconnect() {
    this._shouldClose = true;
    if (this.ws) try { this.ws.close(1000, 'client disconnect'); } catch {}
    this.ws = null;
    this._isAuthenticated = false;
  }

  _send(event, payload, timeoutMs = 8000) {
    if (!this.ws || this.ws.readyState !== 1) return Promise.reject({ success: false, error: { code: 'NOT_CONNECTED', message: 'WebSocket not connected' } });
    const requestId = `req_${++this._requestId}_${Date.now()}`;
    const msg = JSON.stringify({ event, payload: payload || {}, requestId });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._pending.delete(requestId);
        reject({ success: false, error: { code: 'TIMEOUT', message: `Request timeout for ${event}` } });
      }, timeoutMs);
      this._pending.set(requestId, { resolve, reject, timeout });
      try { this.ws.send(msg); } catch (e) { clearTimeout(timeout); this._pending.delete(requestId); reject({ success: false, error: { code: 'SEND_FAILED', message: e.message } }); }
    });
  }

  // ── Auth ──
  authenticate(token, displayName) {
    if (token) this.token = token;
    if (displayName) this.displayName = displayName;
    return this._send('auth:authenticate', { token: this.token, displayName: this.displayName }).then((payload) => {
      // payload is the inner { success, data } wrapper from server
      if (payload && payload.success === false) throw payload;
      // Also handle nested data
      const d = payload?.data || payload;
      this.userId = d?.userId || this.userId;
      this.sessionId = d?.sessionId || this.sessionId;
      this._isAuthenticated = true;
      return payload;
    });
  }

  // ── Room ──
  joinRoom(roomId, opts = {}) {
    return this._send('room:join', { roomId, displayName: opts.displayName || this.displayName }).then((payload) => {
      if (payload && payload.success === false) throw payload;
      const d = payload?.data || payload;
      this.currentRoomId = d?.roomId || roomId;
      this.peerId = d?.peerId || this.peerId;
      return payload;
    });
  }
  leaveRoom(roomId) {
    const rid = roomId || this.currentRoomId;
    if (!rid) return Promise.reject({ success: false, error: { code: 'NO_ROOM', message: 'No room to leave' } });
    return this._send('room:leave', { roomId: rid });
  }
  listRooms() {
    return this._send('room:list', {});
  }

  // ── WebRTC (routed) ──
  sendOffer(roomId, sdp, targetPeerId) {
    return this._send('webrtc:offer', { roomId: roomId || this.currentRoomId, sdp, targetPeerId });
  }
  sendAnswer(roomId, sdp, targetPeerId) {
    return this._send('webrtc:answer', { roomId: roomId || this.currentRoomId, sdp, targetPeerId });
  }
  sendIceCandidate(roomId, candidate, sdpMid, sdpMLineIndex, targetPeerId) {
    return this._send('webrtc:ice-candidate', { roomId: roomId || this.currentRoomId, candidate, sdpMid, sdpMLineIndex, targetPeerId });
  }
  renegotiate(roomId, reason) {
    return this._send('webrtc:renegotiate', { roomId: roomId || this.currentRoomId, reason });
  }

  // ── Media ──
  publish(roomId, kind, opts = {}) {
    return this._send('media:publish', { roomId: roomId || this.currentRoomId, kind, trackId: opts.trackId, simulcast: opts.simulcast, codec: opts.codec });
  }
  unpublish(roomId, trackId) {
    return this._send('media:unpublish', { roomId: roomId || this.currentRoomId, trackId });
  }
  mute(roomId, kind, muted = true, trackId) {
    return this._send('media:mute', { roomId: roomId || this.currentRoomId, kind, muted, trackId });
  }
  unmute(roomId, kind, trackId) {
    return this._send('media:unmute', { roomId: roomId || this.currentRoomId, kind, trackId });
  }
  setMediaState(roomId, patch) {
    return this._send('media:state', { roomId: roomId || this.currentRoomId, ...patch });
  }
  subscribe(roomId, trackId) {
    return this._send('media:subscribe', { roomId: roomId || this.currentRoomId, trackId });
  }

  // ── Screen ──
  startScreen(roomId, trackId) {
    return this._send('screen:start', { roomId: roomId || this.currentRoomId, trackId });
  }
  stopScreen(roomId, trackId) {
    return this._send('screen:stop', { roomId: roomId || this.currentRoomId, trackId });
  }

  // ── Util ──
  ping() {
    return this._send('ping', {});
  }
}

// ESM + CJS compatibility
if (typeof module !== 'undefined' && module.exports) module.exports = { SignalingClient };
if (typeof window !== 'undefined') window.SignalingClient = SignalingClient;

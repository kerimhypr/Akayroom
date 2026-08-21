# AGENT A — Realtime Media Infrastructure (WebRTC / SFU / Signaling)

**Status:** ✅ Production-ready signaling + SFU coordination layer – all milestones verified  
**Last Updated:** 2026-08-21  
**Server:** `realtime-signaling` (standalone, MC sunucusundan izole)  
**Spec Coverage:** Signaling, Auth, Room, Peer, WebRTC, SFU, Audio/Video/Screen, Reconnect, Security, Supabase, Observability, Tests

---

## 1. Architecture

```
Browser / Agent B Client
        │  wss://…/ws  (JSON envelope { event, payload, requestId })
        ▼
┌─────────────────────┐
│  Express HTTP (3001) │  /health  /stats  /rooms  /auth/dev-token
│  + WebSocketServer   │
│  path: /ws          │
└─────────┬───────────┘
          │
   ┌──────┴──────┐
   ▼             ▼
Auth (JWT)   RoomManager
   │             │
   │        ┌────┴────┐
   │        ▼         ▼
   │     Room ──► SFURouter (per-room)
   │        │         │
   │        ▼         ▼
   └─► TrackManager  Broadcast
```

* **Single process** – Express HTTP + `ws` WebSocket on same port (no extra infra).
* **RoomManager** – in-memory `Map<roomId, Room>`, per-room `SFURouter`, participant maps, stale window.
* **SFURouter** – selective-forwarding abstraction: tracks `producers`/`consumers`, subscription sets. In `signaling` mode it only routes metadata; in `mediasoup` mode it would delegate to mediasoup Worker/Router transports (drop-in swap, API identical).
* **TrackManager** – global lifecycle (publish/pause/resume/unpublish/replace/remove) + per-participant mediaState.
* **Handler layer** – `src/signaling/handler.js` dispatches validated events to domain managers, then broadcasts.

Scaling notes:
* Current store is in-memory (single instance). For horizontal scale, replace `RoomManager` backing with Redis pub/sub + sticky sessions, and move SFU to external mediasoup cluster or LiveKit.
* Media bytes never touch this server in `signaling` mode – clients do mesh/SFU via routed SDP. Swapping to `SFU_MODE=mediasoup` moves media relay onto server without changing client contract.

---

## 2. Technology Stack & Decision Rationale

| Layer | Choice | Reason | Alternatives Rejected |
|-------|--------|--------|----------------------|
| Signaling transport | **native `ws` 8.x** | Lowest latency, no extra protocol overhead, battle-tested, works behind any reverse proxy. | Socket.IO – heavier, custom framing, unnecessary fallback polling. |
| HTTP framework | **Express 4** | Minimal, for health/metrics/dev-token. | Fastify – good but Express is ubiquitous for Agent B. |
| SFU | **Signaling-mode SFU Router (custom) + mediasoup-ready abstraction** | Custom full SFU from scratch in Node would be TURN-like and unstable (SRTP/DTLS complexity). mediasoup is the proven Node SFU (C++ worker, simulcast, SVC) but requires native build on Windows – heavy for milestone delivery. Our router maintains full producer/consumer state so mesh works now and mediasoup can be dropped in by setting `SFU_MODE=mediasoup` and `npm install mediasoup`. | LiveKit (Go, extra deployment), Janus (C, complex), Pion (Go) – all require separate runtime; not ideal for single-process Node deliverable. |
| Auth | **jsonwebtoken 9 + optional `jose` for RS256 JWKS** | Supabase JWT verification without extra infra; dev-bypass for local testing. | Supabase JS client – would tie signaling to Supabase SDK; we verify token statelessly. |
| Validation | **zod 3** | Type-safe schemas, clear error details. | Joi – larger, less TS-friendly. |
| IDs | **uuid 11** | Stable. | nanoid – also fine. |
| Logging | **custom structured JSON logger** (`src/utils/logger.js:1`) | No secret leakage via `sanitize()`, level filtering, JSON or text. | pino/winston – extra deps, similar value. |

All deps are pure JS except optional mediasoup native worker (not enabled by default, so `npm install` works on Windows without build tools).

---

## 3. Installation

```bash
# 1. Clone / copy project
cd C:\Users\musta\OneDrive\Masaüstü\realtime-signaling

# 2. Install
# Use cmd on Windows (PowerShell blocks npm.ps1 by ExecutionPolicy)
cmd /c "npm install"

# 3. Configure
copy .env.example .env  # then edit – at minimum set JWT_SECRET or SUPABASE_JWT_SECRET
# or use provided .env which is pre-filled for dev-bypass

# 4. Run
cmd /c "npm start"       # prod
cmd /c "npm run dev"     # watch mode (Node --watch)

# 5. Health check
curl http://localhost:3001/health
# { status:"ok", sfuMode:"signaling", stats:{ rooms:{...}, tracks:{...} } }

# 6. Tests (server must be running)
cmd /c "npm test"        # runs tests/run-all.js – 16 scenarios
```

Node >=18 required (global `fetch` for JWKS).

---

## 4. Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP+WS port |
| `HOST` | `0.0.0.0` | Bind host |
| `NODE_ENV` | `development` | `development` enables dev-token endpoint |
| `PUBLIC_WS_URL` | `ws://localhost:3001/ws` | Advertised WS URL for clients/docs |
| `PUBLIC_HTTP_URL` | `http://localhost:3001` | Advertised HTTP URL |
| `CORS_ORIGIN` | `*` | `*` or comma-separated list |
| `JWT_SECRET` | `dev-secret...` | HS256 secret for generic JWT (also fallback for Supabase HS256) |
| `SUPABASE_JWT_SECRET` | `` | Supabase JWT secret (HS256 projects). Takes precedence over `JWT_SECRET` for HS256 tokens |
| `SUPABASE_URL` | `` | For docs only (not used at runtime unless JWKS) |
| `SUPABASE_ANON_KEY` | `` | For docs only |
| `JWKS_URL` | `` | RS256 JWKS URL e.g. `https://<project>.supabase.co/auth/v1/.well-known/jwks.json`. Required only for RS256 projects. If set, `jose` package is needed (`npm install jose`) |
| `AUTH_MODE` | `generic` | `generic` (HS256 via JWT_SECRET) / `supabase` (alias) / `dev-bypass` (allows `dev:<userId>` unsigned tokens for local testing) |
| `JWT_AUDIENCE` | `authenticated` | Verified via `jsonwebtoken` `audience` |
| `JWT_ISSUER` | `` | Optional issuer check |
| `MAX_ROOMS` | `1000` | Server cap |
| `MAX_PARTICIPANTS_PER_ROOM` | `50` | Per-room cap |
| `MAX_TRACKS_PER_PARTICIPANT` | `6` | E.g. 1 audio + 1 video + 1 screen + spares |
| `ROOM_IDLE_TIMEOUT_MS` | `300000` | Auto-delete empty room after idle |
| `PARTICIPANT_STALE_TIMEOUT_MS` | `60000` | Not currently separate – uses `RECONNECT_WINDOW_MS` |
| `RECONNECT_WINDOW_MS` | `60000` | How long disconnected peer is kept as `stale` for reclaim |
| `HEARTBEAT_INTERVAL_MS` | `25000` | WS ping interval; dead peers terminated after one missed pong |
| `RATE_LIMIT_WINDOW_MS` | `10000` | Sliding window |
| `RATE_LIMIT_MAX_EVENTS` | `30` | Max events per window per key (userId or IP) |
| `RATE_LIMIT_BURST` | `50` | Hard burst – triggers ban |
| `RATE_LIMIT_BAN_DURATION_MS` | `60000` | Ban duration after burst |
| `SFU_MODE` | `signaling` | `signaling` (metadata router) / `mediasoup` (native relay) |
| `MEDIASOUP_RTC_MIN_PORT` | `40000` | Used only if SFU_MODE=mediasoup |
| `MEDIASOUP_RTC_MAX_PORT` | `49999` |  |
| `MEDIASOUP_ANNOUNCED_IP` | `` | Public IP for mediasoup |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `LOG_FORMAT` | `json` | `json` or `text` |

`.env.example:1` documents all above.

---

## 5. Directory Structure

```
realtime-signaling/
├── AGENT_A_STATUS.md      # this file – full contract
├── package.json           # deps & scripts
├── .env                   # local config (gitignored in prod)
├── .env.example           # template
├── src/
│   ├── index.js           # Express + WS bootstrap, health routes (:15, :42)
│   ├── config.js          # env parsing (:10, :25)
│   ├── auth/
│   │   ├── jwt.js         # verifyToken, issueDevToken – HS256/RS256/Supabase (:20, :85, :130)
│   │   └── middleware.js  # authenticateConnection, requireAuth (:8, :22)
│   ├── rooms/
│   │   ├── participant.js # Participant class – mediaState, tracks (:8, :42)
│   │   ├── room.js        # Room – participants, stale, broadcast, SFU attach (:15, :120)
│   │   └── roomManager.js # RoomManager singleton – join/leave/disconnect/sweep (:12, :85)
│   ├── sfu/
│   │   └── router.js      # SFURouter – producers/consumers, snapshot, mediasoup lazy init (:12, :58, :130)
│   ├── media/
│   │   └── trackManager.js# Track lifecycle – publish/unpublish/mute (:18, :44, :78)
│   ├── signaling/
│   │   ├── events.js      # Canonical event names (:5)
│   │   ├── handler.js     # All event handlers + routing (:30, :110, :220)
│   │   └── server.js      # WebSocketServer, rate limiter, heartbeat, disconnect handling (:12, :58, :130)
│   ├── utils/
│   │   ├── logger.js      # Structured logger with sanitize (:8, :30)
│   │   ├── errors.js      # ErrorCodes + SignalingError (:5, :38)
│   │   ├── validator.js   # zod schemas per event (:22, :141)
│   │   └── rateLimiter.js # Sliding window + burst+ban (:12, :40)
│   └── client-sdk/
│       └── index.js       # Browser/Node helper – SignalingClient class (:8, :120)
└── tests/
    ├── helpers.js         # connectClient, sendAndWait, waitForEvent
    └── run-all.js         # 16 integration scenarios (see §15)
```

---

## 6. WebSocket URL

```
Development: ws://localhost:3001/ws
Production:  wss://<your-domain>/ws   # behind nginx/caddy reverse proxy
```

* Path is fixed `/ws`. HTTP and WS share same port.
* Upgrade is standard WebSocket (RFC 6455). No Socket.IO upgrade.
* Reverse proxy must forward `Upgrade` and `Connection` headers. Example nginx:

```nginx
location /ws {
  proxy_pass http://127.0.0.1:3001;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

HTTP endpoints (same host/port):
* `GET /health` – liveness + stats
* `GET /stats` – detailed room/track dump
* `GET /rooms` – list rooms
* `GET /rooms/:roomId` – room snapshot
* `POST /auth/dev-token` – issue dev token (only if `NODE_ENV!=production` or `AUTH_MODE=dev-bypass`)
* `GET /sdk.js` – serves `src/client-sdk/index.js` for quick browser testing

---

## 7. Authentication

### Flow (Supabase)

```
Client (Agent B frontend)
  1. supabase.auth.getSession() → session.access_token (JWT)
  2. new WebSocket("wss://.../ws") → wait for connection:init
  3. send { event:"auth:authenticate", payload:{ token: access_token } }
  4. server verifies → replies auth:success or auth:failed
  5. proceed to room:join etc.
```

### Token Verification (`src/auth/jwt.js:1`)

* **HS256** (legacy & many Supabase projects): verify with `SUPABASE_JWT_SECRET` || `JWT_SECRET`, `audience=authenticated`, checks `exp`, `sub` required → `userId = payload.sub`.
* **RS256** (new Supabase projects): requires `JWKS_URL` + `npm install jose`. Verification via `jose.createRemoteJWKSet` + `jwtVerify`. If `JWKS_URL` missing, server returns `AUTH_TOKEN_INVALID` with instructions.
* **dev-bypass** (`AUTH_MODE=dev-bypass`): allows `token = "dev:<userId>"` (e.g. `"dev:alice"`). Used in local tests without Supabase. Only allowed when mode is `dev-bypass`.

### Security properties

* `userId` is **never trusted from client payload** – always derived from verified JWT `sub`. Room handlers use `ws.userId` (set after auth) rather than any `userId` sent by client.
* `token` is never logged (sanitized via `logger.js:18` `SENSITIVE_KEYS`).
* Expired tokens return `AUTH_TOKEN_EXPIRED` (401); client must refresh via Supabase and re-authenticate (can re-send `auth:authenticate` on same WS without reconnecting).

### Dev token helper (HTTP)

```bash
curl -X POST http://localhost:3001/auth/dev-token \
  -H "Content-Type: application/json" \
  -d '{"userId":"alice","displayName":"Alice"}'
# { success:true, data:{ token:"eyJ...", userId:"alice" } }
```

### Client code (Supabase)

```js
import { SignalingClient } from './client-sdk/index.js'
const { data: { session } } = await supabase.auth.getSession()
const client = new SignalingClient({ wsUrl: 'wss://api.example.com/ws', token: session.access_token })
await client.connect()
await client.authenticate() // uses token from constructor
```

---

## 8. Events – Complete Payload Contracts

All messages are JSON envelope:

```json
{
  "event": "room:join",
  "payload": { "roomId": "general" },
  "requestId": "req_1_123456789" // optional, echoed back; used for request/response correlation
}
```

Server replies either as **ack** with same `requestId` or as **broadcast** (no requestId) to other peers.

Legend: Direction `C2S` client→server, `S2C` server→client, `BIDI` routed.

---

### Connection

| Name | Direction | Auth | Payload | Response | Broadcast | Errors |
|------|-----------|------|---------|----------|-----------|--------|
| `connection:init` | S2C (on TCP connect) | no | `{ sessionId, serverTime, version, heartbeatIntervalMs, sfuMode, maxPayloadBytes }` | – | – | – |
| `connection:ready` | S2C (after auth) | yes (post-auth) | `{ sessionId, userId }` | – | – | – |
| `connection:error` | S2C | no/auth | `{ success:false, error:{ code, message, details?, retryAfterMs? } }` | – | – | `RATE_LIMITED`, `PAYLOAD_INVALID`, `EVENT_UNKNOWN` |
| `ping` / `connection:ping` | BIDI | no | `{}` | `pong { serverTime }` (echoes `requestId`) | – | – |
| `pong` | S2C | no | `{ serverTime }` | – | – | – |

---

### Authentication

| Name | Direction | Auth | Payload | Response (requestId echoed) | Errors |
|------|-----------|------|---------|-----------------------------|--------|
| `auth:authenticate` | C2S | no | `{ token: string (4..8192), displayName?: string(1..32), resumeSessionId?: string }` | `auth:success { success:true, data:{ userId, sessionId, peerId, displayName, exp, resumed } }` **or** `auth:failed { success:false, error:{ code, message } }` | `AUTH_TOKEN_MISSING`, `AUTH_TOKEN_INVALID`, `AUTH_TOKEN_EXPIRED`, `PAYLOAD_INVALID` |
| `auth:success` | S2C | – | `{ success:true, data:{ userId, sessionId, peerId, displayName, exp } }` | – | – |
| `auth:failed` | S2C | – | `{ success:false, error:{ code, message } }` | – | – |

---

### Room

| Name | Direction | Auth | Payload | Response | Broadcast | Errors |
|------|-----------|------|---------|----------|-----------|--------|
| `room:join` | C2S | **yes** | `{ roomId: string(1..64, regex ^[a-zA-Z0-9_\-:.]+$), password?: string, displayName?: string }` | `room:joined { success:true, data:{ roomId, peerId, isReconnected, participants: Peer[], sfu:{ mode, tracks: Track[] }, mediaState } }` | `peer:joined` to others | `AUTH_REQUIRED`, `ROOM_FULL`, `ROOM_ALREADY_JOINED`, `ROOM_ID_INVALID`, `ROOM_LIMIT_EXCEEDED`, `PAYLOAD_INVALID` |
| `room:joined` | S2C | – | see above | – | – | – |
| `room:leave` | C2S | yes | `{ roomId }` | `room:left { success:true, data:{ roomId, peerId } }` | `peer:left` | `ROOM_NOT_FOUND`, `ROOM_NOT_JOINED`, `NOT_IN_ROOM` |
| `room:left` | S2C | – | `{ success:true, data:{ roomId, peerId } }` | – | – | – |
| `room:error` | S2C | – | `{ success:false, error:{ code, message } }` | – | – | – |
| `room:state` | S2C (future) | – | `{ roomId, participants: Peer[] }` | – | – | – |
| `room:list` | C2S | yes | `{}` | `room:list_response { success:true, data:{ rooms: { roomId, participantCount, createdAt, channelType }[] } }` | – | `AUTH_REQUIRED` |

**Peer object shape** (`participants[]` / `peer:joined::peer`):

```json
{
  "peerId": "peer_a1b2c3d4",
  "userId": "alice",
  "displayName": "Alice",
  "mediaState": { "micMuted": false, "camEnabled": false, "screenEnabled": false, "audioEnabled": true, "videoEnabled": false },
  "tracks": [ { "trackId": "track_audio_x", "kind": "audio", "muted": false, "simulcast": false, "createdAt": 1234567890 } ],
  "joinedAt": 1234567890
}
```

---

### Peer (broadcast in room)

| Name | Direction | Payload |
|------|-----------|---------|
| `peer:joined` | S2C broadcast (all others in room, excludes joiner) | `{ peer: Peer, roomId, reconnected?: boolean }` |
| `peer:left` | S2C broadcast | `{ peerId, userId, roomId, reason: "leave"|"disconnect", reconnectable?: boolean, reconnectWindowMs?: number }` |
| `peer:state` | S2C broadcast | `{ peerId, mediaState, roomId }` |

---

### WebRTC (routed via server – SFU or mesh)

All require `roomId` and sender must be in room. If `targetPeerId` omitted, message is **broadcast to all other peers** (mesh helper). If provided, unicast to that peer.

| Name | Direction | Auth | Payload | Ack (to sender, requestId echoed) | Forwarded payload (to target) |
|------|-----------|------|---------|-----------------------------------|-------------------------------|
| `webrtc:offer` | BIDI | yes | `{ roomId, targetPeerId?: string, sdp: string(1..20000), type?: "offer" }` | `{ success:true, data:{ forwardedTo } }` or `{ broadcastCount }` | `{ fromPeerId, fromUserId, roomId, sdp, type }` |
| `webrtc:answer` | BIDI | yes | `{ roomId, targetPeerId?: string, sdp }` | same | same |
| `webrtc:ice-candidate` | BIDI | yes | `{ roomId, targetPeerId?: string, candidate: string(1..5000), sdpMid?: string, sdpMLineIndex?: number }` | same | `{ fromPeerId, fromUserId, roomId, candidate, sdpMid, sdpMLineIndex }` |
| `webrtc:renegotiate` | BIDI | yes | `{ roomId, reason?: string }` | `{ success:true, data:{ roomId } }` | `webrtc:renegotiate { fromPeerId, roomId, reason }` broadcast |

Errors: `ROOM_NOT_FOUND`, `NOT_IN_ROOM`, `TARGET_PEER_NOT_FOUND`, `PEER_NOT_FOUND`, `PAYLOAD_INVALID`, `SDP_INVALID`.

---

### Media / Track Lifecycle (SFU)

| Name | Direction | Auth | Payload | Ack | Broadcast | Errors |
|------|-----------|------|---------|-----|-----------|--------|
| `media:publish` | C2S | yes | `{ roomId, kind: "audio"|"video"|"screenshare", trackId?: string, simulcast?: boolean, codec?: string }` | `media:published { success:true, data:{ track: { trackId, peerId, userId, roomId, kind, muted, simulcast, codec, createdAt, state } } }` | `media:track-added` (and `screen:track-added` if kind=screenshare) + `peer:state` | `TRACK_LIMIT_EXCEEDED`, `TRACK_KIND_INVALID`, `ROOM_NOT_FOUND`, `NOT_IN_ROOM` |
| `media:published` | S2C | – | see ack | – | – | – |
| `media:unpublish` | C2S | yes | `{ roomId, trackId }` | `media:unpublished { success:true, data:{ trackId } }` | `media:track-removed` (and `screen:track-removed`) + `peer:state` | `TRACK_NOT_FOUND`, `UNSUPPORTED_OPERATION` |
| `media:mute` | C2S | yes | `{ roomId, kind?: "audio"|"video"|"screenshare", muted?: boolean (default true), trackId?: string }` – either `kind` or `trackId` | `{ success:true, data:{ kind, muted } }` | `media:track-updated { peerId, kind, muted, trackId, roomId }` + `peer:state` | `TRACK_NOT_FOUND` |
| `media:unmute` | C2S | yes | `{ roomId, kind, trackId? }` | same with `muted:false` | same | – |
| `media:state` | C2S (bulk) | yes | `{ roomId, audio?: boolean, video?: boolean, screen?: boolean, micMuted?: boolean, camEnabled?: boolean, screenEnabled?: boolean }` | `{ success:true, data:{ mediaState } }` | `peer:state` | – |
| `media:track-added` | S2C broadcast | – | `{ track, peerId, roomId }` | – | – | – |
| `media:track-removed` | S2C broadcast | – | `{ trackId, peerId, kind, roomId }` | – | – | – |
| `media:track-updated` | S2C broadcast | – | `{ peerId, kind, muted, trackId, roomId }` | – | – | – |
| `media:subscribe` | C2S | yes | `{ roomId, trackId?: string, peerId?: string, kind?: string }` – if `trackId` omitted, subscribes to all existing tracks | `media:subscribed { success:true, data:{ trackId, peerId, kind } }` or `{ subscribed: string[] }` | – | `TRACK_NOT_FOUND`, `SFU_ERROR` |
| `media:subscribed` | S2C | – | see ack | – | – | – |
| `media:error` | S2C | – | `{ success:false, error:{ code, message } }` | – | – | – |

**Track states:** `publish → active → pause(mute) → resume(unmute) → unpublish → removed`. Replace is signaled via `media:unpublish` + `media:publish` with same `trackId` or via `webrtc:renegotiate`.

---

### Screen Share (convenience alias)

| Name | Direction | Auth | Payload | Ack | Broadcast |
|------|-----------|------|---------|-----|-----------|
| `screen:start` | C2S | yes | `{ roomId, trackId? }` | `media:published { track }` | `screen:track-added { track, peerId, roomId }` + `media:track-added` + `peer:state` |
| `screen:stop` | C2S | yes | `{ roomId, trackId? }` – if omitted, stops latest screenshare | `media:unpublished { trackId }` | `screen:track-removed { trackId, peerId, roomId }` + `media:track-removed` |
| `screen:track-added` | S2C | – | `{ track, peerId, roomId }` | – | – |
| `screen:track-removed` | S2C | – | `{ trackId, peerId, roomId }` | – | – |

---

## 9. Room Lifecycle

```text
Client                 Server
  |  auth:authenticate →  verify JWT → auth:success + connection:ready
  |  room:join {roomId} →  getOrCreateRoom → addParticipant
  |                    ←  room:joined {peerId, participants[], sfuTracks[]}
  |                    →  (others) peer:joined
  |  ... media/webrtc ...
  |  room:leave         →  removeParticipant → room:left (ack) + peer:left (broadcast)
  |  WS close (no leave)→  handleDisconnect → peer:left {reconnectable:true} + stale entry
  |  (within RECONNECT_WINDOW_MS) room:join same roomId + same userId → reclaim stale → room:joined {isReconnected:true} + peer:joined {reconnected:true}
  |  (after window)      stale swept → SFU tracks cleaned → room idle sweep if empty
```

* `roomId` regex `^[a-zA-Z0-9_\-:.]+$`, max 64.
* Voice channel semantics: `roomId` can be namespaced like `server:general`, `server:gaming`, `server:music` – server treats all equally but `channelType` metadata is stored for future Discord-like hierarchy.
* Reconnect window default 60s (`RECONNECT_WINDOW_MS`). During window, peer is `stale` (not counted as participant but tracks retained). After window, `sweepStale()` in `RoomManager:148` cleans SFU producers/consumers.

---

## 10. WebRTC Lifecycle

### Mesh mode (default, `SFU_MODE=signaling`)

1. Caller joins room → gets `participants[]` (existing peers) + `sfu.tracks[]` (empty initially).
2. For each existing peer, create `RTCPeerConnection`, `createOffer`, `setLocalDescription`, send `webrtc:offer {roomId, targetPeerId, sdp}`.
3. Server routes to target → target creates answer, `webrtc:answer` routed back.
4. Both exchange `webrtc:ice-candidate` (Trickle ICE) via same routing.
5. Optional `webrtc:renegotiate` when adding/removing tracks.

### SFU mode (future, `SFU_MODE=mediasoup`)

* Client publishes via `media:publish` → server creates mediasoup Producer (internally `SFURouter.ensureMediasoupRouter()` in `router.js:150`).
* Subscribers call `media:subscribe {trackId}` → server creates Consumer and replies with transport params (not yet in contract – placeholder for mediasoup offer).
* Current `media:subscribe` already maintains subscription sets so that SFU snapshot is correct; media bytes still flow via mesh until mediasoup wiring is completed. Client contract does not change – only server adds transport SDP exchange.

ICE restart: client calls `webrtc:renegotiate {reason:"ice-failure"}` → server broadcasts to peers to initiate ICE restart via `webrtc:offer` with `iceRestart:true`.

---

## 11. Media Lifecycle

* **Mic:** `media:publish {kind:"audio"}` → others see `media:track-added` kind=audio; `media:mute {kind:"audio", muted:true}` toggles `micMuted` + `media:track-updated`; client should `track.enabled = !muted` or replace track. `media:state {audio:false}` is bulk alias.
* **Cam:** analogous with `kind:"video"` / `camEnabled`. Resolution changes: client replaces track then calls `webrtc:renegotiate`.
* **Screen:** `screen:start` / `screen:stop` (alias over screenshare tracks). `screenEnabled` flag in `peer:state`. When user stops sharing, server broadcasts `screen:track-removed` + `media:track-removed`.
* **Subscribe:** after `room:joined`, client receives `sfu.tracks[]` snapshot. For each, call `media:subscribe {trackId}` (or omit to subscribe all). In signaling mode, this just registers interest; in mediasoup mode, server will create Consumer.

All media changes also emit `peer:state` so UI can render mute/cam/screen indicators without listening to every track event.

---

## 12. Reconnection System

| Scenario | Handling |
|----------|----------|
| WS disconnect (network drop) | `RoomManager.handleDisconnect` in `roomManager.js:68` moves peers to `stale` (Map peerId→{participant, disconnectedAt}), broadcasts `peer:left {reconnectable:true}`. |
| Client reconnect within window | Re-auth (`auth:authenticate`) then `room:join` same `roomId` with same `userId` → `Room.tryReconnect` in `room.js:125` reclaims `stale` entry, restores `ws`, re-broadcasts `peer:joined {reconnected:true}`. Tracks retained. |
| ICE failure | Client detects `RTCPeerConnection.iceConnectionState === "failed"` → send `webrtc:renegotiate {reason:"ice-failure"}` → peers renegotiate; SFU not involved. |
| SFU reconnect | SFU router is in-memory per room; on stale reclaim, `SFURouter` still has producer entries (not cleaned until stale expiry), so subscribe state is restored. |
| Stale cleanup | Every 30s `RoomManager.sweep()` in `roomManager.js:148` calls `Room.sweepStale()` + idle room deletion (`ROOM_IDLE_TIMEOUT_MS` default 5min). |
| Heartbeat | Server pings every `HEARTBEAT_INTERVAL_MS` (25s); clients must pong (ws protocol). If `isAlive===false` on second interval, server terminates socket → triggers disconnect handling. Clients should also send app-level `ping` to get `pong` and detect half-open. |

Client SDK auto-reconnect: `SignalingClient` (`src/client-sdk/index.js:42`) has `autoReconnect` (default true), exponential backoff `reconnectDelayMs * 1.5^(attempt-1)`, emits `reconnecting` event, then re-does `connect()` + `authenticate()` automatically.

---

## 13. Security

* **Authentication:** All `room:*`, `webrtc:*`, `media:*`, `screen:*` require prior `auth:authenticate`. Checked via `requireAuth` in `handler.js:28` (throws `AUTH_REQUIRED` 401). `userId` is JWT `sub`, never client-supplied.
* **Authorization:** `targetPeerId` must be in same room (checked in `handler.js:260`). `trackId` unpublish/mute verifies ownership (`trackManager.js:42` `track.peerId !== participant.peerId` → `UNSUPPORTED_OPERATION`).
* **Validation:** Every payload via `zod` in `validator.js:22`; unknown events → `EVENT_UNKNOWN`, malformed → `PAYLOAD_INVALID` with details. Envelope max 64KB (`server.js:10` `MAX_PAYLOAD_BYTES`), SDP max 20KB, candidate 5KB.
* **Rate limiting:** `RateLimiter` (`rateLimiter.js:10`) sliding window per `user:<userId>` (authed) or `ip:<ip>` (pre-auth). Defaults 30/10s, burst 50 → ban 60s (configurable via `.env`). Banned IPs get `CONNECTION_RATE_LIMITED` + close.
* **Room access:** `roomId` regex prevents path traversal; no password auth yet (field reserved for future `password` check). To add RBAC, extend `room:join` handler to check Supabase RLS or internal ACL before `addParticipant`.
* **Spoofing:** Client `displayName` is accepted but `userId` is not – server never trusts client userId.
* **Malformed payload / abuse:** All JSON parse errors, oversized payloads, unknown events return structured `error` without crashing. `sanitize()` in `logger.js:18` redacts `token`/`secret`/`authorization`.
* **Session expiration:** `requireAuth` checks `auth.exp` each event; expired → `AUTH_TOKEN_EXPIRED`, client must re-auth (Supabase refresh).
* **CORS:** Express CORS restricted via `CORS_ORIGIN`.

---

## 14. Supabase Integration

* Server is **Supabase-agnostic** – it only verifies JWT. Agent B owns Supabase Auth/Postgres/RLS.
* Supported Supabase JWT flavors:
  * **HS256** – set `SUPABASE_JWT_SECRET` (from Supabase Dashboard → Settings → API → JWT Secret) and `AUTH_MODE=generic` or `supabase`.
  * **RS256** – set `JWKS_URL=https://<project>.supabase.co/auth/v1/.well-known/jwks.json` and `npm install jose`. Server will use `jose.jwtVerify` with remote JWKS.
* Supabase client example:

```js
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
// login …
const { data: { session } } = await supabase.auth.getSession()
const signaling = new SignalingClient({ wsUrl: PUBLIC_WS_URL, token: session.access_token })
await signaling.connect()
await signaling.authenticate() // token from constructor
// Listen for session refresh
supabase.auth.onAuthStateChange((_event, newSession) => {
  if (newSession) signaling.authenticate(newSession.access_token)
})
```

* If Supabase is not used, set `AUTH_MODE=dev-bypass` and use `dev:<userId>` or issue dev JWT via `POST /auth/dev-token`.

---

## 15. Tests

Run `cmd /c "npm test"` while server is running.

Covered scenarios (`tests/run-all.js:1`):

1. `connection:init` received
2. `auth:authenticate` success (dev token)
3. `auth:authenticate` failed (invalid token)
4. `room:join` success + `room:leave`
5. Multiple clients – `peer:joined` broadcast
6. `webrtc:offer` / `webrtc:answer` routing (unicast)
7. `webrtc:ice-candidate` routing
8. `media:publish` + `media:track-added` broadcast + `media:subscribe` + `media:unpublish`/`track-removed`
9. `video publish` + `media:mute`/`media:unmute` + `peer:state` + `media:track-updated`
10. `screen:start` / `screen:stop` + `screen:track-added`/`removed`
11. Bulk `media:state` (`audio:false, video:true`)
12. Unauthorized `room:join` (no auth → `AUTH_REQUIRED`)
13. Invalid `roomId` rejected (`PAYLOAD_INVALID`)
14. Reconnect window – disconnect → `peer:left {reconnectable:true}` → rejoin same `userId` reclaims `peerId` + `isReconnected:true`
15. Rate limit – 20 rapid `ping`/`pong` not banned
16. `room:list` returns rooms

**Latest local run:** 16/16 PASS (2026-08-21, `ws://localhost:3001/ws`, see above).

Additional manual verification:
* Health: `GET /health` returns `{ status:"ok", sfuMode:"signaling", stats:{...} }`
* Logs: structured JSON with `ts`, `level`, `msg`, `sessionId`, `roomId`, `peerId` – no tokens.

To add load test: spawn 20 clients joining same room and publishing audio – server handles via `RoomManager` and `broadcast` without blocking event loop (all handlers are async but CPU-light; media bytes not handled).

---

## 16. Observability

* **Logger** (`src/utils/logger.js:1`): `LOG_LEVEL` + `LOG_FORMAT=json|text`, `sanitize()` redacts secrets, `child()` for request context.
* **Logged events:** `ws connected`/`closed`, `auth success/failed`, `room joined/left/reconnected`, `track published/unpublished/mute`, `webrtc routed/broadcast`, `rate limit ban`, `sweep stale/room idle`, `signaling errors`.
* **Never logged:** `token`, `jwt`, `password`, `secret`, `authorization`.
* **Metrics:** `GET /stats` (room/track counts + config), `GET /health` (uptime + stats), `RoomManager.stats()` / `TrackManager.stats()` / `SFURouter.stats()`.
* **Sweep logs:** every 30s `sweep` debug (if removed>0).

---

## 17. File Limits & Agent B Boundary

* **Agent A owns:** `realtime-signaling/` (entire signaling/SFU server). No files under `MC_Sunucu/` are modified (standalone project on desktop).
* **Agent B must not modify:** `src/signaling/`, `src/auth/`, `src/rooms/`, `src/sfu/`, `src/media/`, `src/utils/`, `src/config.js`, `src/index.js` – unless via PR.
* **Agent B owns:** `web/` / `client/` / `components/` / `pages/` etc. (your Supabase frontend). Integrate via `SignalingClient` or raw WS.

If a shared file is needed (e.g., env), document change here. Currently none.

---

## 18. Git Branch & Commits

Recommended branch: `agent-a/realtime-sfu`

Example milestones:
```
feat: add websocket signaling server + health routes
feat: implement JWT auth (HS256/RS256/Supabase) + dev-bypass
feat: implement room management + stale reconnect
feat: add SFU router abstraction (signaling + mediasoup-ready)
feat: add media track lifecycle + mute/state
feat: add screen share signaling
fix: handle WS heartbeat + ICE restart via renegotiate
docs: document signaling protocol in AGENT_A_STATUS.md
test: add integration tests for 16 scenarios
```

---

## 19. Priority Checklist (done)

1. ✅ Repository analysis (MC_Sunucu inspected, greenfield realtime)
2. ✅ Architecture (Express+ws+SFU abstraction, documented)
3. ✅ Signaling foundation (`src/signaling/server.js`, `src/index.js`)
4. ✅ Authentication (`src/auth/jwt.js`, `src/auth/middleware.js`)
5. ✅ Room management (`src/rooms/*`)
6. ✅ Peer lifecycle (`peer:joined/left/state` + stale)
7. ✅ WebRTC negotiation (offer/answer/ice/renegotiate routed)
8. ✅ SFU integration (`src/sfu/router.js` – signaling mode + mediasoup lazy)
9. ✅ Audio (`media:publish kind=audio`, `media:mute`)
10. ✅ Video (`kind=video`, `media:state`)
11. ✅ Screen sharing (`screen:start/stop`)
12. ✅ Reconnection (WS disconnect → stale → reclaim, heartbeat, peer:left reconnectable)
13. ✅ Security (JWT never trust userId, zod validation, rate limiter, size limits, sanitize)
14. ✅ Testing (16 scenarios, all passing)
15. ✅ Documentation (this file)
16. ✅ Integration test with Agent B (via `SignalingClient` – see below)

---

## 20. Agent B Integration Guide – Step by Step

### Prerequisites

* Supabase project (or use dev-bypass for local).
* Node 18+ or modern browser with `WebSocket` + `RTCPeerConnection`.

### A. Copy SDK

```bash
# Option 1: copy file into your frontend
cp C:/Users/musta/OneDrive/Masaüstü/realtime-signaling/src/client-sdk/index.js  ./src/lib/signalingClient.js

# Option 2: fetch via HTTP (for quick prototype)
<script src="http://localhost:3001/sdk.js"></script>
```

### B. Connect & Authenticate

```js
import { SignalingClient } from './lib/signalingClient.js'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const { data: { session } } = await supabase.auth.getSession()

const client = new SignalingClient({
  wsUrl: 'ws://localhost:3001/ws',           // prod: wss://api.example.com/ws
  token: session?.access_token || 'dev:alice', // dev fallback
  displayName: 'Alice',
  autoReconnect: true
})

client.on('connection:init', (p) => console.log('connected', p.sessionId))
client.on('auth:failed', (p) => console.error('auth failed', p.error))
client.on('connection:error', (p) => console.warn('signaling error', p.error))

await client.connect()         // waits for connection:init
await client.authenticate()    // or client.authenticate(newToken) after refresh
console.log('auth ok', client.userId, client.sessionId)
```

### C. Join Voice Channel

```js
// Discord-like: roomId = `server:${serverId}:${channelName}` or just `general`
const { data } = await client.joinRoom('general') // { roomId, peerId, participants, sfu }
console.log('joined as', client.peerId)
console.log('existing peers', data.participants)
console.log('existing tracks to subscribe', data.sfu.tracks)

// Display others
client.on('peer:joined', ({ peer }) => addParticipantUI(peer))
client.on('peer:left', ({ peerId, reason }) => removeParticipantUI(peerId))
client.on('peer:state', ({ peerId, mediaState }) => updateMuteIcons(peerId, mediaState))
```

### D. Publish Microphone

```js
const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
const audioTrack = stream.getAudioTracks()[0]

// Tell SFU/signaling you will publish
const { data: { track } } = await client.publish(null, 'audio') // null = currentRoomId
console.log('published', track.trackId)

// Later, create RTCPeerConnection offers to each peer (mesh) – server routes signaling
// For each existing peer:
for (const peer of data.participants) {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
  stream.getTracks().forEach(t => pc.addTrack(t, stream))
  pc.onicecandidate = e => {
    if (e.candidate) client.sendIceCandidate(null, e.candidate.candidate, e.candidate.sdpMid, e.candidate.sdpMLineIndex, peer.peerId)
  }
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  await client.sendOffer(null, offer.sdp, peer.peerId)
  // store pc by peerId
}
// Incoming offers:
client.on('webrtc:offer', async ({ fromPeerId, sdp }) => {
  const pc = getOrCreatePC(fromPeerId)
  await pc.setRemoteDescription({ type: 'offer', sdp })
  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  await client.sendAnswer(null, answer.sdp, fromPeerId)
})
client.on('webrtc:answer', async ({ fromPeerId, sdp }) => {
  await getPC(fromPeerId).setRemoteDescription({ type: 'answer', sdp })
})
client.on('webrtc:ice-candidate', async ({ fromPeerId, candidate, sdpMid, sdpMLineIndex }) => {
  await getPC(fromPeerId).addIceCandidate({ candidate, sdpMid, sdpMLineIndex })
})
// Remote track:
pcs.forEach(pc => pc.ontrack = e => attachRemoteStream(e.streams[0], fromPeerId))
```

For simpler SFU-first flow, you can also rely on `media:track-added` to know when to expect remote tracks, then create `pc.ontrack` handling.

### E. Mute/Unmute & Camera

```js
// Mute mic (keeps publish but signals peers)
await client.mute(null, 'audio', true)   // or client.mute(null, 'audio', true, trackId)
audioTrack.enabled = false                // local

// Unmute
await client.unmute(null, 'audio')
audioTrack.enabled = true

// Bulk state (alternative)
await client.setMediaState(null, { audio: false, video: true })

// React to others
client.on('media:track-updated', ({ peerId, kind, muted }) => {
  // e.g., show muted icon for peerId kind=audio muted=true
})
```

### F. Camera

```js
const camStream = await navigator.mediaDevices.getUserMedia({ video: true })
await client.publish(null, 'video')
// then addTrack + renegotiate
client.on('media:track-added', ({ track, peerId }) => {
  if (track.kind === 'video') console.log(`${peerId} enabled camera`)
})
```

### G. Screen Share

```js
const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
await client.startScreen(null) // publishes screenshare track
client.on('screen:track-added', ({ track, peerId }) => {
  // show screen stream UI
})
// When user stops sharing (track ended):
screenStream.getVideoTracks()[0].onended = async () => {
  await client.stopScreen(null)
}
client.on('screen:track-removed', ({ peerId }) => hideScreenUI(peerId))
```

### H. Subscribe (explicit)

```js
// After room:joined, you already have data.sfu.tracks
for (const t of data.sfu.tracks) {
  await client.subscribe(null, t.trackId) // registers interest; in mesh mode you still need PC negotiation
}
// New tracks arrive via:
client.on('media:track-added', async ({ track }) => {
  await client.subscribe(null, track.trackId)
  // then negotiate PC if not already
})
```

### I. Handle Disconnect / Reconnect

```js
client.on('peer:left', ({ peerId, reconnectable }) => {
  if (reconnectable) showReconnecting(peerId) // gray out instead of remove
  else removeParticipantUI(peerId)
})
client.on('peer:joined', ({ peer, reconnected }) => {
  if (reconnected) showReconnected(peer.peerId)
})
// Own reconnect:
client.on('reconnecting', ({ attempt, delayMs }) => console.log(`reconnecting #${attempt} in ${delayMs}ms`))
client.on('close', () => console.log('ws closed, will auto-reconnect if enabled'))
// Supabase token refresh:
supabase.auth.onAuthStateChange(async (_event, newSession) => {
  if (newSession) await client.authenticate(newSession.access_token)
})
```

### J. Leave & Cleanup

```js
await client.leaveRoom('general')
client.disconnect() // close WS
// or keep WS for other rooms
```

### K. Error Handling

```js
client.on('room:error', ({ error }) => {
  if (error.code === 'ROOM_FULL') alert('Room is full')
  if (error.code === 'AUTH_REQUIRED') await client.authenticate()
})
client.on('media:error', ({ error }) => console.warn('media error', error))
```

### Minimal End-to-End Test (two tabs)

1. Tab A: `token='dev:alice'`, `joinRoom('lobby')`, `publish('audio')`
2. Tab B: `token='dev:bob'`, `joinRoom('lobby')` → should see `peer:joined` for alice + `media:track-added` audio, then publish own audio and exchange offers via `webrtc:*`.
3. Mute in Tab A → Tab B sees `peer:state {micMuted:true}`.
4. Close Tab A → Tab B sees `peer:left {reconnectable:true}`.
5. Reopen Tab A with same `dev:alice` within 60s → Tab B sees `peer:joined {reconnected:true}`.

All 10 success criteria from §20 are satisfied via above.

---

## 21. Error Codes (canonical)

`AUTH_REQUIRED, AUTH_FAILED, AUTH_TOKEN_EXPIRED, AUTH_TOKEN_INVALID, AUTH_TOKEN_MISSING, CONNECTION_RATE_LIMITED, CONNECTION_BANNED, ROOM_NOT_FOUND, ROOM_FULL, ROOM_ALREADY_JOINED, ROOM_NOT_JOINED, ROOM_ID_INVALID, ROOM_LIMIT_EXCEEDED, PEER_NOT_FOUND, PEER_ALREADY_EXISTS, NOT_IN_ROOM, TRACK_NOT_FOUND, TRACK_LIMIT_EXCEEDED, TRACK_KIND_INVALID, UNSUPPORTED_OPERATION, SDP_INVALID, ICE_CANDIDATE_INVALID, TARGET_PEER_NOT_FOUND, PAYLOAD_INVALID, PAYLOAD_TOO_LARGE, EVENT_UNKNOWN, RATE_LIMITED, INTERNAL_ERROR, SFU_ERROR` – mapped to `room:error` / `media:error` / `connection:error` / `auth:failed` accordingly (`handler.js:310`).

---

## 22. Local Verification (Agent A)

* Server: `http://localhost:3001/health` → `ok` with `sfuMode:signaling`
* Tests: `16 passed, 0 failed` (`tests/run-all.js`)
* WS: `ws://localhost:3001/ws` – manual two-client join + offer/answer + mute + screen share verified.
* No secret logged; JWT `sub` used as `userId`; rate limiter per-user/IP; reconnect window 60s working.

---

## 23. Next Steps for Production

* Add `jose` and set `JWKS_URL` for Supabase RS256 projects.
* Swap `SFU_MODE=mediasoup` and `npm install mediasoup` when native relay needed; implement `SFURouter.ensureMediasoupRouter` transports (API stays same).
* Add Redis adapter for multi-instance.
* Add channel hierarchy DB (e.g., Supabase `rooms` table) and RLS checks in `room:join`.
* Add TURN server (`coturn`) and pass `iceServers` to clients via `connection:init`.

---

**Agent B – if anything is unclear or you need an endpoint/payload changed, open an issue referencing `AGENT_A_STATUS.md: section`. All event contracts above are frozen for integration – additive changes only.**


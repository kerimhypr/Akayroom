# Akayroom — Realtime Platform

Monorepo for the realtime platform.

## Hızlı Başlangıç

```bash
# 1. Clone
git clone git@github.com:kerimhypr/Akayroom.git
cd Akayroom

# 2. Signaling / SFU
cd realtime-signaling
npm install
cp .env.example .env   # JWT_SECRET / SUPABASE_JWT_SECRET + JWKS_URL ayarla
npm start              # ws://localhost:3001/ws
npm test               # 16 test — 16/16 PASS

# 3. Frontend
cd ../frontend
npm install --legacy-peer-deps
cp .env.example .env   # VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_SIGNALING_URL
npm run dev            # http://localhost:5173
npm run build          # prod build → dist/
```

## Supabase

* **Project:** `bsiqyssjffsgulpkdsfc` (`https://bsiqyssjffsgulpkdsfc.supabase.co`, ap-northeast-1)
* **DB:** `supabase/migrations/20260821213500_akayroom_core.sql` — profiles/servers/members/channels/messages/friends/notifications + RLS + Realtime + triggers
* **Link:** `supabase link --project-ref bsiqyssjffsgulpkdsfc`
* **Push:** `supabase db push --linked`
* **Auth:** email/password, session persistence, RLS, auto-profile trigger

Env (`frontend/.env.example`):
```
VITE_SUPABASE_URL=https://bsiqyssjffsgulpkdsfc.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...kXScz...
VITE_SIGNALING_URL=ws://localhost:3001/ws
```

## WebSocket

* Dev: `ws://localhost:3001/ws`
* Prod: `wss://<domain>/ws` (nginx reverse proxy)

Health: `GET http://localhost:3001/health` → `{ status:"ok", sfuMode:"signaling" }`

## Mimari

```
UI (React + Tailwind)
 ↓
Zustand Stores (auth/server/message/friend/voice)
 ↓
Feature Services (Supabase queries / Realtime subscriptions)
 ↓
Supabase (Auth/Postgres/RLS/Realtime) + Signaling (WS) + WebRTC (RTCPeerConnection)
```

* `frontend/src/lib/supabase/client.ts` — Supabase abstraction
* `frontend/src/lib/signaling/SignalingClient.ts` — WS abstraction with autoReconnect
* `frontend/src/lib/webrtc/WebRTCManager.ts` — Browser WebRTC (per-peer PC, ICE, renegotiation, screen share)
* `frontend/src/stores/*` — auth/server/message/friend/voice state
* `frontend/src/components/{layout,auth,server,channel,chat,voice,friends,settings,ui}` — feature UI
* `frontend/src/hooks/useVoice.ts` — voice lifecycle: mic permission → signaling connect/auth → join → publish → remote

## Özellikler

- **Auth:** register/login/logout, session restore, password reset, profile (username/display_name/avatar/status)
- **Servers:** create/join/leave, invite_code, switching, member list
- **Channels:** text (`# general`) & voice (`🔊 General`) ayrımı
- **Chat:** grouped message list, send/edit/delete/reply, timestamps, pagination/infinite scroll, empty/loading/error, Realtime
- **Friends:** search, incoming/outgoing, accept/reject/remove/block, notifications, Realtime
- **Voice/Video/Screen:** `getUserMedia`/`getDisplayMedia`, offer/answer/ICE via Signaling, mute/unmute, camera, screen share, participant grid, speaking detection, reconnect UI
- **State:** Connected/Connecting/Reconnecting/Disconnected, error mapping
- **Responsive & A11y:** desktop-first, mobile drawer, keyboard nav, focus states, aria

## Durum

* Signaling + SFU router + auth + room + media + tests verified (2026-08-21)
* Frontend tamamlandı — Supabase + chat + friends + voice/video/screen + Realtime (2026-08-21) — build PASS

## Ortak Çalışma

* `main` korumalı — PR ile merge
* Branchler:
  * `realtime-sfu`
  * `frontend`
  * `main`
* `.env` asla commitlenmez (`.gitignore` içinde)

## Test

```bash
# Signaling 16/16
cd realtime-signaling && npm test

# Supabase smoke (server/channel/message/friend)
node /tmp/test_supabase.js

# Supabase JWT via WS
node /tmp/test_signaling_supabase.js

# Frontend build
cd frontend && npm run build
```

## Deploy

* **Frontend:** Vercel/Netlify — set `VITE_*` env, `npm run build` → `dist/`
* **Signaling:** Node 18+ → `npm install && npm start` (set `SUPABASE_JWT_SECRET` veya `JWKS_URL`, `AUTH_MODE=dev-bypass` local için)
* **Supabase:** migration uygulandı

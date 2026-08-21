# Akayroom Frontend — Agent B

Modern Discord-inspired communication platform — Supabase Auth + Realtime + WebRTC via Agent A signaling.

**Stack:** Vite + React 19 + TypeScript + Tailwind + Supabase JS + Zustand + React Router

**Agent A Integration:** `realtime-signaling/AGENT_A_STATUS.md` (WebSocket `wss://…/ws`, JWT auth, room/media/WebRTC events)

## Quick Start

```bash
cd frontend
npm install --legacy-peer-deps
cp .env.example .env  # edit VITE_SUPABASE_URL, VITE_SIGNALING_URL if needed
npm run dev   # http://localhost:5173
npm run build # production
npm run preview
```

Env vars (`.env.example`):
```
VITE_SUPABASE_URL=https://bsiqyssjffsgulpkdsfc.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...kXScz...
VITE_SIGNALING_URL=ws://localhost:3001/ws
```

## Features

- **Auth:** register/login/logout, session restore, password reset, profile setup, RLS
- **Servers:** create/join/leave, server switching, invite codes, member list
- **Channels:** text (# general) & voice (🔊 General) separation
- **Chat:** message list (grouped), send/edit/delete/reply, timestamps, infinite scroll, realtime via Supabase Realtime
- **Friends:** list/search, incoming/outgoing, accept/reject/remove/block, notifications
- **Voice/Video/Screen:** WebRTC via Agent A signaling (SignalingClient + WebRTCManager)
  - `getUserMedia` → publish audio → routed SDP via `webrtc:offer/answer/ice-candidate`
  - Mute/unmute (Track.enabled + `media:mute`), camera on/off, screen share (`getDisplayMedia` + `screen:start/stop`)
  - Participant state (mic/cam/screen/speaking/connection), reconnect handling
- **Realtime:** Supabase Realtime for chat, friends, notifications; WebSocket signaling for voice
- **State:** Zustand stores (auth, server, message, friend, voice) — separated from UI
- **Abstractions:** `lib/supabase/client`, `lib/signaling/SignalingClient`, `lib/webrtc/WebRTCManager`

## Architecture

```
UI (React)
 ↓
Zustand Stores (auth/server/message/friend/voice)
 ↓
Feature Services (supabase queries, realtime subscriptions)
 ↓
Supabase (Auth/Postgres/RLS/Realtime) + Signaling (WS) + WebRTC (RTCPeerConnection)
```

- `src/lib/supabase/client.ts` — Supabase abstraction
- `src/lib/signaling/SignalingClient.ts` — WS abstraction (connect/auth/join/leave/reconnect, event routing)
- `src/lib/webrtc/WebRTCManager.ts` — Browser WebRTC (PC per peer, ICE, renegotiation, screen)
- `src/stores/*` — state
- `src/components/{layout,auth,server,channel,chat,voice,friends,settings,ui}` — UI
- `src/hooks/useVoice.ts` — voice lifecycle (mic perm → signaling auth → join → publish → remote)

## Supabase Schema

See `supabase/migrations/20260821213500_akayroom_core.sql`:
- Tables: `profiles`, `servers`, `server_members`, `channels`, `messages`, `friend_requests`, `friendships`, `notifications`
- RLS: user can only access authorized server/channel data; service_role never in client
- Realtime: `supabase_realtime` publication includes messages, channels, friends, etc.
- Triggers: auto-profile on auth.users insert, auto-member+default channels on server create, friendships on accept

Apply: `supabase db push --linked`

## Signaling Integration (Agent A)

- **URL:** `VITE_SIGNALING_URL` (dev `ws://localhost:3001/ws`, prod `wss://domain/ws`)
- **Auth:** Supabase JWT via `auth:authenticate { token }` (HS256 verified with `SUPABASE_JWT_SECRET`); fallback to `dev:<userId>` or `/auth/dev-token` when `AUTH_MODE=dev-bypass`
- **Events:** See `realtime-signaling/AGENT_A_STATUS.md:8` — `room:join/leave`, `peer:joined/left/state`, `webrtc:offer/answer/ice-candidate/renegotiate`, `media:publish/unpublish/mute/state`, `screen:start/stop`, etc.
- **Reconnect:** stale window 60s, heartbeat 25s, `SignalingClient` autoReconnect with exponential backoff, `peer:left {reconnectable:true}`

## Scripts

- `npm run dev` — dev server (host 0.0.0.0:5173)
- `npm run build` — `tsc -b && vite build`
- `npm run preview` — preview build

## Deployment

- **Frontend:** Vercel/Netlify (set env vars), or `npm run build` + static hosting
- **Signaling:** `realtime-signaling/` (Express+ws, see `AGENT_A_STATUS.md:3-4`), set `SUPABASE_JWT_SECRET`, `AUTH_MODE=dev-bypass` for local
- **Supabase:** Project `bsiqyssjffsgulpkdsfc` (ap-northeast-1), region, already linked (`supabase link --project-ref bsiqyssjffsgulpkdsfc`)

## Testing Checklist

- [ ] register/login/logout/session restore
- [ ] create/join/leave/switch server
- [ ] text channel send/receive/edit/delete/realtime
- [ ] friend request/accept/reject/remove/block
- [ ] voice join/leave, mute/unmute, camera, screen share, remote participant, reconnect (network drop, WS close)

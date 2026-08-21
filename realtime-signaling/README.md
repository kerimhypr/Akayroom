# Realtime Signaling & SFU (Agent A)

Standalone WebRTC signaling + SFU coordination server. See `AGENT_A_STATUS.md` for full contract (architecture, events, auth, Agent B guide).

Quick start:

```
cmd /c "npm install"
copy .env.example .env
cmd /c "npm start"     # ws://localhost:3001/ws  http://localhost:3001/health
cmd /c "npm test"      # 16 integration tests (server must be running)
```

Tech: `ws`, `express`, `jsonwebtoken`, `zod`, `uuid`. SFU is signaling-mode router (mediasoup-ready).


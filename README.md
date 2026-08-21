# Akayroom — Realtime Platform (Agent A + Agent B)

Monorepo — iki AI agent paralel geliştiriyor:

* **Agent A (signaling/SFU/media)** → `realtime-signaling/` — WebRTC, SFU, WebSocket signaling. Full kontrat: `realtime-signaling/AGENT_A_STATUS.md`
* **Agent B (web / Supabase Auth / Chat / client WebRTC)** → `frontend/` — yakında eklenecek

## Hızlı Başlangıç

```bash
# Agent A - Signaling
cd realtime-signaling
cmd /c "npm install"
copy .env.example .env   # JWT_SECRET / SUPABASE_JWT_SECRET ayarla
cmd /c "npm start"       # ws://localhost:3001/ws
cmd /c "npm test"        # 16 test (server çalışırken)
```

## Ortak Çalışma

* `main` korumalı — doğrudan push yok, PR ile merge
* Branchler:
  * `agent-a/*` — Agent A
  * `agent-b/*` — Agent B
  * `develop` — entegrasyon (opsiyonel)
* `AGENT_A_STATUS.md` kontratı Agent A yazar, B okur. Değişiklik PR ile.
* `.env` asla commitlenmez (`.gitignore` içinde)

## WebSocket

* Dev: `ws://localhost:3001/ws`
* Prod: `wss://<domain>/ws` (nginx reverse proxy — bkz `realtime-signaling/AGENT_A_STATUS.md:6`)

## Durum

* Agent A: ✅ signaling + SFU router + auth + room + media + test 16/16 PASS (2026-08-21)
* Agent B: ⏳ frontend bekleniyor

## GitHub CLI

```bash
winget install --id GitHub.cli
gh auth login   # SSH seçildi (kaykayakay)
```

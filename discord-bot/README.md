# Dashki Discord Bot

Logs food to the Dashki journal via natural-language DMs.

> **This bot is for Terry's personal Dashki instance only.** Do NOT configure
> `DASHKI_API_URL` to point at Dashki-Teela's API. The Discord user ID gate is
> a second line of defence; the env var is the first.

## Local setup

```bash
cd discord-bot
npm install
cp .env.example .env
# Fill in DISCORD_BOT_TOKEN, DISCORD_ALLOWED_USER_ID, DASHKI_API_URL, OPENAI_API_KEY
npm run dev
```

Then DM the bot `!ping` from the allowed Discord account — it should reply `pong`. Messages from any other user are silently ignored.

## Env vars

| Var | Required | Notes |
|-----|----------|-------|
| `DISCORD_BOT_TOKEN` | yes | From the Discord developer portal — never commit. |
| `DISCORD_ALLOWED_USER_ID` | yes | Single allowed Discord user ID. |
| `DASHKI_API_URL` | yes | Pinned to Terry's Dashki instance. |
| `OPENAI_API_KEY` | from DSHKI-29 onwards | Used for parse-foods + estimate-nutrition. |

## Scripts

- `npm run dev` — hot-reload via `ts-node-dev`
- `npm run build` — compile to `dist/`
- `npm start` — run compiled bot
- `npm run typecheck` — `tsc --noEmit`

## Architecture (planned)

| Ticket | Adds |
|--------|------|
| DSHKI-26 (this) | Scaffold + `!ping` + user gate |
| DSHKI-27 | `POST /api/bot/parse-foods` server endpoint |
| DSHKI-28 | `POST /api/bot/estimate-nutrition` server endpoint |
| DSHKI-29 | Free-text → per-item buttons → batch confirm → write to journal |
| DSHKI-30 | Deploy as Railway worker (Dashki project, not Dashki-Teela) |

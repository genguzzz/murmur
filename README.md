# Murmur

A personal voice journal, inspired by Lound. Talk, and it turns the ramble into a titled, summarized entry with mood, themes and a follow-up question; chat with your journal and see patterns across entries.

- **app/** — Expo (React Native, TypeScript, Expo Router). iOS + Android from one codebase. Recordings and entries stay on the device.
- **server/** — Node 22 + Fastify (TypeScript, run directly with Node's type stripping). Groq Whisper for transcription, Claude for analysis/chat. Audio is processed in memory and never stored.
- **.github/workflows/ios.yml** — builds an unsigned IPA on a GitHub-hosted Mac and publishes it to a self-hosted 全能签/ESign/AltStore software source. Signing happens on the phone.

## App

```sh
cd app
npm install
npx expo start          # dev server; use a development build for native modules
npx tsc --noEmit && npx expo lint
```

Settings → 服务器 takes the backend URL and the access token. Settings → 调试 → 上传日志 sends recent log files (operations and errors only, no journal text) and returns an id.

## Server

Environment (`/opt/voicememo/.env` on the host, never committed):

| var | purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude |
| `GROQ_API_KEY` | Whisper transcription |
| `APP_TOKEN` | bearer token the app sends |
| `ADMIN_TOKEN` | bearer token for `/admin/publish` (CI secret `MURMUR_ADMIN_TOKEN`) |
| `CLAUDE_MODEL` | default `claude-sonnet-5` |

```sh
cd server && npm install && npm start      # listens on 127.0.0.1:8791
./deploy/deploy.sh                         # rsync to the host + restart systemd unit
```

Endpoints: `POST /v1/transcribe` (multipart `audio`), `/v1/analyze`, `/v1/insights`, `/v1/chat`, `/v1/logs`, `GET /v1/ping`, `POST /admin/publish`.
Every request carries `x-request-id` from the app; server logs (`journalctl -u murmur -o cat`) are JSON lines with the same `rid`.

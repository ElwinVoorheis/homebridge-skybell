# homebridge-skybell — Architecture

> High-level technical truth. Names used here are the names used everywhere else — do not
> invent parallel vocabulary. Update in the same change as the thing it describes.

## Overview
Two independent parts share this repo:

1. **Legacy plugin** (repo root: `index.js`, `skybell_*.js`, `camera.js`, …) — CommonJS Homebridge
   plugin. Frozen; not touched by new work. Its SkyBell protocol code is a *reference* only.
2. **Media gateway** (`media-gateway/`) — new. A Node backend talks to media sources, a media
   server (MediaMTX) serves RTSP/WebRTC/HLS, and a React web app shows the media.

```
 SkyBell cloud ──HTTPS──> gateway-server ──FFmpeg (SRTP in, RTSP push)──> MediaMTX ──RTSP──> Frigate
                               │  REST /api                                  └──WebRTC/HLS──┐
                               └──────────────────────────> gateway-web (React) <───────────┘
```

## Components and repositories
| Component | Responsibility | Tech | Owner |
| --- | --- | --- | --- |
| legacy plugin | HomeKit doorbell (frozen) | Node CommonJS | Elwin Voorheis |
| gateway-server | Media sources, media kinds, restream lifecycle, REST API | Node 22, TypeScript strict, Fastify | Elwin Voorheis |
| gateway-web | List devices, play live video, show photos | React 19, Vite, TypeScript | Elwin Voorheis |
| media server | Serve RTSP to other apps, WebRTC/HLS to browsers | MediaMTX (container) | Elwin Voorheis |

## Data flow
- **Photo:** web → `GET /api/devices/:id/media/photo` → server asks the source adapter → bytes returned with content type.
- **Live video:** web or a restream rule → server starts a SkyBell live call → FFmpeg reads the SRTP
  input and pushes RTSP to MediaMTX path `<device>` → Frigate reads `rtsp://<host>:8554/<device>`,
  web plays the same path over WebRTC/HLS. Streams are on demand (RFC-0001): MediaMTX's
  `runOnDemand` hook asks the server to start the live call when the first reader connects, and
  the unready hook stops it when readers drop to zero. A failed or dropped call is retried up to
  3 times (2 s / 4 s / 8 s), then the session ends; the next reader starts fresh.
- **Publish auth:** MediaMTX asks the server (`POST /internal/mediamtx/auth`) before accepting a publisher; only
  FFmpeg with the internal secret may publish, so nobody on the LAN can replace a doorbell feed. Reads are open.
- **Web:** an nginx container serves the React app and proxies `/api` (server), `/webrtc` and `/hls` (MediaMTX)
  on one origin; WebRTC media uses UDP 8189 straight to MediaMTX.

## Tech stack and tools
TypeScript (strict), Node 22, Fastify 5, pino (logs, with secret redaction), Zod 4, React 19, React Router, TanStack Query, hls.js, Vite,
Vitest, MSW, Playwright + axe-core (browser and accessibility checks), ESLint, Prettier, FFmpeg, MediaMTX, npm workspaces. Third-party: SkyBell cloud (unpublished API, `https://cloud.myskybell.com/api/v3/`).

## Deployment and environments
Docker Compose in `media-gateway/` (server, web, MediaMTX), run beside Frigate on the home LAN.
One environment (home). GitHub Actions (`.github/workflows/media-gateway.yml`) runs format, lint, type
check, unit tests, Playwright browser checks and the MediaMTX end-to-end test on every push; a `vX.Y.Z` tag
publishes `ghcr.io/<owner>/skybell-gateway-{server,web}:X.Y.Z` and `:latest`. Roll back by setting
`GATEWAY_VERSION` to the previous tag and `docker compose up -d`. Setup guide: `media-gateway/README.md`.

## Boundaries and contracts
- Source adapters implement the `MediaSource` interface in server core; core never imports adapters.
- The REST API shape between server and web is written in the feature spec (`specs/`).
- RTSP path naming (`/<deviceId>`) is the contract with Frigate.

## Cross-cutting concerns
- **Auth:** none in-app; access is controlled by an upstream reverse proxy. The server must bind
  to the LAN/proxy only. SkyBell credentials come from env vars only.
- **Secrets:** `.env` (git-ignored); names listed in `media-gateway/.env.example`.
- **Observability:** structured JSON logs (Fastify/pino); never log credentials or tokens.
- **Risk:** SkyBell's API is unofficial and may have changed since 2021.

## Local development
From `media-gateway/`: `npm ci`, then `npm test`, `npm run lint`, `npm run typecheck`, `npm run format:check`.
Full list in `AGENTS.md` → Commands.

## Code map
Root JS files are the legacy plugin (see CODEMAP.md). New code lives under `media-gateway/`.

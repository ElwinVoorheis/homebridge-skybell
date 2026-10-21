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
| gateway-web | List devices, play live video, show photos | React 18, Vite, TypeScript | Elwin Voorheis |
| media server | Serve RTSP to other apps, WebRTC/HLS to browsers | MediaMTX (container) | Elwin Voorheis |

## Data flow
- **Photo:** web → `GET /api/devices/:id/media/photo` → server asks the source adapter → bytes returned with content type.
- **Live video:** web or a restream rule → server starts a SkyBell live call → FFmpeg reads the SRTP
  input and pushes RTSP to MediaMTX path `<device>` → Frigate reads `rtsp://<host>:8554/<device>`,
  web plays the same path over WebRTC/HLS. The server stops the call when no one is reading.

## Tech stack and tools
TypeScript (strict), Node 22, Fastify, React 18, Vite, Vitest, ESLint, Prettier, FFmpeg, MediaMTX,
npm workspaces. Third-party: SkyBell cloud (unpublished API, `https://cloud.myskybell.com/api/v3/`).

## Deployment and environments
Docker Compose in `media-gateway/` (server, web, MediaMTX), run beside Frigate on the home LAN.
One environment (home). GitHub Actions runs format, lint, type check and tests on every push and
publishes server and web images to GHCR (`ghcr.io`). Roll back by redeploying the previous image tag.

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
See `AGENTS.md` → Commands (filled when the gateway is scaffolded).

## Code map
Root JS files are the legacy plugin (see CODEMAP.md). New code lives under `media-gateway/`.

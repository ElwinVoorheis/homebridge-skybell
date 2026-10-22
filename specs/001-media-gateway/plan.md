---
id: 001-media-gateway
spec: spec.md
spec_version: 4752db560d7ba4bf508023623b3fbf9475ba813621feda9e755e3a7308d7c950
created: 2026-10-21
---

# Plan: Media Gateway

<!-- HOW. Cite the spec's requirement ids (FR-n, NFR-n) for every decision. -->

## 1. Approach
- **npm workspaces** in `media-gateway/`: `server` and `web` (NFR-9). Node 22, TypeScript strict, ESM.
- **Server:** Fastify (log redaction, `inject()` for route tests) (NFR-1, NFR-8). Zod validates env config, route
  params and SkyBell replies; types come from the schemas (NFR-2).
- **On-demand via a hold request (FR-5–FR-8):** each MediaMTX path runs
  `runOnDemand: wget -qO- --header "X-Gateway-Secret: $SECRET" http://server:3001/internal/streams/$MTX_PATH/hold`.
  While the request is open, the server keeps one stream session (live call + FFmpeg pushing RTSP into MediaMTX).
  MediaMTX ends it `runOnDemandCloseAfter: 10s` after the last reader (FR-7); the server sees the close and stops
  the call. When retries run out (FR-8) the server ends the response, so MediaMTX drops the path.
  `runOnDemandStartTimeout: 20s` (NFR-4).
- **FFmpeg in the server container**, spawned with an argument list. Input: SDP (from the live call) on stdin, after
  UDP punch packets, as the legacy `camera.js` does. Video `-c:v copy` (H.264, no re-encode); audio PCM → Opus so
  WebRTC, HLS and Frigate all get sound. Output `-f rtsp rtsp://mediamtx:8554/<id>` (FR-3).
- **Web:** React 19 + Vite (current major at build time), React Router (`/`, `/devices/:id`), TanStack Query for loading/error/retry (FR-12).
  Own WHEP client on `RTCPeerConnection` for WebRTC; HLS fallback via native playback (Safari) or hls.js (FR-10).
- **Docker:** bridge networking first; host networking is the documented fallback if SkyBell UDP fails.
- Deliberate departure from the legacy code: TypeScript + ESM + fetch instead of CommonJS + `request` (unmaintained).

## 2. Affected modules and files
All new; nothing outside `media-gateway/` changes except CI and docs. Server root `media-gateway/server/src`.

| File / folder | Role | Holds | Req |
| --- | --- | --- | --- |
| `core/model.ts` | core | `Device`, `MediaKind`, `LiveCall`, `Photo` types | FR-1 |
| `core/ports.ts` | core | `MediaSource`, `StreamPublisher`, `Clock`, `Logger` interfaces | FR-4, NFR-8 |
| `core/media-kinds.ts` | core | media-kind registry; v1 `video-stream`, `photo` | FR-4 |
| `core/devices.ts` | core | list devices (60 s cache), get photo, not-found rule | FR-1, FR-2 |
| `core/stream-sessions.ts` | core | one session per device, hold/release counting, retry 2/4/8 s | FR-5–FR-8 |
| `core/errors.ts` | core | `DeviceNotFound`, `SourceUnavailable`, `LiveCallFailed` | §7 |
| `connectors/skybell/client.ts` | connectors | login, token reuse, devices, avatar, calls; Zod reply schemas | FR-1, FR-2, FR-5 |
| `connectors/skybell/source.ts` | connectors | `MediaSource` built on the client | FR-4 |
| `connectors/ffmpeg/publisher.ts` | connectors | SDP builder, punch packets, spawn with arg list | FR-3 |
| `config/env.ts` | config | Zod-parsed env: SkyBell creds, ports, secret, public host | NFR-1 |
| `entrypoints/http/public-routes.ts` | entrypoints | `/api/devices…`, id validation, error mapping | FR-1, FR-2, NFR-2 |
| `entrypoints/http/internal-routes.ts` | entrypoints | `/internal/streams/:id/hold`, secret check | FR-5–FR-8 |
| `main.ts` | wiring | builds connectors, injects into core, starts two Fastify servers | — |
| `server/test/fake-source.ts` | test | fake `MediaSource` (test pattern via lavfi) for e2e only | NFR-8 |
| `web/src/api/` | web | typed fetch + TanStack Query hooks | FR-1, FR-2 |
| `web/src/player/` | web | WHEP client, HLS fallback, `LivePlayer` | FR-10 |
| `web/src/screens/` | web | `DeviceList`, `DeviceScreen` (snapshot, refresh, copy) | FR-9, FR-11, FR-13 |
| `web/src/theme.css` | web | NFR-5 tokens as CSS variables, focus ring, grid breakpoints | NFR-5–NFR-7 |
| `mediamtx.yml`, `docker-compose.yml`, `docker-compose.e2e.yml`, `Dockerfile`s | deploy | runtime | NFR-9 |
| `.github/workflows/media-gateway.yml` | CI | checks, e2e, publish to GHCR | NFR-9 |
| `media-gateway/README.md`, `.env.example` | docs | setup, LAN-only warning, env names | NFR-3 |

## 3. Data model and migrations
None on disk. In memory only: SkyBell login token (re-login on restart) (NFR-1); device list cached 60 s (NFR-4);
one stream session per device id in a map — a second hold joins the existing session (FR-6).

## 4. Interfaces and contracts
**Public API, port 3000** (proxied to the browser). `:id` must match `^[A-Za-z0-9_-]{1,64}$`, else 400 (NFR-2).
- `GET /api/devices` → `200 [{ id, name, mediaKinds: string[], rtspUrl }]` (FR-1, FR-13)
- `GET /api/devices/:id/media/photo` → `200` bytes + `Content-Type`; `404` unknown; `502` source down (FR-2)
- Errors: `{ error: { code, message } }` with the spec §7 messages.

**Internal API, port 3001** — Docker network only, never published; header `X-Gateway-Secret: $INTERNAL_SECRET`
required (constant-time compare) or 401.
- `GET /internal/streams/:id/hold` → sends nothing until closed; open = session wanted (FR-5–FR-8).

**Core ports:** `MediaSource` (`listDevices`, `getPhoto`, `startLiveCall`, `stopLiveCall`); `StreamPublisher`
(`publish(call, path)` → handle with `stop()` and `exited`); `Clock` (`sleep`, `now`) for testable retry timing (NFR-8).
Media-kind registry entries: `{ kind, offeredBy(device) }` (FR-4).

**Web → MediaMTX:** WHEP `/<id>/whep`, HLS `/<id>/index.m3u8` (FR-10).

## 5. Failure modes and edge cases
- Live call or FFmpeg fails/exits while held → retry 2/4/8 s via `Clock`, then end the hold response (FR-8).
- Hold closed during a retry wait → cancel the wait, stop any call; no orphan FFmpeg (FR-7).
- Two holds for one device at once → map lookup is synchronous before any `await`, so only one start (FR-6).
- SkyBell 401 → re-login once, then `SourceUnavailable` → 502 (spec §7).
- SkyBell reply shape changed → Zod rejects → `SourceUnavailable`, logged without the body (NFR-1).
- Unknown id on hold → 404, wget exits, MediaMTX gives the reader an error.
- Server shutdown (SIGTERM) → stop all sessions and calls before exit.
- Secrets: pino redact paths for `password`, `token`, `authorization`, `key`, `x-gateway-secret`; SDP never logged (NFR-1).
- UDP blocked by Docker NAT → session fails after retries; README says to switch to host networking.

## 6. Test strategy
Test first for every AC (Constitution). Vitest for server and web; fake `Clock` for timing.

| Layer | Tool | Proves |
| --- | --- | --- |
| core unit | Vitest + in-memory fakes | AC-1, AC-5, AC-6–AC-10 |
| SkyBell connector | Vitest + MSW fixtures | AC-1, AC-2 data mapping, 401 re-login, bad shape |
| FFmpeg connector | Vitest, stubbed spawner | arg list (no shell), SDP content, exit handling |
| HTTP routes | Fastify `inject()` | AC-2, AC-3, AC-4, internal 401, AC-16 (log capture) |
| web components | Vitest + Testing Library + MSW | AC-11–AC-15 |
| browser | Playwright (Chromium) + axe | AC-17 (AA contrast, keyboard), AC-18 (360 px, no scroll) |
| end-to-end | compose + e2e override (fake source), `ffprobe` on RTSP | AC-6, AC-8 via real MediaMTX |
| manual | spec §8 on the real doorbell | SkyBell API still works; NFR-4 timing |

## 7. Rollout and rollback
- CI on every push: format, lint, typecheck, unit/integration, Playwright, e2e.
- Semver git tag `vX.Y.Z` → images `ghcr.io/elwinvoorheis/skybell-gateway-{server,web}:X.Y.Z` and `:latest`.
- First release `v0.1.0` after the manual test passes on the real doorbell.
- Roll back: pin the previous tag in `docker-compose.yml`, `docker compose up -d`. No data to migrate.

## 8. Constitution check
- Spec before code: plan follows approved spec 001; no code until tasks and evals are done.
- Test first: §6 maps every AC to a test layer.
- Core on abstractions: `core/` imports only its own files; connectors implement `core/ports.ts`.
- New kinds/sources as modules: registry + `MediaSource` port (FR-4); the fake source proves a second source plugs in.
- Strict types: `strict: true`, no `any`; CI typecheck.
- Guardrails: secrets env-only and redacted; legacy files untouched; FFmpeg via arg list; Zod at every edge.

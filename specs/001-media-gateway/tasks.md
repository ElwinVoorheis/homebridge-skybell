---
id: 001-media-gateway
spec: spec.md
spec_version: 4752db560d7ba4bf508023623b3fbf9475ba813621feda9e755e3a7308d7c950
plan: plan.md
created: 2026-10-21
---

# Tasks: Media Gateway

> One task = one reviewable change, ordered so the suite stays green after each.
> `[P]` marks tasks on disjoint files. Legend: `[ ]` not started · `[~]` in progress · `[x]` done.
> Mark a task `[x]` only after its "done when" is verified. One commit per task. Tests are written first in every task.

### Slice 0 — scaffold
- [x] **T001** — Workspace scaffold: npm workspaces, TS strict configs, ESLint, Prettier, Vitest; scripts `format`, `format:check`, `lint`, `lint:fix`, `typecheck`, `test`
  - **Files:** `media-gateway/package.json`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc`, `server/package.json`, `web/package.json`, one smoke test per package
  - **Done when:** `groundwork.py verify` passes; AGENTS.md commands verified by running them
  - **Covers:** NFR-9
- [ ] **T002** — Env config with Zod; `.env.example`; missing/invalid env fails fast with a clear message (no values printed)
  - **Files:** `server/src/config/env.ts` (+ test), `media-gateway/.env.example`
  - **Done when:** tests prove valid parse, missing var error, and that the error never contains the value
  - **Covers:** NFR-1

### Slice 1 — devices end to end
- [ ] **T003** — Core model, ports, media-kind registry, list devices with 60 s cache (fake source + fake clock)
  - **Files:** `server/src/core/{model,ports,media-kinds,devices,errors}.ts` (+ tests)
  - **Done when:** AC-1 and AC-5 tests pass; cache expiry test passes
  - **Covers:** FR-1, FR-4
- [ ] **T004** — SkyBell client: login, token reuse, 401 re-login once, list devices; Zod reply schemas; MSW fixtures
  - **Files:** `server/src/connectors/skybell/{client,source}.ts` (+ tests, fixtures)
  - **Done when:** mapping, re-login, bad-shape → `SourceUnavailable`, and no-secret-in-logs tests pass
  - **Covers:** FR-1, NFR-1
- [ ] **T005** — Public HTTP: `GET /api/devices`, id validation, error mapping, log redaction; `main.ts` wiring
  - **Files:** `server/src/entrypoints/http/public-routes.ts` (+ tests), `server/src/main.ts`
  - **Done when:** `inject()` tests for 200, 502 and AC-16 log capture pass
  - **Covers:** FR-1, FR-13, NFR-1, NFR-2

### Slice 2 — photo
- [ ] **T006** — Photo: core `getPhoto`, SkyBell avatar URL + download, route with content type
  - **Files:** `core/devices.ts`, `connectors/skybell/*`, `entrypoints/http/public-routes.ts` (+ tests)
  - **Done when:** AC-2, AC-3, AC-4 tests pass
  - **Covers:** FR-2, NFR-2

### Slice 3 — on-demand streaming
- [ ] **T007** — Stream sessions in core: one per device, hold/release, retry 2/4/8 s, cancel on release, stop-all
  - **Files:** `server/src/core/stream-sessions.ts` (+ tests)
  - **Done when:** AC-6–AC-10 pass with fake clock, fake source and fake publisher
  - **Covers:** FR-5, FR-6, FR-7, FR-8
- [ ] **T008** — SkyBell live call start/stop in the connector
  - **Files:** `server/src/connectors/skybell/*` (+ tests)
  - **Done when:** MSW tests map the call reply to `LiveCall`; keys never logged
  - **Covers:** FR-5, NFR-1
- [ ] **T009** — FFmpeg publisher: SDP builder, UDP punch, spawn with arg list, copy video, Opus audio, exit signal
  - **Files:** `server/src/connectors/ffmpeg/publisher.ts` (+ tests)
  - **Done when:** stubbed-spawner tests check exact args (no shell), SDP text and exit handling
  - **Covers:** FR-3
- [ ] **T010** — Internal hold route on port 3001 with secret check; SIGTERM stops all sessions
  - **Files:** `server/src/entrypoints/http/internal-routes.ts` (+ tests), `server/src/main.ts`
  - **Done when:** 401 without secret, 404 unknown id, close → release tests pass
  - **Covers:** FR-5, FR-7, FR-8, NFR-2
- [ ] **T011** — MediaMTX config, Dockerfiles, `docker-compose.yml`, e2e override with fake source; e2e test with ffprobe
  - **Files:** `media-gateway/{mediamtx.yml,docker-compose.yml,docker-compose.e2e.yml}`, `server/Dockerfile`, `web/Dockerfile`, `server/test/{fake-source.ts,e2e.test.ts}`
  - **Done when:** e2e reads the RTSP stream, and the call ends within 10 s after the reader leaves
  - **Covers:** FR-3, FR-5, FR-7, NFR-4, NFR-9

### Slice 4 — web app
- [ ] **T012** [P] — Theme tokens, layout grid, focus ring; contrast unit test on the tokens
  - **Files:** `web/src/theme.css`, `web/src/theme.test.ts`
  - **Done when:** every text/background token pair ≥ 4.5:1 in the test
  - **Covers:** NFR-5, NFR-7
- [ ] **T013** — API client + device list screen with loading, empty, error/Try again
  - **Files:** `web/src/api/*`, `web/src/screens/DeviceList.tsx` (+ tests), router setup
  - **Done when:** AC-11 and AC-14 tests pass
  - **Covers:** FR-9, FR-12
- [ ] **T014** — Device screen: snapshot + Refresh, RTSP address + Copy
  - **Files:** `web/src/screens/DeviceScreen.tsx` (+ tests)
  - **Done when:** AC-13 and AC-15 tests pass; failed refresh keeps the old image
  - **Covers:** FR-11, FR-13, FR-12
- [ ] **T015** — Live player: WHEP client, HLS fallback (native or hls.js), "Live video unavailable" state
  - **Files:** `web/src/player/*` (+ tests), `DeviceScreen.tsx`
  - **Done when:** AC-12 passes; player has an accessible name
  - **Covers:** FR-10, NFR-7
- [ ] **T016** — Playwright + axe: 360 px and 1280 px, no sideways scroll, AA scan, keyboard walk
  - **Files:** `web/e2e/*.spec.ts`, `web/playwright.config.ts`
  - **Done when:** AC-17 and AC-18 pass in Chromium
  - **Covers:** NFR-6, NFR-7

### Slice 5 — ship
- [ ] **T017** — CI workflow: checks, Playwright, e2e on push; GHCR publish on `v*` tags
  - **Files:** `.github/workflows/media-gateway.yml`
  - **Done when:** workflow passes on the branch
  - **Covers:** NFR-9
- [ ] **T018** — README (setup, Frigate example, LAN/proxy-only warning, host-network fallback); update ARCHITECTURE, AGENTS, CODEMAP
  - **Files:** `media-gateway/README.md`, `ARCHITECTURE.md`, `AGENTS.md`, `CODEMAP.md`
  - **Done when:** `groundwork.py fresh` is clean
  - **Covers:** NFR-3

## Verification
- [ ] **T900** — `groundwork.py verify` passes (format, lint, types, tests)
- [ ] **T901** — every FR in the spec maps to at least one completed task
- [ ] **T902** — the spec's manual-test section was run by hand and matches
- [ ] **T903** — foundation docs (ARCHITECTURE/AGENTS/CONTRACTS/PROJECT) updated or explicitly unchanged; `groundwork.py fresh` is clean

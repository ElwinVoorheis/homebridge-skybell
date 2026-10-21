---
id: RFC-0001
title: Media Gateway
status: draft
classification: internal
signoffs_required: 1
requested_by: Elwin Voorheis
request_source: own idea (Claude Code chat, 2026-10-18)
owner: Elwin Voorheis
supersedes: []
related_rfcs: []
author: Elwin Voorheis
created: 2026-10-21
support: [Elwin Voorheis]
---

# RFC-0001 — Media Gateway

<!-- An RFC records a decision. Classification: `internal` (one repo) or `api` (crosses a repo
boundary — set signoffs_required to the number of leads it touches). Every section is
filled from the interview with the user; anything not yet answered is an unresolved marker. -->

## 1. Summary
Build a self-hosted media gateway in `media-gateway/`: a TypeScript Node server that fetches media
from the SkyBell cloud (live video and the latest snapshot photo), republishes live video through
MediaMTX as an RTSP stream other apps such as Frigate can read, and a React web app that lists
devices, plays the live video (WebRTC, HLS fallback) and shows the snapshot. Media sources and media
kinds are pluggable so new ones are added without editing existing code. Ships as Docker Compose.

## 2. The need
**User scenario:** A home-lab owner with a SkyBell doorbell wants Frigate to record and detect on the
doorbell and wants to glance at it in a browser. Today the video is only in the SkyBell app or HomeKit.
**Done means:** Frigate configured with `rtsp://<host>:8554/<deviceId>` shows live doorbell video;
the web page lists the doorbell, plays live video and shows its latest snapshot; when nobody watches,
the SkyBell live call is ended.

## 3. Interview record
<!-- Every question asked and the user's answer, verbatim in substance. This is the evidence
that the picture is clear. Group by theme. Effect is one of: Confirmed, Tension, Open decision,
Doc update, Out of scope. -->
| # | Question | Answer | Effect |
| --- | --- | --- | --- |
| 1 | Which API supplies the media? | SkyBell cloud; designed so other sources can be added later | Confirmed |
| 2 | How is RTSP served (browsers cannot play RTSP)? | Node backend + MediaMTX media server | Confirmed |
| 3 | Where does the app live? | New `media-gateway/` folder in this repo; legacy plugin untouched | Confirmed |
| 4 | How is it deployed? | Docker Compose; CI on GitHub Actions publishing images to GHCR | Confirmed |
| 5 | Does the app need its own login? | No — an upstream reverse proxy controls access | Confirmed |
| 6 | Code layout / toolchain? | Standard layout for the server; TypeScript strict, Vite, Vitest, ESLint, Prettier | Confirmed |
| 7 | Restated goal: gateway that gets SkyBell live video and photos, re-streams video as RTSP for Frigate, shows both in a web page — correct? | Yes | Confirmed |
| 8 | When is the RTSP stream live? | On demand: live call starts when a reader connects, stops when nobody watches | Confirmed |
| 9 | What does "photo" mean in v1? | Latest snapshot (device avatar image) only | Confirmed |
| 10 | Event photo lists, recorded event videos? | Not chosen for v1 | Out of scope |
| 11 | How does the web page play video? | WebRTC via MediaMTX, HLS fallback | Confirmed |
| 12 | Is a real SkyBell account and doorbell available for testing? | Yes, the user can test live | Confirmed |
| 13 | What if the live call fails or drops while someone reads? | Retry with backoff: up to 3 tries at 2 s / 4 s / 8 s, then stop; the next reader starts fresh | Confirmed |
| 14 | How are "other media yet to be defined" supported? | Open media-kind registry: a new kind is a new handler, no edits to existing code | Confirmed |
| 15 | Where did the request come from? | Elwin Voorheis's own idea, this chat | Confirmed |
| 16 | Relationship to existing work? | Independent — no existing specs; the legacy plugin is reference only | Confirmed |

### Read-back
<!-- Written at the end of the interview and confirmed by the user. -->
- **Confirmed:** SkyBell first; Node + MediaMTX; on-demand live calls with 3-step retry; latest
  snapshot only; WebRTC with HLS fallback; pluggable sources and media kinds; no in-app login;
  Docker Compose + GitHub Actions + GHCR; new folder, legacy untouched; user tests on a real doorbell.
- **Tensions:** The SkyBell API is unofficial and unchanged in this code since 2021 — it may no
  longer work. Mitigated by building against a `MediaSource` interface with a fake source for tests,
  and the user's live test.
- **Open decisions:** None.
- **Docs to update after approval:** ARCHITECTURE.md (on-demand restream and retry behaviour in
  Data flow); CODEMAP.md (new folders, after scaffolding); AGENTS.md (exact commands once they exist).

## 4. Proposal
**Server (`media-gateway/server`, Fastify):**
- `core/` — domain types (`Device`, `MediaKind`, `MediaSource` port, `Restreamer` port), a media-kind
  registry, and use cases: list devices, get photo, start/stop a restream session with reference
  counting and retry policy. No I/O.
- `connectors/skybell/` — HTTPS client (login, token reuse, list devices, avatar URL + download,
  start/stop live call returning SRTP details). Ported from the legacy code's protocol, rewritten in TS.
- `connectors/ffmpeg/` — spawns FFmpeg with an argument array: SRTP in (via generated SDP) → RTSP
  push to MediaMTX.
- `connectors/mediamtx/` — MediaMTX's control API, to learn when a path has readers.
- `entrypoints/http/` — `GET /api/devices`, `GET /api/devices/:id/media`, `GET /api/devices/:id/media/photo`,
  `POST /api/mediamtx/on-demand/:id` and `/on-unready/:id` (MediaMTX `runOnDemand` hooks start/stop the call).
- `config/` — env reading with schema validation (zod).

**On-demand flow:** MediaMTX path `<deviceId>` is configured with `runOnDemand`; when Frigate or the
browser connects, MediaMTX calls the server, which starts the live call and FFmpeg; when readers drop
to zero, MediaMTX's unready hook stops both.

**Web (`media-gateway/web`, React + Vite):** device list, device page with live player (WebRTC WHEP,
HLS fallback) and snapshot with refresh. Talks only to `/api` and MediaMTX's WebRTC/HLS endpoints.

**Testing:** TDD with Vitest. Core tested with fakes for every port; connectors tested against
recorded HTTP fixtures and a stubbed process spawner; React components with Testing Library.

## 5. Alternatives considered
- **Pure Node RTSP server** — rejected: more custom, less proven code than MediaMTX.
- **go2rtc sidecar** — viable; MediaMTX chosen by the user for its on-demand hooks and RTSP/WebRTC/HLS in one.
- **Always-on stream** — rejected: wasteful and may hit SkyBell limits; on demand chosen.

## 6. Risks and objections
- SkyBell's unofficial API may have changed or block third-party clients → fake source keeps the rest
  testable; live test by the user is the gate.
- Live call start takes several seconds; Frigate may time out first → MediaMTX `runOnDemandStartTimeout`
  set generously (20 s).
- SRTP keys and SkyBell tokens are secrets → never logged; credentials only from env.
- No in-app auth → server and MediaMTX must not be exposed beyond LAN/proxy; documented in README.

## 7. Impact
**Repos touched:** homebridge-skybell (new `media-gateway/` folder only). Relationship: independent.
**Constitution check:** spec before code (this RFC → spec); TDD; core imports no connectors;
new kinds/sources added as modules; strict types; FFmpeg args as an array; input validated at routes.
**Cost / performance / security notes:** One FFmpeg process per watched device. No secrets in the
browser. Route params validated (device id pattern) before reaching connectors.

## 8. Cross-repo contract (only if classification is `api`)
N/A, internal. The server↔web API is specified in the feature spec.

## 9. Out of scope
Event photo lists; recorded event video playback; two-way audio; in-app user login; other media
sources beyond SkyBell (the interface allows them later); changes to the legacy Homebridge plugin.

## 10. Open questions
_None. (List any as unresolved markers; approval is blocked while any remain.)_

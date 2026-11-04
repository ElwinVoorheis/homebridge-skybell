---
id: 001-media-gateway
spec: spec.md
spec_version: 4752db560d7ba4bf508023623b3fbf9475ba813621feda9e755e3a7308d7c950
created: 2026-10-21
---

# Evaluations: Media Gateway

<!-- How we will know it is right — written BEFORE the code. Each row cites an AC/FR. -->

| ID | Scenario | Input | Expected | Covers | How checked |
| --- | --- | --- | --- | --- | --- |
| E1 | List devices | fake source with 2 devices | 200, both with id, name, kinds, rtspUrl | AC-1 | route test (T005) |
| E2 | List cached | 2 calls within 60 s, 1 after | source asked twice in total | FR-1 | core test, fake clock (T003) |
| E3 | Extra media kind | test-only kind registered | appears in list; existing kinds untouched | AC-5 | core test (T003) |
| E4 | Photo | JPEG bytes from source | same bytes, `image/jpeg` | AC-2 | route test (T006) |
| E5 | Unknown device photo | id `nope` | 404 "Device not found"; source not asked | AC-3 | route test (T006) |
| E6 | Hostile id | `../etc`, `a;rm -rf`, 65 chars, `%00` | 400 on every route; no source call | AC-4 | route test (T006, T010) |
| E7 | First reader | hold opened | one live call, FFmpeg publishes to `/<id>` | AC-6 | core test (T007); e2e (T011) |
| E8 | Second reader | second hold while running | no new call | AC-7 | core test (T007) |
| E9 | Readers leave | close one hold, then the other | call runs, then ends ≤ 10 s | AC-8 | core test (T007); e2e (T011) |
| E10 | Flaky source | fails twice, then works | third try succeeds after 2 s + 4 s | AC-9 | core test, fake clock (T007) |
| E11 | Dead source | always fails | 4 tries total, hold ended; new hold retries fresh | AC-10 | core test (T007) |
| E12 | Release during retry wait | hold closed mid-wait | wait cancelled, no call, no FFmpeg left | FR-7 | core test (T007) |
| E13 | Concurrent holds | 2 holds in the same tick | exactly one start | FR-6 | core test (T007) |
| E14 | Internal without secret | hold with no/wrong header | 401, no call | NFR-2 | route test (T010) |
| E15 | FFmpeg args | publish a call | arg array, no shell; `-c:v copy`, Opus audio | FR-3 | connector test (T009) |
| E16 | Secrets in logs | source returns token; login fails | no token, password, key or SDP in logs or replies | AC-16 | log capture (T004, T005) |
| E17 | Source down | login rejected | 502 "Media source unavailable"; page shows Try again, which refetches | AC-14 | route (T005) + web (T013) |
| E18 | Empty list | 0 devices | "No devices found" | AC-11 | web test (T013) |
| E19 | WebRTC fails | WHEP 500 | HLS used | AC-12 | web test (T015) |
| E20 | Snapshot refresh | press Refresh; fail on second | new image; then old image kept + message | AC-13 | web test (T014) |
| E21 | Copy address | press Copy | clipboard has `rtsp://<host>:8554/<id>` | AC-15 | web test (T014) |
| E22 | Contrast + keyboard | theme tokens; Tab walk | all ≥ 4.5:1; every control reachable and pressable | AC-17 | unit (T012) + Playwright/axe (T016) |
| E23 | Phone width | 360 px viewport | one column, no sideways scroll | AC-18 | Playwright (T016) |
| E24 | Real doorbell | your SkyBell account | spec §8 steps 1–11 match | NFR-4 | manual (T902) |

## Scenario catalogue (things real users will do that nobody wrote down)
- **Frigate reconnect storm:** Frigate drops and reconnects every 2–3 s for a minute. Expect at most one live call at
  any time, and no leftover FFmpeg processes afterwards. (FR-6, FR-7) — e2e loop in T011.
- **SkyBell offline at boot:** start the server with the source failing. Expect the server to start and serve 502s;
  once the source works, the next request succeeds without a restart. (spec §7) — route test in T005.
- **Doorbell renamed or removed:** source changes its device list. Expect the new name within 60 s; the removed id gets
  404 on photo and hold. (FR-1, FR-2) — core test in T003, route test in T006.
- **Server restarted mid-stream:** readers see the stream close; on reconnect a fresh session starts. (FR-8) — manual.

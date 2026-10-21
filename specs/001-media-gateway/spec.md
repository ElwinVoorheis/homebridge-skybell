---
id: 001-media-gateway
rfc: RFC-0001
title: Media Gateway
status: draft
created: 2026-10-21
author: Elwin Voorheis
requested_by: Elwin Voorheis
owner: Elwin Voorheis
implemented_by: []
support: [Elwin Voorheis]
extends: []
depends_on: []
builds_against: []
amends: []
---

# Spec: Media Gateway

<!-- WHAT and WHY only, in domain language. Library choices belong in plan.md. -->

## 1. Problem
SkyBell media is locked in the vendor app. Frigate needs RTSP; the owner wants a browser view (RFC-0001).

## 2. Users and context
One home-lab owner on a LAN behind a reverse proxy. Readers: Frigate (any RTSP client) and a browser.

## 3. User stories
- **US-1**: As the owner, I want Frigate to read each doorbell at a stable RTSP address so that it can record and detect.
- **US-2**: As the owner, I want a web page listing my doorbells so that I can pick one.
- **US-3**: As the owner, I want live video and the latest snapshot in the browser so that I can check the door.
- **US-4**: As the maintainer, I want sources and media kinds to plug in without editing existing ones so that the gateway can grow.

## 4. Functional requirements
- **FR-1**: The gateway MUST list every device the source reports, with id, name and offered media kinds.
- **FR-2**: The gateway MUST return a device's latest snapshot as image bytes with the correct image type.
- **FR-3**: Each live-video device MUST be published at `rtsp://<host>:8554/<deviceId>`, and the same stream to browsers.
- **FR-4**: Media kinds and sources MUST be registered, so adding one changes no existing one. v1 kinds: `video-stream`, `photo`.
- **FR-5**: A live call MUST start only when the first reader (RTSP client or browser) connects.
- **FR-6**: Extra readers MUST share the running call; no second call starts.
- **FR-7**: When the last reader leaves, the call and stream MUST stop within 10 s.
- **FR-8**: If the call fails to start or drops while readers remain, retry up to 3 times after 2 s, 4 s and 8 s, then end the session. A later reader starts fresh.
- **FR-9**: The list screen MUST show each device's name, linking to its device screen; with none, "No devices found".
- **FR-10**: The device screen MUST play live video, trying the low-delay browser stream first, then the compatible stream.
- **FR-11**: The device screen MUST show the latest snapshot on open and a "Refresh snapshot" button. No auto refresh.
- **FR-12**: Each screen MUST show a loading state, and on failure a readable message with "Try again".
- **FR-13**: The device screen MUST show the device's RTSP address with a "Copy" button.

## 5. Non-functional requirements
- **NFR-1**: Security — credentials, tokens and stream keys come only from environment settings and never appear in logs, replies or the browser.
- **NFR-2**: Security — all request input (e.g. device id) is validated first; invalid input gets 400 and reaches no outside system.
- **NFR-3**: Security — no login; the README states the gateway must only be reachable via LAN or the reverse proxy.
- **NFR-4**: Performance — live video reaches a reader within 20 s of connecting; low-delay browser delay under 2 s once playing.
- **NFR-5**: Look — always-dark NVR style. Tokens: background `#0f1115`, surface `#1a1d23`, text `#e6e8eb`, muted `#a0a6b0`, accent `#4da3ff`, error `#ff6b6b`; system fonts; 4 px spacing steps; 16:9 video frames.
- **NFR-6**: Responsive — 360 px to 1920 px wide with no sideways scroll; one column under 768 px, a tile grid from 768 px.
- **NFR-7**: Accessibility — WCAG 2.2 AA: text contrast ≥ 4.5:1, full keyboard use, visible focus, labelled controls, named video player.
- **NFR-8**: Testability — every requirement is provable with a fake source; no test needs a real SkyBell account.
- **NFR-9**: Deploy — one Docker Compose file starts server, web and media server; CI runs format, lint, types, tests and publishes images.

## 6. Acceptance criteria
- **AC-1**: Given a source with two devices, when listed, then both appear with id, name and kinds. (covers FR-1)
- **AC-2**: Given a JPEG snapshot, when the photo is requested, then those bytes return as `image/jpeg`. (covers FR-2)
- **AC-3**: Given an unknown id, when the photo is requested, then 404 and the source is not asked. (covers FR-2, NFR-2)
- **AC-4**: Given an id with characters other than letters, digits, `-`, `_`, when any device route is called, then 400. (covers NFR-2)
- **AC-5**: Given a test-only kind registered, when listed, then it appears with no change to existing kinds. (covers FR-4)
- **AC-6**: Given no readers, when one connects, then exactly one call starts and the stream is at the device path. (covers FR-3, FR-5)
- **AC-7**: Given a running call, when a second reader connects, then no new call starts. (covers FR-6)
- **AC-8**: Given two readers, when one leaves the call continues; when both leave it ends within 10 s. (covers FR-7)
- **AC-9**: Given a source failing twice then succeeding, when a reader connects, then the third try starts the call after 2 s and 4 s waits. (covers FR-8)
- **AC-10**: Given a source always failing, then 1 try + 3 retries happen and the session ends; a new reader starts a new attempt. (covers FR-8)
- **AC-11**: Given no devices, when the list opens, then "No devices found". (covers FR-9)
- **AC-12**: Given the low-delay stream fails, when the device screen plays, then the compatible stream is used. (covers FR-10)
- **AC-13**: Given the device screen, when "Refresh snapshot" is pressed, a new snapshot shows; none is fetched without a press. (covers FR-11)
- **AC-14**: Given a server error, when a screen loads, then a message and "Try again" show, and it retries. (covers FR-12)
- **AC-15**: Given the device screen, when "Copy" is pressed, then the RTSP address is copied. (covers FR-13)
- **AC-16**: Given a source returning a token, when logs and replies are produced, then neither contains it or the password. (covers NFR-1)
- **AC-17**: Given the theme, text contrast is ≥ 4.5:1, and every control works with Tab and Enter/Space. (covers NFR-5, NFR-7)
- **AC-18**: Given a 360 px viewport, both screens have no sideways scroll and one column. (covers NFR-6)

## 7. Failure behaviour
- Source down or login fails: 502 "Media source unavailable"; page shows it with "Try again".
- Unknown device: 404 "Device not found". Invalid id: 400 "Invalid device id".
- Call fails after retries: stream ends (Frigate reconnects itself); the player shows "Live video unavailable" with "Try again".
- Snapshot fails: keep the old image, show "Could not refresh snapshot".
- A source error never crashes the server; it is logged without secrets.

## 8. Manual test
1. Copy `media-gateway/.env.example` to `media-gateway/.env`; set `SKYBELL_USERNAME` and `SKYBELL_PASSWORD`.
2. In `media-gateway/` run `docker compose up -d`. Expect three running containers.
3. Open `http://<host>:8080/`. Expect a dark page listing your doorbell.
4. Click it. Expect a loading state, live video within 20 s, and the snapshot.
5. Press "Refresh snapshot". Expect a new image (or "Could not refresh snapshot").
6. Press "Copy"; run `ffplay rtsp://<host>:8554/<deviceId>`. Expect live video.
7. Add that URL as a Frigate camera input. Expect it live in Frigate.
8. Close the tab, ffplay and the Frigate camera. Within 10 s the server log says the call ended.
9. Resize to 360 px wide. Expect one column, no sideways scroll.
10. Use only Tab and Enter: open a device, refresh, copy. Expect visible focus on each control.
11. Set a wrong password, restart. Expect "Media source unavailable" and no password in `docker compose logs`.

## 9. Out of scope
Event photo lists; recorded videos; two-way audio; in-app login; light theme; other sources; legacy plugin changes.

## 10. Constitution check
- Spec before code: cites approved RFC-0001.
- Test first: every AC becomes an automated test before the code (NFR-8).
- Core on abstractions; new kinds/sources as modules: FR-4, AC-5.
- Strict types: enforced in CI (NFR-9).
- Guardrails: no secrets (NFR-1, AC-16); legacy untouched (§9); stream process given an argument list, never a shell string (plan); inputs validated (NFR-2, AC-4).

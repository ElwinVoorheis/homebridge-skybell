# homebridge-skybell — Project

> Business context, not technical detail. Written for a new teammate, a stakeholder, or an
> agent that needs to know *why* this exists. Technical shape lives in ARCHITECTURE.md.
> Never guess a fact here: ask the user.

## What this is
This repo holds two things. The original **homebridge-skybell** plugin (legacy, unmaintained since
2021) that puts a SkyBell HD doorbell into Apple HomeKit. And a new **media gateway**: a small
self-hosted app that pulls media (live video, photos, and later other kinds) from the SkyBell cloud,
republishes live video as an RTSP stream other apps (for example Frigate) can point at, and shows
it all in a React web page.

## Who it is for
Home-lab owners with a SkyBell doorbell who want its video in their own tools (NVRs like Frigate,
dashboards) instead of only the vendor app. Today the video is locked inside the SkyBell app or HomeKit.

## Why now / what success looks like
- Frigate can record and detect on the doorbell using one stable `rtsp://` URL.
- The same live view and latest photo are visible in the web page.
- New media kinds can be added without changing existing code (new adapter, not edits).

## Scope
**In scope:** SkyBell cloud as the first media source; live video re-streamed as RTSP; latest
photo (snapshot); a React page to list devices and view live video and photos; Docker Compose deployment.
**Explicitly out of scope:** user accounts or login inside the app (a reverse proxy handles access);
two-way audio; changes to the legacy Homebridge plugin; media kinds beyond video and photo (to be defined later).

## Who works on what
| Person | Role | Owns / ask them about | Contact (email / chat handle) |
| --- | --- | --- | --- |
| Elwin Voorheis | Requester, owner, implementer, deployer, support | Everything in the media gateway | elwinvoorheis@gmail.com |
| Alexander Thoukydides | Original author (legacy, inactive) | Legacy Homebridge plugin and the SkyBell protocol notes | via GitHub (thoukydides) |

## Stakeholders and decision makers
Elwin Voorheis signs off on scope and releases.

## Repositories in this product
- `homebridge-skybell` — this repo: legacy plugin (root files) and the media gateway (`media-gateway/`). Owner: Elwin Voorheis.

## Glossary
- **Media source** — an outside system that supplies media (first one: SkyBell cloud).
- **Media kind** — what a piece of media is: `video-stream`, `photo`, more later.
- **Device** — one doorbell/camera reported by a media source.
- **Live call** — SkyBell's term for starting a live video session; it returns encrypted RTP (SRTP) details.
- **Restream** — taking a live call and publishing it as RTSP via the media server.
- **Media server** — MediaMTX, the process that serves RTSP to Frigate and WebRTC/HLS to the browser.

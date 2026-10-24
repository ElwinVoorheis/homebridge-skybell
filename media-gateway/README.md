# SkyBell media gateway

Turns a SkyBell doorbell into a plain **RTSP stream** that Frigate (or VLC, Home Assistant, any NVR) can read,
and shows live video and the latest snapshot in a small dark web page.

- Live video runs **only while someone watches**. The SkyBell call starts when the first reader connects and
  ends about 10 seconds after the last one leaves.
- Video is passed through unchanged (H.264); audio is converted to Opus.
- Snapshots load when you open a doorbell and refresh when you press **Refresh snapshot**.

> ⚠️ **No login.** Anyone who can reach these ports can watch your doorbell. Keep them on your LAN, or put the
> web page behind your reverse proxy (Authelia, Tailscale, etc.). Never forward them to the internet.
>
> ⚠️ SkyBell's API is unofficial and has not been checked since 2021. If SkyBell changed it, logins or calls fail
> with "Media source unavailable".

## Run it

```sh
cd media-gateway
cp .env.example .env    # then fill it in (see below)
docker compose up -d --build
```

| Setting | What to put |
| --- | --- |
| `SKYBELL_USERNAME`, `SKYBELL_PASSWORD` | Your SkyBell app login |
| `INTERNAL_SECRET` | 16+ random characters, e.g. `openssl rand -hex 24`. Lets only the gateway publish streams |
| `RTSP_PUBLIC_HOST` | The host name or IP other devices use to reach this machine, e.g. `192.168.1.10` |

Open `http://<host>:8080/`. Each doorbell's page shows its RTSP address with a **Copy** button.

| Port | Use |
| --- | --- |
| 8080/tcp | Web page (also proxies the API and browser video) |
| 8554/tcp | RTSP for Frigate and other apps: `rtsp://<host>:8554/<deviceId>` |
| 8189/udp | WebRTC video to browsers |

## Frigate

```yaml
cameras:
  doorbell:
    ffmpeg:
      inputs:
        - path: rtsp://<host>:8554/<deviceId>
          input_args: preset-rtsp-restream
          roles: [detect, record]
```

Expect up to 20 seconds before the first frame: SkyBell calls are slow to start.

## If something does not work

- **Live video never starts, snapshot works:** SkyBell sends video over UDP, which Docker's NAT can block.
  Switch `server` and `mediamtx` to `network_mode: host` in `docker-compose.yml` (remove their `ports:`), then
  point the names at the host: in `mediamtx.yml` replace `http://server:3001` with `http://127.0.0.1:3001`;
  in `.env` set `MEDIAMTX_RTSP_URL=rtsp://127.0.0.1:8554`; in `web/nginx.conf` replace `server:` and
  `mediamtx:` with `host.docker.internal:` and add `extra_hosts: ['host.docker.internal:host-gateway']` to `web`.
  Then make sure ports 3000 and 3001 are firewalled from the LAN.
- **Browser shows "Live compatible mode" (HLS) instead of low delay:** WebRTC could not reach UDP 8189. Add your
  host's LAN IP under `webrtcAdditionalHosts` in `mediamtx.yml`.
- **"Media source unavailable":** wrong SkyBell login, or SkyBell's API changed. `docker compose logs server`
  shows the failing request (method, path and status only; credentials are never logged).

## Develop

See `AGENTS.md` at the repo root for every command. In short: `npm ci`, then `npm test`, `npm run lint`,
`npm run typecheck`. Design and requirements live in `specs/001-media-gateway/`.

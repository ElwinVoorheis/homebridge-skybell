/**
 * End-to-end: real MediaMTX + real server + real FFmpeg, with a test-pattern source instead of SkyBell.
 * Needs `ffmpeg`/`ffprobe` on PATH and MEDIAMTX_BIN pointing at a MediaMTX binary. Run: `npm run test:e2e -w server`.
 */
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { start } from '../src/main.js';
import { TestPatternSource } from './fake-source.js';

const run = promisify(execFile);
const SECRET = 'e2e-internal-secret-0123456789';
const PORTS = {
  public: 13000,
  internal: 13001,
  rtsp: 18554,
  hls: 18888,
  webrtc: 18889,
  udp: 18189,
};
const RTSP = `rtsp://127.0.0.1:${PORTS.rtsp}`;

async function waitFor(check: () => boolean, timeoutMs: number): Promise<number> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error(`condition not met in ${timeoutMs} ms`);
    await new Promise((r) => setTimeout(r, 100));
  }
  return Date.now() - started;
}

async function probe(path: string): Promise<string> {
  const { stdout } = await run(
    'ffprobe',
    [
      '-v',
      'error',
      '-rtsp_transport',
      'tcp',
      '-show_entries',
      'stream=codec_name',
      '-of',
      'csv=p=0',
      `${RTSP}/${path}`,
    ],
    { timeout: 30_000 },
  );
  return stdout.trim();
}

describe('media gateway end to end', () => {
  let dir: string;
  let mediamtx: ChildProcess;
  let gateway: { stop: () => Promise<void> };
  const source = new TestPatternSource();

  beforeAll(async () => {
    const bin = process.env.MEDIAMTX_BIN;
    if (!bin) throw new Error('Set MEDIAMTX_BIN to a MediaMTX binary to run the e2e test');

    // Use the production config, pointed at local ports instead of Docker service names.
    dir = await mkdtemp(join(tmpdir(), 'gateway-e2e-'));
    const config = (await readFile(new URL('../../mediamtx.yml', import.meta.url), 'utf8'))
      .replaceAll('http://server:3001', `http://127.0.0.1:${PORTS.internal}`)
      .replace('rtspAddress: :8554', `rtspAddress: :${PORTS.rtsp}`)
      .replace('hlsAddress: :8888', `hlsAddress: :${PORTS.hls}`)
      .replace('webrtcAddress: :8889', `webrtcAddress: :${PORTS.webrtc}`)
      .replace('webrtcLocalUDPAddress: :8189', `webrtcLocalUDPAddress: :${PORTS.udp}`)
      .concat('\nrtspTransports: [tcp]\n');
    await writeFile(join(dir, 'mediamtx.yml'), config);

    gateway = await start(
      {
        SKYBELL_USERNAME: 'unused',
        SKYBELL_PASSWORD: 'unused',
        INTERNAL_SECRET: SECRET,
        RTSP_PUBLIC_HOST: '127.0.0.1',
        PUBLIC_PORT: String(PORTS.public),
        INTERNAL_PORT: String(PORTS.internal),
        MEDIAMTX_RTSP_URL: RTSP,
        LOG_LEVEL: 'warn',
      },
      source,
    );
    mediamtx = spawn(bin, [join(dir, 'mediamtx.yml')], {
      env: { ...process.env, INTERNAL_SECRET: SECRET },
      stdio: 'ignore',
    });
    await new Promise((r) => setTimeout(r, 1000));
  }, 30_000);

  afterAll(async () => {
    mediamtx.kill('SIGTERM');
    await gateway.stop();
    await rm(dir, { recursive: true, force: true });
  });

  it('starts one live call on the first reader and serves H.264 over RTSP (AC-6)', async () => {
    expect(await probe('test-cam')).toContain('h264');
    expect(source.startCalls).toBe(1);
  }, 40_000);

  it('ends the call within 10 s (plus a 2 s margin) after the last reader leaves (AC-8)', async () => {
    const elapsed = await waitFor(() => source.stopCalls === 1, 15_000);
    expect(elapsed).toBeLessThanOrEqual(12_000);
  }, 20_000);

  it('shares one call between concurrent readers, reconnect storm included (AC-7)', async () => {
    const before = source.startCalls;
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => probe('test-cam')));

    expect(results.every((r) => r.includes('h264'))).toBe(true);
    expect(source.startCalls).toBe(before + 1);
  }, 40_000);

  it('refuses publishers without the gateway secret', async () => {
    await expect(
      run(
        'ffmpeg',
        [
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'testsrc',
          '-t',
          '1',
          '-c:v',
          'libx264',
          '-f',
          'rtsp',
          '-rtsp_transport',
          'tcp',
          `${RTSP}/intruder`,
        ],
        { timeout: 15_000 },
      ),
    ).rejects.toThrow();
  }, 20_000);

  it('fails readers of unknown devices without starting a call', async () => {
    const before = source.startCalls;
    // The hold is refused with 404; MediaMTX then fails the reader after its start timeout.
    await expect(probe('no-such-cam')).rejects.toThrow();
    expect(source.startCalls).toBe(before);
  }, 40_000);
});

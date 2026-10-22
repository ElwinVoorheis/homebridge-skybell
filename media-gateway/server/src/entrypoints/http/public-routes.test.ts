import { Writable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeClock, FakeSource } from '../../../test/fakes.js';
import { DeviceCatalog } from '../../core/devices.js';
import { MediaKindRegistry, defaultMediaKinds } from '../../core/media-kinds.js';
import { createLogger } from './logging.js';
import { buildPublicApp } from './public-routes.js';

class LogCapture extends Writable {
  text = '';
  override _write(chunk: Buffer, _enc: string, done: () => void): void {
    this.text += chunk.toString();
    done();
  }
}

describe('public API', () => {
  let source: FakeSource;
  let logs: LogCapture;
  let app: FastifyInstance;

  beforeEach(async () => {
    source = new FakeSource();
    source.devices = [
      { id: 'front', name: 'Front door', capabilities: ['live-video', 'photo'] },
      { id: 'side', name: 'Side', capabilities: ['photo'] },
    ];
    logs = new LogCapture();
    const catalog = new DeviceCatalog(
      source,
      new MediaKindRegistry(defaultMediaKinds),
      new FakeClock(),
    );
    app = buildPublicApp({
      catalog,
      rtspPublicUrl: 'rtsp://nvr.lan:8554',
      logger: createLogger('info', logs),
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('lists devices with media kinds and RTSP address (AC-1, FR-13)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/devices' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      {
        id: 'front',
        name: 'Front door',
        mediaKinds: ['video-stream', 'photo'],
        rtspUrl: 'rtsp://nvr.lan:8554/front',
      },
      { id: 'side', name: 'Side', mediaKinds: ['photo'], rtspUrl: null },
    ]);
  });

  it('replies 502 with a readable message when the source is down', async () => {
    source.failList = true;
    const res = await app.inject({ method: 'GET', url: '/api/devices' });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({
      error: { code: 'source_unavailable', message: 'Media source unavailable' },
    });
  });

  it('recovers once the source comes back (SkyBell offline at boot)', async () => {
    source.failList = true;
    await app.inject({ method: 'GET', url: '/api/devices' });
    source.failList = false;

    const res = await app.inject({ method: 'GET', url: '/api/devices' });
    expect(res.statusCode).toBe(200);
  });

  it('never logs secrets from headers or errors (AC-16)', async () => {
    source.failList = true;
    await app.inject({
      method: 'GET',
      url: '/api/devices',
      headers: { authorization: 'Bearer leaked-token', 'x-gateway-secret': 'leaked-secret' },
    });

    expect(logs.text.length).toBeGreaterThan(0);
    expect(logs.text).not.toContain('leaked-token');
    expect(logs.text).not.toContain('leaked-secret');
  });

  it('replies 404 for unknown routes without echoing input', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nope<script>' });

    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('<script>');
  });
});

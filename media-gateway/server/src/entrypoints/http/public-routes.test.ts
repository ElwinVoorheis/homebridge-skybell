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

describe('photo API', () => {
  let source: FakeSource;
  let app: FastifyInstance;

  beforeEach(async () => {
    source = new FakeSource();
    source.devices = [{ id: 'front', name: 'Front', capabilities: ['live-video', 'photo'] }];
    source.photos.set('front', { bytes: new Uint8Array([0xff, 0xd8]), contentType: 'image/jpeg' });
    const catalog = new DeviceCatalog(
      source,
      new MediaKindRegistry(defaultMediaKinds),
      new FakeClock(),
    );
    app = buildPublicApp({
      catalog,
      rtspPublicUrl: 'rtsp://h:8554',
      logger: createLogger('silent'),
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns the snapshot bytes as image/jpeg (AC-2)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/devices/front/media/photo' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect([...res.rawPayload]).toEqual([0xff, 0xd8]);
  });

  it('replies 404 for an unknown device without asking the source (AC-3)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/devices/nope/media/photo' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: { code: 'device_not_found', message: 'Device not found' },
    });
    expect(source.photoCalls).toBe(0);
  });

  it.each(['..%2Fetc', 'a%3Brm%20-rf', 'x'.repeat(65), '%00', 'a.b', '%3Cscript%3E'])(
    'replies 400 for the hostile id %s (AC-4)',
    async (id) => {
      const res = await app.inject({ method: 'GET', url: `/api/devices/${id}/media/photo` });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({
        error: { code: 'invalid_device_id', message: 'Invalid device id' },
      });
      expect(source.listCalls).toBe(0);
      expect(source.photoCalls).toBe(0);
    },
  );

  it('replies 502 when the photo cannot be fetched', async () => {
    source.photos.clear();
    const res = await app.inject({ method: 'GET', url: '/api/devices/front/media/photo' });

    expect(res.statusCode).toBe(502);
  });
});

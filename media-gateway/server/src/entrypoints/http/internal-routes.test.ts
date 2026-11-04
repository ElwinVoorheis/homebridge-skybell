import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeClock, FakePublisher, FakeSource, MemoryLogger } from '../../../test/fakes.js';
import { DeviceCatalog } from '../../core/devices.js';
import { MediaKindRegistry, defaultMediaKinds } from '../../core/media-kinds.js';
import { StreamSessions } from '../../core/stream-sessions.js';
import { buildInternalApp } from './internal-routes.js';
import { createLogger } from './logging.js';

const SECRET = 'internal-secret-0123456789';

async function waitFor(check: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(check()).toBe(true);
}

describe('internal hold API', () => {
  let source: FakeSource;
  let publisher: FakePublisher;
  let clock: FakeClock;
  let sessions: StreamSessions;
  let app: FastifyInstance;

  beforeEach(async () => {
    source = new FakeSource();
    source.devices = [{ id: 'front', name: 'Front', capabilities: ['live-video', 'photo'] }];
    publisher = new FakePublisher();
    clock = new FakeClock();
    const catalog = new DeviceCatalog(source, new MediaKindRegistry(defaultMediaKinds), clock);
    sessions = new StreamSessions({
      source,
      publisher,
      catalog,
      clock,
      logger: new MemoryLogger(),
    });
    app = buildInternalApp({ sessions, secret: SECRET, logger: createLogger('silent') });
    await app.ready();
  });

  afterEach(async () => {
    await sessions.stopAll();
    await app.close();
  });

  it.each([undefined, 'wrong', `${SECRET}x`])('replies 401 for secret %s', async (secret) => {
    const headers = secret ? { 'x-gateway-secret': secret } : {};
    const res = await app.inject({ method: 'GET', url: '/internal/streams/front/hold', headers });

    expect(res.statusCode).toBe(401);
    expect(source.startCalls).toBe(0);
  });

  it('replies 400 for an invalid id and 404 for an unknown one', async () => {
    const headers = { 'x-gateway-secret': SECRET };
    const bad = await app.inject({ method: 'GET', url: '/internal/streams/a.b/hold', headers });
    const unknown = await app.inject({
      method: 'GET',
      url: '/internal/streams/nope/hold',
      headers,
    });

    expect(bad.statusCode).toBe(400);
    expect(unknown.statusCode).toBe(404);
    expect(source.startCalls).toBe(0);
  });

  it('holds a session while the request is open and releases it on close (FR-5, FR-7)', async () => {
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;

    const req = httpRequest({
      host: '127.0.0.1',
      port,
      path: '/internal/streams/front/hold',
      headers: { 'x-gateway-secret': SECRET },
    });
    let status: number | undefined;
    req.on('response', (res) => (status = res.statusCode));
    req.on('error', () => undefined);
    req.end();

    await waitFor(() => status === 200 && publisher.running.length === 1);
    expect(source.startCalls).toBe(1);

    req.destroy();
    await waitFor(() => source.stopCalls === 1);
    expect(publisher.running).toHaveLength(0);
  });

  it('ends the response when retries run out (FR-8)', async () => {
    source.failNextStarts = 100;
    const pending = app.inject({
      method: 'GET',
      url: '/internal/streams/front/hold',
      headers: { 'x-gateway-secret': SECRET },
    });
    for (const [i, ms] of [2000, 4000, 8000].entries()) {
      await waitFor(() => clock.sleeps.length === i + 1);
      await clock.advance(ms);
    }

    const res = await pending;
    expect(res.statusCode).toBe(200);
    expect(source.startCalls).toBe(4);
  });
});

describe('MediaMTX publish auth', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const source = new FakeSource();
    const clock = new FakeClock();
    const catalog = new DeviceCatalog(source, new MediaKindRegistry(defaultMediaKinds), clock);
    const sessions = new StreamSessions({
      source,
      publisher: new FakePublisher(),
      catalog,
      clock,
      logger: new MemoryLogger(),
    });
    app = buildInternalApp({ sessions, secret: SECRET, logger: createLogger('silent') });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  const auth = (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/internal/mediamtx/auth', payload });

  it('lets the gateway publish to a device path', async () => {
    const res = await auth({ action: 'publish', user: 'gateway', password: SECRET, path: 'front' });
    expect(res.statusCode).toBe(200);
  });

  it.each([
    { action: 'publish', user: '', password: '', path: 'front' },
    { action: 'publish', user: 'gateway', password: 'guess', path: 'front' },
    { action: 'publish', user: 'admin', password: SECRET, path: 'front' },
    { action: 'publish', user: 'gateway', password: SECRET, path: '../x' },
    { action: 'api', user: 'gateway', password: SECRET, path: '' },
    { nonsense: true },
  ])('refuses %o', async (payload) => {
    const res = await auth(payload);
    expect(res.statusCode).toBe(401);
  });

  it('allows reading without credentials', async () => {
    const res = await auth({ action: 'read', user: '', password: '', path: 'front' });
    expect(res.statusCode).toBe(200);
  });
});

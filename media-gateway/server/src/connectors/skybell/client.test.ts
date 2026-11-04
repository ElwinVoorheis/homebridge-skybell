import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MemoryLogger } from '../../../test/fakes.js';
import { SourceUnavailable } from '../../core/errors.js';
import { SKYBELL_URL, SkyBellClient } from './client.js';

const credentials = { username: 'owner@example.com', password: 'hunter2-password' };
const server = setupServer();
const okSchema = z.object({ ok: z.boolean() });

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

describe('SkyBellClient', () => {
  let logger: MemoryLogger;
  let client: SkyBellClient;
  let logins: number;

  beforeEach(() => {
    logger = new MemoryLogger();
    client = new SkyBellClient({ credentials, logger });
    logins = 0;
    server.use(
      http.post(`${SKYBELL_URL}login/`, async ({ request }) => {
        logins++;
        const body = (await request.json()) as Record<string, string>;
        if (body.password !== credentials.password) {
          return HttpResponse.json({ message: 'bad login' }, { status: 401 });
        }
        return HttpResponse.json({ access_token: `token-${logins}` });
      }),
    );
  });

  it('logs in once and reuses the token', async () => {
    const seen: (string | null)[] = [];
    server.use(
      http.get(`${SKYBELL_URL}things/`, ({ request }) => {
        seen.push(request.headers.get('authorization'));
        return HttpResponse.json({ ok: true });
      }),
    );

    await client.request('GET', 'things/', okSchema);
    await client.request('GET', 'things/', okSchema);

    expect(logins).toBe(1);
    expect(seen).toEqual(['Bearer token-1', 'Bearer token-1']);
  });

  it('logs in again once when the token is rejected', async () => {
    let calls = 0;
    server.use(
      http.get(`${SKYBELL_URL}things/`, ({ request }) => {
        calls++;
        if (request.headers.get('authorization') === 'Bearer token-1') {
          return HttpResponse.json({ message: 'SmartAuth failed' }, { status: 401 });
        }
        return HttpResponse.json({ ok: true });
      }),
    );

    await expect(client.request('GET', 'things/', okSchema)).resolves.toEqual({ ok: true });
    expect(logins).toBe(2);
    expect(calls).toBe(2);
  });

  it('gives up after one re-login', async () => {
    server.use(http.get(`${SKYBELL_URL}things/`, () => HttpResponse.json({}, { status: 401 })));

    await expect(client.request('GET', 'things/', okSchema)).rejects.toBeInstanceOf(
      SourceUnavailable,
    );
    expect(logins).toBe(2);
  });

  it('fails as SourceUnavailable when login is rejected', async () => {
    const bad = new SkyBellClient({ credentials: { ...credentials, password: 'wrong' }, logger });
    await expect(bad.request('GET', 'things/', okSchema)).rejects.toBeInstanceOf(SourceUnavailable);
  });

  it('fails as SourceUnavailable when a reply has an unexpected shape', async () => {
    server.use(http.get(`${SKYBELL_URL}things/`, () => HttpResponse.json({ ok: 'yes' })));

    await expect(client.request('GET', 'things/', okSchema)).rejects.toBeInstanceOf(
      SourceUnavailable,
    );
  });

  it('fails as SourceUnavailable when the network is down', async () => {
    server.use(http.get(`${SKYBELL_URL}things/`, () => HttpResponse.error()));

    await expect(client.request('GET', 'things/', okSchema)).rejects.toBeInstanceOf(
      SourceUnavailable,
    );
  });

  it('never logs the password, token or reply bodies (AC-16)', async () => {
    server.use(
      http.get(`${SKYBELL_URL}things/`, () => HttpResponse.json({ ok: true, secret: 'zzz' })),
    );
    await client.request('GET', 'things/', okSchema);
    await new SkyBellClient({ credentials: { ...credentials, password: 'wrong' }, logger })
      .request('GET', 'things/', okSchema)
      .catch(() => undefined);

    const logged = JSON.stringify(logger.entries);
    expect(logger.entries.length).toBeGreaterThan(0);
    expect(logged).not.toContain(credentials.password);
    expect(logged).not.toContain('token-');
    expect(logged).not.toContain('zzz');
  });
});

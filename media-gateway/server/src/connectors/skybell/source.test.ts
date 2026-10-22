import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MemoryLogger } from '../../../test/fakes.js';
import { SourceUnavailable } from '../../core/errors.js';
import { SKYBELL_URL, SkyBellClient } from './client.js';
import { SkyBellSource } from './source.js';

const server = setupServer(
  http.post(`${SKYBELL_URL}login/`, () => HttpResponse.json({ access_token: 't' })),
);

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

function source(): SkyBellSource {
  const logger = new MemoryLogger();
  return new SkyBellSource(
    new SkyBellClient({ credentials: { username: 'u', password: 'p' }, logger }),
  );
}

describe('SkyBellSource.listDevices', () => {
  it('maps SkyBell devices to devices with live video and photo (AC-1)', async () => {
    server.use(
      http.get(`${SKYBELL_URL}devices/`, () =>
        HttpResponse.json([
          { id: 'abc123', name: 'Front door', type: 'skybell hd', extra: 1 },
          { id: 'def456', name: 'Back', type: 'trim plus' },
        ]),
      ),
    );

    expect(await source().listDevices()).toEqual([
      { id: 'abc123', name: 'Front door', capabilities: ['live-video', 'photo'] },
      { id: 'def456', name: 'Back', capabilities: ['live-video', 'photo'] },
    ]);
  });

  it('rejects devices whose id could not be used in a URL path', async () => {
    server.use(
      http.get(`${SKYBELL_URL}devices/`, () =>
        HttpResponse.json([{ id: '../evil', name: 'X', type: 't' }]),
      ),
    );

    await expect(source().listDevices()).rejects.toBeInstanceOf(SourceUnavailable);
  });
});

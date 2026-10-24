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

describe('SkyBellSource.getPhoto', () => {
  it('downloads the avatar image with its content type (AC-2)', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    server.use(
      http.get(`${SKYBELL_URL}devices/abc123/avatar/`, () =>
        HttpResponse.json({ url: 'https://media.example.com/a/avatar.jpg?sig=1', createdAt: 'x' }),
      ),
      http.get('https://media.example.com/a/avatar.jpg', () =>
        HttpResponse.arrayBuffer(jpeg.buffer, { headers: { 'content-type': 'image/jpeg' } }),
      ),
    );

    expect(await source().getPhoto('abc123')).toEqual({ bytes: jpeg, contentType: 'image/jpeg' });
  });

  it('infers the type from the file name when the header is generic', async () => {
    server.use(
      http.get(`${SKYBELL_URL}devices/abc123/avatar/`, () =>
        HttpResponse.json({ url: 'https://media.example.com/p.png?sig=1' }),
      ),
      http.get('https://media.example.com/p.png', () =>
        HttpResponse.arrayBuffer(new Uint8Array([1]).buffer, {
          headers: { 'content-type': 'binary/octet-stream' },
        }),
      ),
    );

    expect((await source().getPhoto('abc123')).contentType).toBe('image/png');
  });

  it('refuses a non-https avatar URL', async () => {
    server.use(
      http.get(`${SKYBELL_URL}devices/abc123/avatar/`, () =>
        HttpResponse.json({ url: 'http://169.254.169.254/latest/meta-data' }),
      ),
    );

    await expect(source().getPhoto('abc123')).rejects.toBeInstanceOf(SourceUnavailable);
  });

  it('refuses content that is not an image', async () => {
    server.use(
      http.get(`${SKYBELL_URL}devices/abc123/avatar/`, () =>
        HttpResponse.json({ url: 'https://media.example.com/x.html?sig=1' }),
      ),
      http.get('https://media.example.com/x.html', () =>
        HttpResponse.text('<script>alert(1)</script>', {
          headers: { 'content-type': 'text/html' },
        }),
      ),
    );

    await expect(source().getPhoto('abc123')).rejects.toBeInstanceOf(SourceUnavailable);
  });
});

describe('SkyBellSource live calls', () => {
  const callReply = {
    incomingVideo: {
      server: '203.0.113.7',
      port: 40000,
      payloadType: 99,
      encoding: 'H264',
      sampleRate: 90000,
      key: 'c2VjcmV0LXNydHAta2V5LXNhbHQtMTIzNDU2Nzg5MA==',
      ssrc: 1234,
    },
    incomingAudio: {
      server: '203.0.113.7',
      port: '40002',
      payloadType: 100,
      encoding: 'L16',
      sampleRate: 8000,
      channels: 1,
      key: 'YXVkaW8ta2V5LXNhbHQtMTIzNDU2Nzg5MDEyMzQ1Ng==',
      ssrc: 5678,
    },
  };

  it('starts a call and maps the SRTP details', async () => {
    server.use(
      http.post(`${SKYBELL_URL}devices/abc123/calls/`, () => HttpResponse.json(callReply)),
    );

    const call = await source().startLiveCall('abc123');

    expect(call.deviceId).toBe('abc123');
    expect(call.input).toEqual({
      kind: 'srtp',
      video: callReply.incomingVideo,
      audio: { ...callReply.incomingAudio, port: 40002 },
    });
  });

  it('rejects a call reply without usable stream details', async () => {
    server.use(
      http.post(`${SKYBELL_URL}devices/abc123/calls/`, () =>
        HttpResponse.json({ incomingVideo: { server: 'x' } }),
      ),
    );

    await expect(source().startLiveCall('abc123')).rejects.toBeInstanceOf(SourceUnavailable);
  });

  it('stops a call', async () => {
    let stopped = false;
    server.use(
      http.delete(`${SKYBELL_URL}devices/abc123/calls/`, () => {
        stopped = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await source().stopLiveCall({ deviceId: 'abc123', input: { kind: 'url', url: 'x' } });
    expect(stopped).toBe(true);
  });
});

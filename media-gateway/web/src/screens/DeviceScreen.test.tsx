import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { renderAt } from '../test-utils';

const server = setupServer();
beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

const devices = [
  {
    id: 'front',
    name: 'Front door',
    mediaKinds: ['video-stream', 'photo'],
    rtspUrl: 'rtsp://nvr.lan:8554/front',
  },
  { id: 'side', name: 'Side gate', mediaKinds: ['photo'], rtspUrl: null },
];

let photoCalls: number;
let photoFails: boolean;

beforeEach(() => {
  photoCalls = 0;
  photoFails = false;
  server.use(
    http.get('*/api/devices', () => HttpResponse.json(devices)),
    http.get('*/api/devices/:id/media/photo', () => {
      photoCalls++;
      if (photoFails) return HttpResponse.json({ error: { message: 'x' } }, { status: 502 });
      return HttpResponse.arrayBuffer(new Uint8Array([0xff, 0xd8, photoCalls]).buffer, {
        headers: { 'content-type': 'image/jpeg' },
      });
    }),
  );
});

describe('device screen', () => {
  it('shows the device name and its latest snapshot on open, once (FR-11)', async () => {
    renderAt('/devices/front');

    expect(await screen.findByRole('heading', { name: 'Front door' })).toBeInTheDocument();
    const img = await screen.findByRole('img', { name: /latest snapshot/i });
    expect(img.getAttribute('src')).toMatch(/^blob:/);
    expect(photoCalls).toBe(1);
  });

  it('fetches a new snapshot only when "Refresh snapshot" is pressed (AC-13)', async () => {
    renderAt('/devices/front');
    const img = await screen.findByRole('img', { name: /latest snapshot/i });
    const first = img.getAttribute('src');

    await userEvent.click(screen.getByRole('button', { name: 'Refresh snapshot' }));

    await waitFor(() => {
      expect(photoCalls).toBe(2);
    });
    await waitFor(() => {
      expect(screen.getByRole('img', { name: /latest snapshot/i }).getAttribute('src')).not.toBe(
        first,
      );
    });
  });

  it('keeps the old image and says so when a refresh fails (spec §7)', async () => {
    renderAt('/devices/front');
    const img = await screen.findByRole('img', { name: /latest snapshot/i });
    const first = img.getAttribute('src');
    photoFails = true;

    await userEvent.click(screen.getByRole('button', { name: 'Refresh snapshot' }));

    expect(await screen.findByText('Could not refresh snapshot')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /latest snapshot/i }).getAttribute('src')).toBe(first);
  });

  it('shows the RTSP address and copies it (AC-15)', async () => {
    const user = userEvent.setup();
    renderAt('/devices/front');

    expect(await screen.findByRole('textbox', { name: /rtsp address/i })).toHaveValue(
      'rtsp://nvr.lan:8554/front',
    );
    await user.click(screen.getByRole('button', { name: 'Copy RTSP address' }));

    expect(await navigator.clipboard.readText()).toBe('rtsp://nvr.lan:8554/front');
    expect(screen.getByText('Copied')).toBeInTheDocument();
  });

  it('shows no live video or RTSP address for photo-only devices', async () => {
    renderAt('/devices/side');

    expect(await screen.findByRole('heading', { name: 'Side gate' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy RTSP address' })).toBeNull();
  });

  it('says "Device not found" for an unknown id, with a way back', async () => {
    renderAt('/devices/nope');

    expect(await screen.findByText('Device not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /all doorbells/i })).toHaveAttribute('href', '/');
  });
});

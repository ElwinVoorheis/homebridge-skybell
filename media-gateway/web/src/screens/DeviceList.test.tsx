import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
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
    rtspUrl: 'rtsp://h:8554/front',
  },
  { id: 'side', name: 'Side gate', mediaKinds: ['photo'], rtspUrl: null },
];

describe('device list screen', () => {
  it('shows a loading state, then each device linking to its screen (FR-9)', async () => {
    server.use(http.get('*/api/devices', () => HttpResponse.json(devices)));
    renderAt('/');

    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
    const link = await screen.findByRole('link', { name: 'Front door' });
    expect(link).toHaveAttribute('href', '/devices/front');
    expect(screen.getByRole('link', { name: 'Side gate' })).toHaveAttribute(
      'href',
      '/devices/side',
    );
  });

  it('says "No devices found" when the list is empty (AC-11)', async () => {
    server.use(http.get('*/api/devices', () => HttpResponse.json([])));
    renderAt('/');

    expect(await screen.findByText('No devices found')).toBeInTheDocument();
  });

  it('shows the server message and retries on "Try again" (AC-14)', async () => {
    let calls = 0;
    server.use(
      http.get('*/api/devices', () => {
        calls++;
        return calls === 1
          ? HttpResponse.json(
              { error: { code: 'source_unavailable', message: 'Media source unavailable' } },
              { status: 502 },
            )
          : HttpResponse.json(devices);
      }),
    );
    renderAt('/');

    expect(await screen.findByRole('alert')).toHaveTextContent('Media source unavailable');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('link', { name: 'Front door' })).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it('shows a generic message when the reply is not what the app expects', async () => {
    server.use(http.get('*/api/devices', () => HttpResponse.json({ nope: true })));
    renderAt('/');

    expect(await screen.findByRole('alert')).toHaveTextContent(/unexpected reply/i);
  });

  it('renders device names as text, never as HTML', async () => {
    server.use(
      http.get('*/api/devices', () =>
        HttpResponse.json([{ ...devices[1], name: '<img src=x onerror=alert(1)>' }]),
      ),
    );
    const { container } = renderAt('/');

    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img[src="x"]')).toBeNull();
  });
});

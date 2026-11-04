import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LivePlayer } from './LivePlayer';
import type { Starter } from './types';

const ok: Starter = () => Promise.resolve(() => undefined);
const fails: Starter = () => Promise.reject(new Error('no'));

describe('LivePlayer', () => {
  it('plays over WebRTC first and names the video for screen readers (FR-10, NFR-7)', async () => {
    const webrtc = vi.fn(ok);
    const hls = vi.fn(ok);
    render(<LivePlayer deviceId="front" deviceName="Front door" starters={{ webrtc, hls }} />);

    expect(screen.getByLabelText('Live video from Front door')).toBeInTheDocument();
    await waitFor(() => {
      expect(webrtc).toHaveBeenCalledOnce();
    });
    expect(hls).not.toHaveBeenCalled();
    expect(await screen.findByText(/live · low delay/i)).toBeInTheDocument();
  });

  it('falls back to HLS when WebRTC fails (AC-12)', async () => {
    const hls = vi.fn(ok);
    render(<LivePlayer deviceId="front" deviceName="F" starters={{ webrtc: fails, hls }} />);

    await waitFor(() => {
      expect(hls).toHaveBeenCalledOnce();
    });
    expect(hls.mock.calls[0]?.[1]).toBe('front');
    expect(await screen.findByText(/live · compatible/i)).toBeInTheDocument();
  });

  it('falls back to HLS when a WebRTC stream drops', async () => {
    const hls = vi.fn(ok);
    const webrtc: Starter = (_video, _id, onFail) => {
      setTimeout(onFail, 10);
      return Promise.resolve(() => undefined);
    };
    render(<LivePlayer deviceId="front" deviceName="F" starters={{ webrtc, hls }} />);

    await waitFor(() => {
      expect(hls).toHaveBeenCalledOnce();
    });
  });

  it('shows "Live video unavailable" with Try again when both fail (spec §7)', async () => {
    const webrtc = vi.fn(fails);
    render(<LivePlayer deviceId="front" deviceName="F" starters={{ webrtc, hls: fails }} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Live video unavailable');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(webrtc).toHaveBeenCalledTimes(2);
    });
  });

  it('stops the stream when it unmounts', async () => {
    const stop = vi.fn();
    const { unmount } = render(
      <LivePlayer
        deviceId="front"
        deviceName="F"
        starters={{ webrtc: () => Promise.resolve(stop), hls: ok }}
      />,
    );
    await screen.findByText(/low delay/i);

    unmount();
    expect(stop).toHaveBeenCalledOnce();
  });
});

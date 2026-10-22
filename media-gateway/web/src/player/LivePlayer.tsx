import { useEffect, useRef, useState } from 'react';
import { startHls } from './hls';
import type { Starter, Stop } from './types';
import { startWhep } from './whep';

type Mode = 'connecting' | 'webrtc' | 'hls' | 'failed';

const LABELS: Record<Mode, string> = {
  connecting: 'Connecting… (a SkyBell call can take up to 20 seconds)',
  webrtc: 'Live · low delay',
  hls: 'Live · compatible mode',
  failed: '',
};

export interface LivePlayerProps {
  readonly deviceId: string;
  readonly deviceName: string;
  /** Replaceable for tests. */
  readonly starters?: { readonly webrtc: Starter; readonly hls: Starter };
}

const defaultStarters = { webrtc: startWhep, hls: startHls };

/** Live video: WebRTC first, HLS if that fails, then an error with Try again (FR-10, spec §7). */
export function LivePlayer({ deviceId, deviceName, starters = defaultStarters }: LivePlayerProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<Mode>('connecting');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let stop: Stop | undefined;
    let cancelled = false;

    const run = async (): Promise<void> => {
      const tryStart = async (starter: Starter, onFail: () => void): Promise<boolean> => {
        try {
          const s = await starter(element, deviceId, onFail);
          if (cancelled) s();
          else stop = s;
          return true;
        } catch {
          return false;
        }
      };
      const fallBack = (): void => {
        if (cancelled) return;
        stop?.();
        stop = undefined;
        void tryStart(starters.hls, () => {
          if (!cancelled) setMode('failed');
        }).then((started) => {
          if (!cancelled) setMode(started ? 'hls' : 'failed');
        });
      };

      if (await tryStart(starters.webrtc, fallBack)) {
        if (!cancelled) setMode('webrtc');
      } else {
        fallBack();
      }
    };
    void run();

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [deviceId, starters, attempt]);

  return (
    <section className="tile" aria-labelledby="live-heading">
      <h2 id="live-heading">Live video</h2>
      <div className="frame">
        <video
          ref={video}
          aria-label={`Live video from ${deviceName}`}
          autoPlay
          muted
          playsInline
          controls
        />
      </div>
      {mode === 'failed' ? (
        <div className="row">
          <p role="alert" className="error">
            Live video unavailable
          </p>
          <button
            type="button"
            className="button"
            onClick={() => {
              setMode('connecting');
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : (
        <p role="status" className="muted">
          {LABELS[mode]}
        </p>
      )}
    </section>
  );
}

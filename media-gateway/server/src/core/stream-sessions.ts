import type { DeviceCatalog } from './devices.js';
import { DeviceNotFound } from './errors.js';
import { MediaKindRegistry, defaultMediaKinds, videoStream } from './media-kinds.js';
import type { LiveCall, PublishHandle } from './model.js';
import type { Clock, Logger, MediaSource, StreamPublisher } from './ports.js';

/** Waits before retry 1, 2 and 3 (FR-8). */
export const RETRY_DELAYS_MS = [2000, 4000, 8000] as const;
// A stream that ran this long counts as healthy, so a later drop starts a fresh retry budget.
const HEALTHY_RUN_MS = 30_000;

export interface StreamSessionsDeps {
  readonly source: MediaSource;
  readonly publisher: StreamPublisher;
  readonly catalog: DeviceCatalog;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly kinds?: MediaKindRegistry;
}

/** One reader's interest in a device's live stream. */
export interface Hold {
  /** Call when the reader leaves. Idempotent. */
  release(): void;
  /** Resolves when the session ends on its own (retries exhausted) or is stopped. */
  readonly ended: Promise<void>;
}

class Session {
  private holders = 0;
  private readonly abort = new AbortController();
  private handle: PublishHandle | undefined;
  readonly ended: Promise<void>;

  constructor(
    readonly deviceId: string,
    private readonly deps: StreamSessionsDeps,
    private readonly onEnd: () => void,
  ) {
    this.ended = this.run().finally(onEnd);
  }

  hold(): Hold {
    this.holders++;
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        this.holders--;
        if (this.holders === 0) this.stop();
      },
      ended: this.ended,
    };
  }

  stop(): void {
    this.abort.abort();
    this.handle?.stop();
  }

  private isStopped(): boolean {
    return this.abort.signal.aborted;
  }

  private async run(): Promise<void> {
    let failures = 0;
    while (!this.isStopped()) {
      const healthy = await this.attempt();
      if (this.isStopped()) return;
      failures = healthy ? 1 : failures + 1;
      const delay = RETRY_DELAYS_MS[failures - 1];
      if (delay === undefined) {
        this.deps.logger.warn({ deviceId: this.deviceId, failures }, 'Live video unavailable');
        return;
      }
      this.deps.logger.info({ deviceId: this.deviceId, retryInMs: delay }, 'Retrying live call');
      try {
        await this.deps.clock.sleep(delay, this.abort.signal);
      } catch {
        return; // Aborted: the last reader left during the wait.
      }
    }
  }

  /** Runs one live call until it ends. Returns true if it streamed long enough to count as healthy. */
  private async attempt(): Promise<boolean> {
    let call: LiveCall;
    try {
      call = await this.deps.source.startLiveCall(this.deviceId);
    } catch (error) {
      this.deps.logger.warn(
        { deviceId: this.deviceId, err: error instanceof Error ? error.name : 'unknown' },
        'Live call failed to start',
      );
      return false;
    }
    const started = this.deps.clock.now();
    try {
      if (this.isStopped()) return false;
      this.deps.logger.info({ deviceId: this.deviceId }, 'Live call started');
      this.handle = this.deps.publisher.publish(call, this.deviceId);
      const exit = await this.handle.exited;
      if (!exit.requested) {
        this.deps.logger.warn({ deviceId: this.deviceId, code: exit.code }, 'Stream dropped');
      }
    } finally {
      this.handle = undefined;
      await this.endCall(call);
    }
    return this.deps.clock.now() - started >= HEALTHY_RUN_MS;
  }

  private async endCall(call: LiveCall): Promise<void> {
    try {
      await this.deps.source.stopLiveCall(call);
      this.deps.logger.info({ deviceId: this.deviceId }, 'Live call ended');
    } catch (error) {
      // The call times out on SkyBell's side anyway; record it and carry on.
      this.deps.logger.warn(
        { deviceId: this.deviceId, err: error instanceof Error ? error.name : 'unknown' },
        'Live call did not stop cleanly',
      );
    }
  }
}

/** On-demand live streams: one session per device, shared by all readers (FR-5–FR-8). */
export class StreamSessions {
  private readonly sessions = new Map<string, Session>();
  private readonly kinds: MediaKindRegistry;

  constructor(private readonly deps: StreamSessionsDeps) {
    this.kinds = deps.kinds ?? new MediaKindRegistry(defaultMediaKinds);
  }

  /** @throws {DeviceNotFound} when the device is unknown or offers no live video. */
  async hold(deviceId: string): Promise<Hold> {
    const device = await this.deps.catalog.find(deviceId);
    if (!this.kinds.offers(device, videoStream)) throw new DeviceNotFound(deviceId);
    // No await between lookup and insert, so concurrent holds share one session (FR-6).
    let session = this.sessions.get(deviceId);
    if (!session) {
      const created: Session = new Session(deviceId, this.deps, () => {
        if (this.sessions.get(deviceId) === created) this.sessions.delete(deviceId);
      });
      this.sessions.set(deviceId, created);
      session = created;
    }
    return session.hold();
  }

  active(): string[] {
    return [...this.sessions.keys()];
  }

  async stopAll(): Promise<void> {
    const running = [...this.sessions.values()];
    for (const s of running) s.stop();
    await Promise.all(running.map((s) => s.ended));
  }
}

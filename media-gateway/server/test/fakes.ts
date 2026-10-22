import type { Device, LiveCall, Photo, PublishHandle, PublishExit } from '../src/core/model.js';
import type { Clock, Logger, MediaSource, StreamPublisher } from '../src/core/ports.js';

/** Controllable clock: `sleep` resolves only when `advance` passes its deadline. */
export class FakeClock implements Clock {
  private current = 0;
  private sleepers: { until: number; resolve: () => void }[] = [];
  readonly sleeps: number[] = [];

  now(): number {
    return this.current;
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    this.sleeps.push(ms);
    return new Promise((resolve, reject) => {
      const sleeper = { until: this.current + ms, resolve };
      this.sleepers.push(sleeper);
      signal?.addEventListener('abort', () => {
        this.sleepers = this.sleepers.filter((s) => s !== sleeper);
        reject(new Error('aborted', { cause: signal.reason }));
      });
    });
  }

  async advance(ms: number): Promise<void> {
    this.current += ms;
    const due = this.sleepers.filter((s) => s.until <= this.current);
    this.sleepers = this.sleepers.filter((s) => s.until > this.current);
    for (const s of due) s.resolve();
    await flush();
  }
}

/** Lets pending promise callbacks run. */
export async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

export class FakeSource implements MediaSource {
  devices: Device[] = [];
  photos = new Map<string, Photo>();
  listCalls = 0;
  photoCalls = 0;
  startCalls = 0;
  stopCalls = 0;
  /** Number of upcoming `startLiveCall` attempts that will fail. */
  failNextStarts = 0;
  failList = false;

  async listDevices(): Promise<Device[]> {
    this.listCalls++;
    if (this.failList) throw new Error('source down');
    return Promise.resolve(this.devices.map((d) => ({ ...d })));
  }

  async getPhoto(deviceId: string): Promise<Photo> {
    this.photoCalls++;
    const photo = this.photos.get(deviceId);
    if (!photo) throw new Error(`no photo for ${deviceId}`);
    return Promise.resolve(photo);
  }

  async startLiveCall(deviceId: string): Promise<LiveCall> {
    this.startCalls++;
    if (this.failNextStarts > 0) {
      this.failNextStarts--;
      throw new Error('call failed');
    }
    return Promise.resolve({ deviceId, input: { kind: 'url', url: 'testsrc' } });
  }

  async stopLiveCall(): Promise<void> {
    this.stopCalls++;
    return Promise.resolve();
  }
}

export class FakeHandle implements PublishHandle {
  stopped = false;
  private resolveExit!: (exit: PublishExit) => void;
  readonly exited = new Promise<PublishExit>((resolve) => {
    this.resolveExit = resolve;
  });

  constructor(
    readonly call: LiveCall,
    readonly path: string,
  ) {}

  stop(): void {
    this.stopped = true;
    this.resolveExit({ code: null, requested: true });
  }

  /** Simulates the stream process dying on its own. */
  crash(): void {
    this.resolveExit({ code: 1, requested: false });
  }
}

export class FakePublisher implements StreamPublisher {
  readonly handles: FakeHandle[] = [];

  publish(call: LiveCall, path: string): PublishHandle {
    const handle = new FakeHandle(call, path);
    this.handles.push(handle);
    return handle;
  }

  get running(): FakeHandle[] {
    return this.handles.filter((h) => !h.stopped);
  }
}

export interface LogEntry {
  level: string;
  data: Record<string, unknown>;
  msg: string;
}

export class MemoryLogger implements Logger {
  readonly entries: LogEntry[] = [];
  info(data: Record<string, unknown>, msg: string): void {
    this.entries.push({ level: 'info', data, msg });
  }
  warn(data: Record<string, unknown>, msg: string): void {
    this.entries.push({ level: 'warn', data, msg });
  }
  error(data: Record<string, unknown>, msg: string): void {
    this.entries.push({ level: 'error', data, msg });
  }
}

import type { Device, LiveCall, Photo, PublishHandle } from './model.js';

/**
 * An outside system that supplies media. Implementations throw `SourceUnavailable`
 * (or any error, which core wraps) when the system cannot be reached.
 */
export interface MediaSource {
  listDevices(): Promise<Device[]>;
  getPhoto(deviceId: string): Promise<Photo>;
  startLiveCall(deviceId: string): Promise<LiveCall>;
  stopLiveCall(call: LiveCall): Promise<void>;
}

/** Publishes a live call's media to the media server at `path`. */
export interface StreamPublisher {
  publish(call: LiveCall, path: string): PublishHandle;
}

export interface Clock {
  now(): number;
  /** Rejects with `signal.reason` if aborted. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export interface Logger {
  info(data: Record<string, unknown>, msg: string): void;
  warn(data: Record<string, unknown>, msg: string): void;
  error(data: Record<string, unknown>, msg: string): void;
}

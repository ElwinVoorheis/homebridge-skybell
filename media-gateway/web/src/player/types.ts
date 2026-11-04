/** Stops a running stream and frees its resources. */
export type Stop = () => void;

/**
 * Starts playing a device's live stream into `video`. Rejects if it cannot start;
 * calls `onFail` if a started stream breaks later.
 */
export type Starter = (
  video: HTMLVideoElement,
  deviceId: string,
  onFail: () => void,
) => Promise<Stop>;

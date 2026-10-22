/** What a source says a device can do, e.g. `live-video`, `photo`. Media kinds map onto these. */
export type Capability = string;

/** A doorbell or camera as reported by a media source. */
export interface Device {
  readonly id: string;
  readonly name: string;
  readonly capabilities: readonly Capability[];
}

/** A device as shown to consumers: which media kinds it offers. */
export interface DeviceSummary {
  readonly id: string;
  readonly name: string;
  readonly mediaKinds: readonly string[];
}

export interface Photo {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

/** One RTP stream offered by a live call, encrypted with SRTP (AES_CM_128_HMAC_SHA1_80). */
export interface SrtpStream {
  readonly server: string;
  readonly port: number;
  readonly payloadType: number;
  readonly encoding: string;
  readonly sampleRate: number;
  readonly channels?: number | undefined;
  /** Base64 master key + salt. Secret: never log. */
  readonly key: string;
  readonly ssrc: number;
}

/** Where the publisher reads a live call's media from. */
export type StreamInput =
  | { readonly kind: 'srtp'; readonly video: SrtpStream; readonly audio: SrtpStream }
  // Any input FFmpeg can open directly; used by test sources.
  | { readonly kind: 'url'; readonly url: string };

export interface LiveCall {
  readonly deviceId: string;
  readonly input: StreamInput;
}

export interface PublishExit {
  /** Process exit code; `null` when killed. */
  readonly code: number | null;
  /** True when the exit was asked for via `stop()`. */
  readonly requested: boolean;
}

export interface PublishHandle {
  readonly exited: Promise<PublishExit>;
  stop(): void;
}

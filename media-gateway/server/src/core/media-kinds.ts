import type { Device } from './model.js';

/** A kind of media a device can offer. New kinds are added by registering an entry, not by editing others. */
export interface MediaKind {
  readonly kind: string;
  offeredBy(device: Device): boolean;
}

export const videoStream: MediaKind = {
  kind: 'video-stream',
  offeredBy: (device) => device.capabilities.includes('live-video'),
};

export const photo: MediaKind = {
  kind: 'photo',
  offeredBy: (device) => device.capabilities.includes('photo'),
};

export const defaultMediaKinds: readonly MediaKind[] = [videoStream, photo];

export class MediaKindRegistry {
  private readonly kinds: readonly MediaKind[];

  constructor(kinds: readonly MediaKind[]) {
    const names = kinds.map((k) => k.kind);
    const duplicate = names.find((name, i) => names.indexOf(name) !== i);
    if (duplicate !== undefined) throw new Error(`Duplicate media kind: ${duplicate}`);
    this.kinds = kinds;
  }

  kindsFor(device: Device): string[] {
    return this.kinds.filter((k) => k.offeredBy(device)).map((k) => k.kind);
  }

  offers(device: Device, kind: MediaKind): boolean {
    return this.kinds.includes(kind) && kind.offeredBy(device);
  }
}

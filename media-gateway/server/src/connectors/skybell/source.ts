import { z } from 'zod';
import { SourceUnavailable } from '../../core/errors.js';
import type { Device, LiveCall, Photo } from '../../core/model.js';
import type { MediaSource } from '../../core/ports.js';
import type { SkyBellClient } from './client.js';

// SkyBell ids go into URL paths; anything else is treated as a broken reply.
const deviceId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const devicesReply = z.array(z.object({ id: deviceId, name: z.string() }));
// Signed S3 links; https only so the server cannot be pointed at internal addresses.
const avatarReply = z.object({ url: z.url({ protocol: /^https$/ }) });

const IMAGE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

function imageType(header: string | null, url: string): string | undefined {
  const fromHeader = header?.split(';')[0]?.trim().toLowerCase();
  if (fromHeader && Object.values(IMAGE_TYPES).includes(fromHeader)) return fromHeader;
  const extension = new URL(url).pathname.split('.').pop()?.toLowerCase();
  return extension ? IMAGE_TYPES[extension] : undefined;
}

// Every SkyBell HD / Trim Plus supports live calls and an avatar snapshot.
const CAPABILITIES = ['live-video', 'photo'] as const;

/** `MediaSource` backed by the SkyBell cloud. */
export class SkyBellSource implements MediaSource {
  constructor(private readonly client: SkyBellClient) {}

  async listDevices(): Promise<Device[]> {
    const devices = await this.client.request('GET', 'devices/', devicesReply);
    return devices.map((d) => ({ id: d.id, name: d.name, capabilities: [...CAPABILITIES] }));
  }

  async getPhoto(deviceId: string): Promise<Photo> {
    const avatar = await this.client.request('GET', `devices/${deviceId}/avatar/`, avatarReply);
    const { bytes, contentType } = await this.client.download(avatar.url);
    const type = imageType(contentType, avatar.url);
    // Only images are passed to the browser, so a tampered URL cannot serve HTML or scripts.
    if (!type) throw new SourceUnavailable();
    return { bytes, contentType: type };
  }

  startLiveCall(): Promise<LiveCall> {
    return Promise.reject(new Error('not implemented until T008'));
  }

  stopLiveCall(): Promise<void> {
    return Promise.reject(new Error('not implemented until T008'));
  }
}

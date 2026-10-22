import { z } from 'zod';
import type { Device, LiveCall, Photo } from '../../core/model.js';
import type { MediaSource } from '../../core/ports.js';
import type { SkyBellClient } from './client.js';

// SkyBell ids go into URL paths; anything else is treated as a broken reply.
const deviceId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const devicesReply = z.array(z.object({ id: deviceId, name: z.string() }));

// Every SkyBell HD / Trim Plus supports live calls and an avatar snapshot.
const CAPABILITIES = ['live-video', 'photo'] as const;

/** `MediaSource` backed by the SkyBell cloud. */
export class SkyBellSource implements MediaSource {
  constructor(private readonly client: SkyBellClient) {}

  async listDevices(): Promise<Device[]> {
    const devices = await this.client.request('GET', 'devices/', devicesReply);
    return devices.map((d) => ({ id: d.id, name: d.name, capabilities: [...CAPABILITIES] }));
  }

  getPhoto(): Promise<Photo> {
    return Promise.reject(new Error('not implemented until T006'));
  }

  startLiveCall(): Promise<LiveCall> {
    return Promise.reject(new Error('not implemented until T008'));
  }

  stopLiveCall(): Promise<void> {
    return Promise.reject(new Error('not implemented until T008'));
  }
}

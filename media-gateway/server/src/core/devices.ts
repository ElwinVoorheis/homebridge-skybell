import { DeviceNotFound, SourceUnavailable } from './errors.js';
import { photo as photoKind, type MediaKindRegistry } from './media-kinds.js';
import type { Device, DeviceSummary, Photo } from './model.js';
import type { Clock, MediaSource } from './ports.js';

// SkyBell's API takes seconds per call; a minute keeps page loads fast and new devices appear soon (NFR-4, FR-1).
const CACHE_MS = 60_000;

/** Devices reported by the media source, cached briefly. */
export class DeviceCatalog {
  private cache: { devices: Device[]; at: number } | undefined;

  constructor(
    private readonly source: MediaSource,
    private readonly kinds: MediaKindRegistry,
    private readonly clock: Clock,
  ) {}

  async list(): Promise<DeviceSummary[]> {
    const devices = await this.devices();
    return devices.map((d) => ({ id: d.id, name: d.name, mediaKinds: this.kinds.kindsFor(d) }));
  }

  /** @throws {DeviceNotFound} */
  async find(deviceId: string): Promise<Device> {
    const device = (await this.devices()).find((d) => d.id === deviceId);
    if (!device) throw new DeviceNotFound(deviceId);
    return device;
  }

  /** @throws {DeviceNotFound} when unknown or it offers no photo; {SourceUnavailable} on source failure. */
  async getPhoto(deviceId: string): Promise<Photo> {
    const device = await this.find(deviceId);
    if (!this.kinds.offers(device, photoKind)) throw new DeviceNotFound(deviceId);
    return guard(() => this.source.getPhoto(deviceId));
  }

  private async devices(): Promise<Device[]> {
    const now = this.clock.now();
    if (this.cache && now - this.cache.at < CACHE_MS) return this.cache.devices;
    const devices = await guard(() => this.source.listDevices());
    this.cache = { devices, at: now };
    return devices;
  }
}

async function guard<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof SourceUnavailable) throw error;
    throw new SourceUnavailable({ cause: error });
  }
}

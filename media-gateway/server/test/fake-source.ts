import type { Device, LiveCall, Photo } from '../src/core/model.js';
import type { MediaSource } from '../src/core/ports.js';

// Smallest valid JPEG header bytes; enough for content checks.
const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9,
]);

/**
 * A second `MediaSource` used only by the end-to-end test: an FFmpeg test pattern instead of SkyBell.
 * Proves a new source plugs in without changes to core (FR-4).
 */
export class TestPatternSource implements MediaSource {
  startCalls = 0;
  stopCalls = 0;

  listDevices(): Promise<Device[]> {
    return Promise.resolve([
      { id: 'test-cam', name: 'Test camera', capabilities: ['live-video', 'photo'] },
    ]);
  }

  getPhoto(): Promise<Photo> {
    return Promise.resolve({ bytes: JPEG, contentType: 'image/jpeg' });
  }

  startLiveCall(deviceId: string): Promise<LiveCall> {
    this.startCalls++;
    return Promise.resolve({
      deviceId,
      input: { kind: 'url', format: 'lavfi', url: 'testsrc=size=640x360:rate=15' },
    });
  }

  stopLiveCall(): Promise<void> {
    this.stopCalls++;
    return Promise.resolve();
  }
}

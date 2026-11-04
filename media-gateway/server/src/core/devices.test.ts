import { beforeEach, describe, expect, it } from 'vitest';
import { FakeClock, FakeSource } from '../../test/fakes.js';
import { DeviceCatalog } from './devices.js';
import { DeviceNotFound, SourceUnavailable } from './errors.js';
import { MediaKindRegistry, defaultMediaKinds } from './media-kinds.js';

describe('DeviceCatalog', () => {
  let source: FakeSource;
  let clock: FakeClock;
  let catalog: DeviceCatalog;

  beforeEach(() => {
    source = new FakeSource();
    source.devices = [
      { id: 'front', name: 'Front door', capabilities: ['live-video', 'photo'] },
      { id: 'side', name: 'Side gate', capabilities: ['photo'] },
    ];
    clock = new FakeClock();
    catalog = new DeviceCatalog(source, new MediaKindRegistry(defaultMediaKinds), clock);
  });

  it('lists every device with id, name and offered media kinds (AC-1)', async () => {
    expect(await catalog.list()).toEqual([
      { id: 'front', name: 'Front door', mediaKinds: ['video-stream', 'photo'] },
      { id: 'side', name: 'Side gate', mediaKinds: ['photo'] },
    ]);
  });

  it('caches the list for 60 s', async () => {
    await catalog.list();
    await clock.advance(59_999);
    await catalog.list();
    expect(source.listCalls).toBe(1);

    await clock.advance(1);
    await catalog.list();
    expect(source.listCalls).toBe(2);
  });

  it('shows renamed and removed devices once the cache expires', async () => {
    await catalog.list();
    source.devices = [{ id: 'front', name: 'Porch', capabilities: ['photo'] }];
    await clock.advance(60_000);

    expect(await catalog.list()).toEqual([{ id: 'front', name: 'Porch', mediaKinds: ['photo'] }]);
    await expect(catalog.find('side')).rejects.toBeInstanceOf(DeviceNotFound);
  });

  it('wraps source failures as SourceUnavailable and does not cache them', async () => {
    source.failList = true;
    await expect(catalog.list()).rejects.toBeInstanceOf(SourceUnavailable);

    source.failList = false;
    expect(await catalog.list()).toHaveLength(2);
  });

  it('returns the photo of a known device (AC-2)', async () => {
    const photo = { bytes: new Uint8Array([0xff, 0xd8]), contentType: 'image/jpeg' };
    source.photos.set('front', photo);

    expect(await catalog.getPhoto('front')).toEqual(photo);
  });

  it('rejects an unknown device without asking the source for a photo (AC-3)', async () => {
    await expect(catalog.getPhoto('nope')).rejects.toBeInstanceOf(DeviceNotFound);
    expect(source.photoCalls).toBe(0);
  });

  it('rejects a photo for a device that does not offer photos', async () => {
    source.devices = [{ id: 'cam', name: 'Cam', capabilities: ['live-video'] }];
    await expect(catalog.getPhoto('cam')).rejects.toBeInstanceOf(DeviceNotFound);
    expect(source.photoCalls).toBe(0);
  });

  it('wraps a failing photo fetch as SourceUnavailable', async () => {
    await expect(catalog.getPhoto('front')).rejects.toBeInstanceOf(SourceUnavailable);
  });
});

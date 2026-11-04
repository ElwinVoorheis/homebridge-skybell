import { describe, expect, it } from 'vitest';
import { FakeClock, FakeSource } from '../../test/fakes.js';
import { DeviceCatalog } from './devices.js';
import { MediaKindRegistry, defaultMediaKinds } from './media-kinds.js';

describe('MediaKindRegistry', () => {
  it('offers v1 kinds by device capability', () => {
    const registry = new MediaKindRegistry(defaultMediaKinds);
    const device = { id: 'd', name: 'D', capabilities: ['live-video', 'photo'] };

    expect(registry.kindsFor(device)).toEqual(['video-stream', 'photo']);
  });

  it('lists an extra kind without changes to the existing ones (AC-5)', async () => {
    const source = new FakeSource();
    source.devices = [{ id: 'd', name: 'D', capabilities: ['photo', 'thermal'] }];
    const registry = new MediaKindRegistry([
      ...defaultMediaKinds,
      { kind: 'thermal-image', offeredBy: (device) => device.capabilities.includes('thermal') },
    ]);
    const catalog = new DeviceCatalog(source, registry, new FakeClock());

    expect(await catalog.list()).toEqual([
      { id: 'd', name: 'D', mediaKinds: ['photo', 'thermal-image'] },
    ]);
  });

  it('rejects duplicate kinds', () => {
    expect(() => new MediaKindRegistry([...defaultMediaKinds, ...defaultMediaKinds])).toThrow(
      /duplicate/i,
    );
  });
});

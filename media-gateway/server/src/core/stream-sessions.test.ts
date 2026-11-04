import { beforeEach, describe, expect, it } from 'vitest';
import { FakeClock, FakePublisher, FakeSource, MemoryLogger, flush } from '../../test/fakes.js';
import { DeviceCatalog } from './devices.js';
import { DeviceNotFound } from './errors.js';
import { MediaKindRegistry, defaultMediaKinds } from './media-kinds.js';
import { StreamSessions } from './stream-sessions.js';

describe('StreamSessions', () => {
  let source: FakeSource;
  let publisher: FakePublisher;
  let clock: FakeClock;
  let logger: MemoryLogger;
  let sessions: StreamSessions;

  beforeEach(() => {
    source = new FakeSource();
    source.devices = [
      { id: 'front', name: 'Front', capabilities: ['live-video', 'photo'] },
      { id: 'still', name: 'Still', capabilities: ['photo'] },
    ];
    publisher = new FakePublisher();
    clock = new FakeClock();
    logger = new MemoryLogger();
    const catalog = new DeviceCatalog(source, new MediaKindRegistry(defaultMediaKinds), clock);
    sessions = new StreamSessions({ source, publisher, catalog, clock, logger });
  });

  it('starts exactly one call and publishes at the device path for the first reader (AC-6)', async () => {
    await sessions.hold('front');
    await flush();

    expect(source.startCalls).toBe(1);
    expect(publisher.running).toHaveLength(1);
    expect(publisher.running[0]?.path).toBe('front');
  });

  it('shares the running call with a second reader (AC-7)', async () => {
    await sessions.hold('front');
    await sessions.hold('front');
    await flush();

    expect(source.startCalls).toBe(1);
    expect(publisher.handles).toHaveLength(1);
  });

  it('starts only once for two holds in the same tick (FR-6)', async () => {
    await Promise.all([sessions.hold('front'), sessions.hold('front')]);
    await flush();

    expect(source.startCalls).toBe(1);
  });

  it('keeps the call while a reader remains and ends it when the last leaves (AC-8)', async () => {
    const a = await sessions.hold('front');
    const b = await sessions.hold('front');
    await flush();

    a.release();
    await flush();
    expect(publisher.running).toHaveLength(1);
    expect(source.stopCalls).toBe(0);

    b.release();
    await flush();
    expect(publisher.running).toHaveLength(0);
    expect(source.stopCalls).toBe(1);
    expect(sessions.active()).toEqual([]);
  });

  it('retries after 2 s and 4 s and succeeds on the third try (AC-9)', async () => {
    source.failNextStarts = 2;
    await sessions.hold('front');
    await flush();
    expect(source.startCalls).toBe(1);

    await clock.advance(2000);
    expect(source.startCalls).toBe(2);
    await clock.advance(4000);
    expect(source.startCalls).toBe(3);

    expect(clock.sleeps).toEqual([2000, 4000]);
    expect(publisher.running).toHaveLength(1);
  });

  it('ends the session after 1 try + 3 retries, and a new reader starts fresh (AC-10)', async () => {
    source.failNextStarts = 100;
    const hold = await sessions.hold('front');
    let ended = false;
    void hold.ended.then(() => (ended = true));
    await flush();

    await clock.advance(2000);
    await clock.advance(4000);
    await clock.advance(8000);

    expect(source.startCalls).toBe(4);
    expect(clock.sleeps).toEqual([2000, 4000, 8000]);
    expect(ended).toBe(true);
    expect(sessions.active()).toEqual([]);

    await sessions.hold('front');
    await flush();
    expect(source.startCalls).toBe(5);
  });

  it('retries when the stream drops while readers remain (FR-8)', async () => {
    await sessions.hold('front');
    await flush();
    publisher.handles[0]?.crash();
    await flush();

    expect(source.stopCalls).toBe(1);
    await clock.advance(2000);
    expect(source.startCalls).toBe(2);
    expect(publisher.running).toHaveLength(1);
  });

  it('cancels a pending retry when the last reader leaves (FR-7)', async () => {
    source.failNextStarts = 1;
    const hold = await sessions.hold('front');
    await flush();

    hold.release();
    await flush();
    await clock.advance(10_000);

    expect(source.startCalls).toBe(1);
    expect(publisher.handles).toHaveLength(0);
    expect(sessions.active()).toEqual([]);
  });

  it('survives a reconnect storm with at most one call at a time', async () => {
    for (let i = 0; i < 20; i++) {
      const hold = await sessions.hold('front');
      await flush();
      hold.release();
      await flush();
    }

    expect(source.startCalls).toBe(20);
    expect(source.stopCalls).toBe(20);
    expect(publisher.running).toHaveLength(0);
  });

  it('rejects devices that are unknown or offer no live video', async () => {
    await expect(sessions.hold('nope')).rejects.toBeInstanceOf(DeviceNotFound);
    await expect(sessions.hold('still')).rejects.toBeInstanceOf(DeviceNotFound);
    expect(source.startCalls).toBe(0);
  });

  it('stops every session on shutdown', async () => {
    await sessions.hold('front');
    await flush();

    await sessions.stopAll();

    expect(publisher.running).toHaveLength(0);
    expect(source.stopCalls).toBe(1);
  });

  it('logs the device id but never call details', async () => {
    await sessions.hold('front');
    await flush();

    const logged = JSON.stringify(logger.entries);
    expect(logged).toContain('front');
    expect(logged).not.toContain('testsrc');
  });
});

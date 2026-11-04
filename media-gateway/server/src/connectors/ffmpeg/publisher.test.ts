import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { MemoryLogger, flush } from '../../../test/fakes.js';
import type { LiveCall, SrtpStream } from '../../core/model.js';
import { FfmpegPublisher, buildArgs, buildSdp, type ChildLike } from './publisher.js';

const video: SrtpStream = {
  server: '203.0.113.7',
  port: 40000,
  payloadType: 99,
  encoding: 'H264',
  sampleRate: 90000,
  key: 'dmlkZW8ta2V5LXNhbHQtMTIzNDU2Nzg5MDEyMzQ1Ng==',
  ssrc: 1234,
};
const audio: SrtpStream = {
  server: '203.0.113.7',
  port: 40002,
  payloadType: 100,
  encoding: 'L16',
  sampleRate: 8000,
  channels: 1,
  key: 'YXVkaW8ta2V5LXNhbHQtMTIzNDU2Nzg5MDEyMzQ1Ng==',
  ssrc: 5678,
};
const srtpCall: LiveCall = { deviceId: 'front', input: { kind: 'srtp', video, audio } };

class FakeChild extends EventEmitter implements ChildLike {
  readonly stdin = new PassThrough();
  readonly stderr = new PassThrough();
  stdinText = '';
  readonly signals: string[] = [];
  constructor() {
    super();
    this.stdin.on('data', (chunk: Buffer) => (this.stdinText += chunk.toString()));
  }
  kill(signal: NodeJS.Signals): boolean {
    this.signals.push(signal);
    this.emit('exit', null, signal);
    return true;
  }
}

function setup() {
  const spawned: { command: string; args: readonly string[]; child: FakeChild }[] = [];
  const punched: { host: string; ports: number[] }[] = [];
  const logger = new MemoryLogger();
  const publisher = new FfmpegPublisher({
    rtspBaseUrl: 'rtsp://mediamtx:8554',
    logger,
    spawn: (command, args) => {
      const child = new FakeChild();
      spawned.push({ command, args, child });
      return child;
    },
    punch: (host, ports) => {
      punched.push({ host, ports: [...ports] });
      return Promise.resolve();
    },
  });
  return { publisher, spawned, punched, logger };
}

describe('buildSdp', () => {
  it('describes both SRTP streams for FFmpeg', () => {
    const sdp = buildSdp(video, audio);

    expect(sdp).toContain('m=video 40000 RTP/SAVP 99');
    expect(sdp).toContain('c=IN IP4 203.0.113.7');
    expect(sdp).toContain('a=rtpmap:99 H264/90000');
    expect(sdp).toContain(`a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:${video.key}`);
    expect(sdp).toContain('m=audio 40002 RTP/SAVP 100');
    expect(sdp).toContain('a=rtpmap:100 L16/8000/1');
    expect(sdp).toContain('a=ssrc:5678');
  });

  it('uses IP6 for IPv6 servers', () => {
    expect(buildSdp({ ...video, server: '2001:db8::1' }, audio)).toContain('c=IN IP6 2001:db8::1');
  });
});

describe('buildArgs', () => {
  it('copies video, encodes audio to Opus and pushes RTSP (FR-3)', () => {
    const args = buildArgs(srtpCall.input, 'rtsp://mediamtx:8554/front');

    expect(args).toEqual(expect.arrayContaining(['-c:v', 'copy', '-c:a', 'libopus']));
    expect(args.slice(-3)).toEqual(['-f', 'rtsp', 'rtsp://mediamtx:8554/front']);
    expect(args.join(' ')).toContain('-i pipe:0');
  });

  it('encodes video for plain URL inputs', () => {
    const args = buildArgs(
      { kind: 'url', url: 'testsrc=size=640x360', format: 'lavfi' },
      'rtsp://m/x',
    );

    expect(args.join(' ')).toContain('-f lavfi -i testsrc=size=640x360');
    expect(args).toEqual(expect.arrayContaining(['-c:v', 'libx264']));
  });
});

describe('FfmpegPublisher', () => {
  it('punches the firewall, then spawns ffmpeg with an argument list and the SDP on stdin', async () => {
    const { publisher, spawned, punched } = setup();

    publisher.publish(srtpCall, 'front');
    await flush();

    expect(punched).toEqual([{ host: '203.0.113.7', ports: [40000, 40002] }]);
    expect(spawned).toHaveLength(1);
    expect(spawned[0]?.command).toBe('ffmpeg');
    expect(Array.isArray(spawned[0]?.args)).toBe(true);
    expect(spawned[0]?.args.at(-1)).toBe('rtsp://mediamtx:8554/front');
    expect(spawned[0]?.child.stdinText).toContain('m=video 40000');
  });

  it('reports an unrequested exit', async () => {
    const { publisher, spawned } = setup();
    const handle = publisher.publish(srtpCall, 'front');
    await flush();

    spawned[0]?.child.emit('exit', 1, null);

    await expect(handle.exited).resolves.toEqual({ code: 1, requested: false });
  });

  it('stops ffmpeg on request', async () => {
    const { publisher, spawned } = setup();
    const handle = publisher.publish(srtpCall, 'front');
    await flush();

    handle.stop();

    expect(spawned[0]?.child.signals).toEqual(['SIGTERM']);
    await expect(handle.exited).resolves.toEqual({ code: null, requested: true });
  });

  it('does not spawn if stopped before the punch finishes', async () => {
    const { publisher, spawned } = setup();
    const handle = publisher.publish(srtpCall, 'front');
    handle.stop();
    await flush();

    expect(spawned).toHaveLength(0);
    await expect(handle.exited).resolves.toEqual({ code: null, requested: true });
  });

  it('logs ffmpeg warnings without SRTP keys', async () => {
    const { publisher, spawned, logger } = setup();
    publisher.publish(srtpCall, 'front');
    await flush();

    spawned[0]?.child.stderr.write(`bad crypto line inline:${video.key}\n`);
    await flush();

    const logged = JSON.stringify(logger.entries);
    expect(logged).toContain('bad crypto line');
    expect(logged).not.toContain(video.key);
  });
});

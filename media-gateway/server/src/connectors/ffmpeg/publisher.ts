import { spawn as nodeSpawn } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { isIPv6 } from 'node:net';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import type {
  LiveCall,
  PublishExit,
  PublishHandle,
  SrtpStream,
  StreamInput,
} from '../../core/model.js';
import type { Logger, StreamPublisher } from '../../core/ports.js';

/** The parts of a child process the publisher uses; lets tests stub the process. */
export interface ChildLike {
  readonly stdin: Writable | null;
  readonly stderr: Readable | null;
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  kill(signal: NodeJS.Signals): boolean;
}

export type Spawn = (command: string, args: readonly string[]) => ChildLike;
export type Punch = (host: string, ports: readonly number[]) => Promise<void>;

export interface FfmpegPublisherOptions {
  /** e.g. `rtsp://mediamtx:8554`; the path is appended. */
  readonly rtspBaseUrl: string;
  readonly logger: Logger;
  readonly ffmpegPath?: string;
  readonly spawn?: Spawn;
  readonly punch?: Punch;
}

// FFmpeg gets a few seconds to close the RTSP session cleanly before it is killed.
const KILL_AFTER_MS = 5000;

/** Builds the SDP that tells FFmpeg where the SRTP streams arrive and how to decrypt them. */
export function buildSdp(video: SrtpStream, audio: SrtpStream): string {
  const media = (kind: 'video' | 'audio', s: SrtpStream, rtpmap: string): string[] => [
    `m=${kind} ${s.port} RTP/SAVP ${s.payloadType}`,
    `c=IN ${isIPv6(s.server) ? 'IP6' : 'IP4'} ${s.server}`,
    `a=rtpmap:${s.payloadType} ${rtpmap}`,
    `a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:${s.key}`,
    `a=ssrc:${s.ssrc}`,
  ];
  return [
    'v=0',
    'o=- 0 0 IN IP4 127.0.0.1',
    's=skybell',
    't=0 0',
    ...media('video', video, `${video.encoding}/${video.sampleRate}`),
    // SkyBell sends 16-bit PCM; L16 is what the legacy plugin declared.
    ...media('audio', audio, `L16/${audio.sampleRate}/${audio.channels ?? 1}`),
    '',
  ].join('\r\n');
}

/** FFmpeg arguments. Always an array: nothing here is ever passed through a shell. */
export function buildArgs(input: StreamInput, outputUrl: string): string[] {
  const common = ['-hide_banner', '-loglevel', 'warning', '-nostdin'];
  const audioOut = ['-c:a', 'libopus', '-b:a', '32k', '-ar', '48000'];
  const output = ['-rtsp_transport', 'tcp', '-f', 'rtsp', outputUrl];

  if (input.kind === 'srtp') {
    return [
      ...common.filter((a) => a !== '-nostdin'),
      '-protocol_whitelist',
      'pipe,udp,rtp,srtp,crypto',
      // SDP declares big-endian L16; SkyBell's samples are little-endian (as in the legacy plugin).
      '-acodec',
      'pcm_s16le',
      '-f',
      'sdp',
      '-i',
      'pipe:0',
      '-map',
      '0:v',
      '-map',
      '0:a',
      '-c:v',
      'copy',
      ...audioOut,
      ...output,
    ];
  }
  return [
    ...common,
    '-re',
    ...(input.format ? ['-f', input.format] : []),
    '-i',
    input.url,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-tune',
    'zerolatency',
    '-g',
    '30',
    ...audioOut,
    ...output,
  ];
}

/** Sends one empty UDP packet per port so the NAT lets SkyBell's media back in (legacy `sendPunchPackets`). */
export const punchUdp: Punch = async (host, ports) => {
  for (const port of ports) {
    await new Promise<void>((resolve, reject) => {
      const socket = createSocket(isIPv6(host) ? 'udp6' : 'udp4');
      socket.once('error', (error) => {
        socket.close();
        reject(error);
      });
      socket.bind(port, () => {
        socket.send(Buffer.alloc(8), port, host, (error) => {
          socket.close();
          if (error) reject(error);
          else resolve();
        });
      });
    });
  }
};

function redact(line: string): string {
  return line.replace(/inline:\S+/g, 'inline:[redacted]');
}

/** Publishes live calls to MediaMTX by running FFmpeg. */
export class FfmpegPublisher implements StreamPublisher {
  private readonly spawn: Spawn;
  private readonly punch: Punch;

  constructor(private readonly options: FfmpegPublisherOptions) {
    this.spawn =
      options.spawn ??
      ((cmd, args) => nodeSpawn(cmd, [...args], { stdio: ['pipe', 'ignore', 'pipe'] }));
    this.punch = options.punch ?? punchUdp;
  }

  publish(call: LiveCall, path: string): PublishHandle {
    let stopRequested = false;
    let child: ChildLike | undefined;
    let resolveExit!: (exit: PublishExit) => void;
    const exited = new Promise<PublishExit>((resolve) => {
      resolveExit = resolve;
    });
    const log = this.options.logger;

    const start = async (): Promise<void> => {
      if (call.input.kind === 'srtp') {
        const { video, audio } = call.input;
        await this.punch(video.server, [video.port, audio.port]);
      }
      if (stopRequested) {
        resolveExit({ code: null, requested: true });
        return;
      }

      const args = buildArgs(call.input, `${this.options.rtspBaseUrl}/${path}`);
      const proc = this.spawn(this.options.ffmpegPath ?? 'ffmpeg', args);
      child = proc;
      proc.on('exit', (code) => {
        resolveExit({ code, requested: stopRequested });
      });
      if (proc.stderr) {
        createInterface({ input: proc.stderr }).on('line', (line) => {
          log.warn({ deviceId: call.deviceId, ffmpeg: redact(line).slice(0, 500) }, 'FFmpeg');
        });
      }
      if (call.input.kind === 'srtp') {
        proc.stdin?.end(buildSdp(call.input.video, call.input.audio));
      }
    };

    start().catch((error: unknown) => {
      log.warn(
        { deviceId: call.deviceId, err: error instanceof Error ? error.name : 'unknown' },
        'Could not start FFmpeg',
      );
      resolveExit({ code: null, requested: stopRequested });
    });

    return {
      exited,
      stop: () => {
        stopRequested = true;
        if (!child) return;
        const proc = child;
        proc.kill('SIGTERM');
        const timer = setTimeout(() => proc.kill('SIGKILL'), KILL_AFTER_MS);
        void exited.then(() => {
          clearTimeout(timer);
        });
      },
    };
  }
}

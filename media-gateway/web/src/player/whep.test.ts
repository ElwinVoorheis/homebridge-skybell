import { describe, expect, it, vi } from 'vitest';
import { startWhep, whepUrl, type PeerFactory } from './whep';

class FakePeer {
  static last: FakePeer | undefined;
  readonly transceivers: string[] = [];
  remote: RTCSessionDescriptionInit | undefined;
  iceGatheringState: RTCIceGatheringState = 'complete';
  connectionState: RTCPeerConnectionState = 'new';
  localDescription: { sdp: string } | null = null;
  ontrack: ((e: { streams: MediaStream[] }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  closed = false;
  constructor() {
    FakePeer.last = this;
  }
  addTransceiver(kind: string) {
    this.transceivers.push(kind);
  }
  createOffer() {
    return Promise.resolve({ type: 'offer' as const, sdp: 'v=0 offer' });
  }
  setLocalDescription(d: { sdp: string }) {
    this.localDescription = d;
    return Promise.resolve();
  }
  setRemoteDescription(d: RTCSessionDescriptionInit) {
    this.remote = d;
    return Promise.resolve();
  }
  addEventListener() {
    return undefined;
  }
  close() {
    this.closed = true;
  }
}

const factory: PeerFactory = () => new FakePeer() as unknown as RTCPeerConnection;

describe('startWhep', () => {
  it('builds the same-origin WHEP URL for a device', () => {
    expect(whepUrl('front')).toBe(`${window.location.origin}/webrtc/front/whep`);
  });

  it('posts a receive-only offer and applies the answer', async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        new Response('v=0 answer', {
          status: 201,
          headers: { location: '/webrtc/front/whep/abc' },
        }),
      ),
    );
    const video = document.createElement('video');

    await startWhep(video, 'front', () => undefined, { peer: factory, fetch: fetcher });

    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(whepUrl('front'));
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/sdp' });
    expect(init.body).toBe('v=0 offer');
    expect(FakePeer.last?.transceivers).toEqual(['video', 'audio']);
    expect(FakePeer.last?.remote).toEqual({ type: 'answer', sdp: 'v=0 answer' });
  });

  it('fails and closes the connection when the server refuses', async () => {
    const fetcher = vi.fn(() => Promise.resolve(new Response('no', { status: 404 })));

    await expect(
      startWhep(document.createElement('video'), 'front', () => undefined, {
        peer: factory,
        fetch: fetcher,
      }),
    ).rejects.toThrow();
    expect(FakePeer.last?.closed).toBe(true);
  });

  it('reports a failed connection and closes on stop', async () => {
    const fetcher = vi.fn(() => Promise.resolve(new Response('v=0 answer', { status: 201 })));
    const onFail = vi.fn();
    const stop = await startWhep(document.createElement('video'), 'front', onFail, {
      peer: factory,
      fetch: fetcher,
    });
    const peer = FakePeer.last;
    if (!peer) throw new Error('no peer');

    peer.connectionState = 'failed';
    peer.onconnectionstatechange?.();
    expect(onFail).toHaveBeenCalledOnce();

    stop();
    expect(peer.closed).toBe(true);
  });
});

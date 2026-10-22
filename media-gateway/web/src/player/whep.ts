import type { Stop } from './types';

export type PeerFactory = () => RTCPeerConnection;

interface WhepDeps {
  readonly peer: PeerFactory;
  readonly fetch: typeof fetch;
}

const defaults: WhepDeps = {
  peer: () => new RTCPeerConnection(),
  fetch: (...args) => fetch(...args),
};

// Without trickle ICE the offer waits for candidates; on a LAN this takes well under this limit.
const ICE_GATHER_MS = 2000;

/** MediaMTX's WHEP endpoint, proxied on the same origin by nginx (plan §4). */
export function whepUrl(deviceId: string): string {
  return new URL(`/webrtc/${encodeURIComponent(deviceId)}/whep`, window.location.origin).toString();
}

function iceGathered(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = (): void => {
      resolve();
    };
    setTimeout(done, ICE_GATHER_MS);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') done();
    });
  });
}

/** Low-delay playback over WebRTC using the WHEP protocol (FR-10). */
export async function startWhep(
  video: HTMLVideoElement,
  deviceId: string,
  onFail: () => void,
  deps: WhepDeps = defaults,
): Promise<Stop> {
  const pc = deps.peer();
  try {
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) video.srcObject = stream;
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') onFail();
    };

    await pc.setLocalDescription(await pc.createOffer());
    await iceGathered(pc);
    const offer = pc.localDescription?.sdp;
    if (!offer) throw new Error('No local offer');

    const response = await deps.fetch(whepUrl(deviceId), {
      method: 'POST',
      headers: { 'content-type': 'application/sdp' },
      body: offer,
    });
    if (response.status !== 201) throw new Error(`WHEP refused (${response.status})`);
    await pc.setRemoteDescription({ type: 'answer', sdp: await response.text() });
  } catch (error) {
    pc.close();
    throw error;
  }

  return () => {
    pc.onconnectionstatechange = null;
    pc.close();
    video.srcObject = null;
  };
}

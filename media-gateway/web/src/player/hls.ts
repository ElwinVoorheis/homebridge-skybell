import type { Stop } from './types';

/** MediaMTX's HLS playlist, proxied on the same origin by nginx (plan §4). */
export function hlsUrl(deviceId: string): string {
  return new URL(
    `/hls/${encodeURIComponent(deviceId)}/index.m3u8`,
    window.location.origin,
  ).toString();
}

/** Compatible playback over HLS: native on Safari/iOS, hls.js elsewhere (FR-10). */
export async function startHls(
  video: HTMLVideoElement,
  deviceId: string,
  onFail: () => void,
): Promise<Stop> {
  const url = hlsUrl(deviceId);

  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
    video.addEventListener('error', onFail, { once: true });
    return () => {
      video.removeEventListener('error', onFail);
      video.removeAttribute('src');
      video.load();
    };
  }

  // Loaded only when needed: most browsers play WebRTC and never download hls.js.
  const { default: Hls } = await import('hls.js');
  if (!Hls.isSupported()) throw new Error('HLS is not supported in this browser');

  const hls = new Hls({ lowLatencyMode: true });
  await new Promise<void>((resolve, reject) => {
    hls.once(Hls.Events.MANIFEST_PARSED, () => {
      resolve();
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      reject(new Error(`HLS error: ${data.details}`));
      onFail();
    });
    hls.loadSource(url);
    hls.attachMedia(video);
  }).catch((error: unknown) => {
    hls.destroy();
    throw error;
  });

  return () => {
    hls.destroy();
  };
}

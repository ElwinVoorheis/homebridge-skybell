import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { DeviceCatalog } from '../../core/devices.js';
import { videoStream } from '../../core/media-kinds.js';
import { registerErrorHandling } from './errors.js';

export interface PublicAppDeps {
  readonly catalog: DeviceCatalog;
  /** e.g. `rtsp://nvr.lan:8554`; the device id is appended as the path. */
  readonly rtspPublicUrl: string;
  readonly logger: FastifyBaseLogger;
}

/** The browser-facing API (port 3000). */
export function buildPublicApp(deps: PublicAppDeps): FastifyInstance {
  const app = Fastify({ loggerInstance: deps.logger });
  registerErrorHandling(app);

  app.get('/api/devices', async () => {
    const devices = await deps.catalog.list();
    return devices.map((d) => ({
      ...d,
      rtspUrl: d.mediaKinds.includes(videoStream.kind) ? `${deps.rtspPublicUrl}/${d.id}` : null,
    }));
  });

  return app;
}

import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { DeviceCatalog } from '../../core/devices.js';
import { videoStream } from '../../core/media-kinds.js';
import { parseDeviceId } from './device-id.js';
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

  app.get('/api/devices/:id/media/photo', async (request, reply) => {
    const photo = await deps.catalog.getPhoto(parseDeviceId(request.params));
    return reply
      .header('content-type', photo.contentType)
      .header('cache-control', 'no-store')
      .header('x-content-type-options', 'nosniff')
      .send(Buffer.from(photo.bytes));
  });

  return app;
}

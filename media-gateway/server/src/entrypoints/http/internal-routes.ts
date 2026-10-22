import { createHash, timingSafeEqual } from 'node:crypto';
import { PassThrough } from 'node:stream';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { StreamSessions } from '../../core/stream-sessions.js';
import { parseDeviceId } from './device-id.js';
import { registerErrorHandling } from './errors.js';

export interface InternalAppDeps {
  readonly sessions: StreamSessions;
  readonly secret: string;
  readonly logger: FastifyBaseLogger;
}

// Hashing first gives equal-length buffers, so the comparison takes the same time whatever the input.
function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** The API MediaMTX calls on the Docker network (port 3001). Never exposed to browsers. */
export function buildInternalApp(deps: InternalAppDeps): FastifyInstance {
  const app = Fastify({ loggerInstance: deps.logger });
  registerErrorHandling(app);
  const expected = digest(deps.secret);

  app.addHook('onRequest', async (request, reply) => {
    const given = request.headers['x-gateway-secret'];
    if (typeof given !== 'string' || !timingSafeEqual(digest(given), expected)) {
      return reply.status(401).send({ error: { code: 'unauthorized', message: 'Unauthorized' } });
    }
  });

  /**
   * MediaMTX's `runOnDemand` keeps this request open while the path has readers.
   * Open = keep the live call running; closed = release it. The reply ends when the session gives up.
   */
  app.get('/internal/streams/:id/hold', async (request, reply) => {
    const hold = await deps.sessions.hold(parseDeviceId(request.params));
    const body = new PassThrough();
    // Headers only go out with the first chunk; send one so MediaMTX's client sees the hold is accepted.
    body.write('holding\n');
    reply.raw.once('close', () => {
      hold.release();
    });
    void hold.ended.then(() => body.end());
    return reply.header('content-type', 'text/plain').send(body);
  });

  return app;
}

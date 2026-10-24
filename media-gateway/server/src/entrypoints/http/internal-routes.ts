import { createHash, timingSafeEqual } from 'node:crypto';
import { PassThrough } from 'node:stream';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { StreamSessions } from '../../core/stream-sessions.js';
import { isDeviceId, parseDeviceId } from './device-id.js';
import { registerErrorHandling } from './errors.js';

export interface InternalAppDeps {
  readonly sessions: StreamSessions;
  readonly secret: string;
  readonly logger: FastifyBaseLogger;
}

/** The RTSP user FFmpeg publishes as; its password is the internal secret. */
export const PUBLISH_USER = 'gateway';
const AUTH_PATH = '/internal/mediamtx/auth';

// Hashing first gives equal-length buffers, so the comparison takes the same time whatever the input.
function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

const authRequest = z.object({
  action: z.string(),
  user: z.string(),
  password: z.string(),
  path: z.string(),
});

/** The API MediaMTX calls on the Docker network (port 3001). Never exposed to browsers. */
export function buildInternalApp(deps: InternalAppDeps): FastifyInstance {
  const app = Fastify({ loggerInstance: deps.logger });
  registerErrorHandling(app);
  const expected = digest(deps.secret);
  const isSecret = (value: unknown): boolean =>
    typeof value === 'string' && timingSafeEqual(digest(value), expected);

  app.addHook('onRequest', async (request, reply) => {
    // MediaMTX's auth hook cannot send custom headers; that route checks credentials in its body instead.
    if (request.url === AUTH_PATH) return;
    if (!isSecret(request.headers['x-gateway-secret'])) {
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

  /**
   * MediaMTX `authMethod: http`: only the gateway may publish, so nobody on the LAN can
   * replace a doorbell feed. Reads are open (access is controlled by the network/proxy, NFR-3).
   */
  app.post(AUTH_PATH, async (request, reply) => {
    const parsed = authRequest.safeParse(request.body);
    const allowed =
      parsed.success &&
      (parsed.data.action === 'read' ||
        (parsed.data.action === 'publish' &&
          parsed.data.user === PUBLISH_USER &&
          isSecret(parsed.data.password) &&
          isDeviceId(parsed.data.path)));
    return reply.status(allowed ? 200 : 401).send();
  });

  return app;
}

import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DeviceNotFound, LiveCallFailed, SourceUnavailable } from '../../core/errors.js';

export class InvalidDeviceId extends Error {
  override readonly name = 'InvalidDeviceId';
  constructor() {
    super('Invalid device id');
  }
}

interface ErrorReply {
  status: number;
  code: string;
  message: string;
}

function toReply(error: unknown): ErrorReply {
  if (error instanceof InvalidDeviceId) {
    return { status: 400, code: 'invalid_device_id', message: error.message };
  }
  if (error instanceof DeviceNotFound) {
    return { status: 404, code: 'device_not_found', message: error.message };
  }
  if (error instanceof SourceUnavailable) {
    return { status: 502, code: 'source_unavailable', message: error.message };
  }
  if (error instanceof LiveCallFailed) {
    return { status: 502, code: 'live_call_failed', message: error.message };
  }
  return { status: 500, code: 'internal_error', message: 'Internal error' };
}

/** Maps domain errors to `{ error: { code, message } }` replies (spec §7); logs the cause without secrets. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const mapped = toReply(error);
    const log =
      mapped.status >= 500
        ? request.log.error.bind(request.log)
        : request.log.info.bind(request.log);
    // Only the error name and its cause's name: messages from outside systems may echo request data.
    log(
      {
        err: {
          name: error.name,
          cause: error.cause instanceof Error ? error.cause.name : undefined,
        },
      },
      mapped.message,
    );
    return reply
      .status(mapped.status)
      .send({ error: { code: mapped.code, message: mapped.message } });
  });
  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ error: { code: 'not_found', message: 'Not found' } }),
  );
}

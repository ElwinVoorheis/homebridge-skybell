import { pino, type DestinationStream, type Logger as PinoLogger } from 'pino';

/** Log fields that may carry secrets (NFR-1). Values are replaced, never printed. */
export const REDACT_PATHS = [
  'password',
  'token',
  'access_token',
  'key',
  'sdp',
  '*.password',
  '*.token',
  '*.access_token',
  '*.key',
  '*.sdp',
  'req.headers.authorization',
  'req.headers["x-gateway-secret"]',
];

export function createLogger(level: string, destination?: DestinationStream): PinoLogger {
  const options = { level, redact: { paths: REDACT_PATHS, censor: '[redacted]' } };
  return destination ? pino(options, destination) : pino(options);
}

import { z } from 'zod';

/** Thrown when the environment is incomplete or invalid. Names variables, never their values. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

const port = z.coerce.number().int().min(1).max(65535);

const schema = z.object({
  SKYBELL_USERNAME: z.string().min(1),
  SKYBELL_PASSWORD: z.string().min(1),
  // Guards the internal hold route that starts live calls; short secrets are guessable.
  INTERNAL_SECRET: z.string().min(16),
  RTSP_PUBLIC_HOST: z.string().min(1),
  RTSP_PUBLIC_PORT: port.default(8554),
  PUBLIC_PORT: port.default(3000),
  INTERNAL_PORT: port.default(3001),
  MEDIAMTX_RTSP_URL: z.url({ protocol: /^rtsp$/ }).default('rtsp://mediamtx:8554'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export interface Config {
  readonly skybell: { readonly username: string; readonly password: string };
  readonly internalSecret: string;
  readonly publicPort: number;
  readonly internalPort: number;
  /** Base RTSP address shown to users, e.g. `rtsp://nvr.lan:8554`. */
  readonly rtspPublicUrl: string;
  /** Base RTSP address FFmpeg publishes to inside the Docker network. */
  readonly mediamtxRtspUrl: string;
  readonly logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
}

/**
 * Parses and validates the process environment. The only place that reads settings.
 * @throws {ConfigError} listing every invalid or missing variable name.
 */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): Config {
  const result = schema.safeParse(env);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new ConfigError(`Invalid or missing environment variables: ${names.join(', ')}`);
  }
  const e = result.data;
  return {
    skybell: { username: e.SKYBELL_USERNAME, password: e.SKYBELL_PASSWORD },
    internalSecret: e.INTERNAL_SECRET,
    publicPort: e.PUBLIC_PORT,
    internalPort: e.INTERNAL_PORT,
    rtspPublicUrl: `rtsp://${e.RTSP_PUBLIC_HOST}:${e.RTSP_PUBLIC_PORT}`,
    mediamtxRtspUrl: e.MEDIAMTX_RTSP_URL.replace(/\/$/, ''),
    logLevel: e.LOG_LEVEL,
  };
}

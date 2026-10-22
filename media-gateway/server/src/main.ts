import { loadConfig } from './config/env.js';
import { systemClock } from './connectors/clock/system-clock.js';
import { FfmpegPublisher } from './connectors/ffmpeg/publisher.js';
import { SkyBellClient } from './connectors/skybell/client.js';
import { SkyBellSource } from './connectors/skybell/source.js';
import { DeviceCatalog } from './core/devices.js';
import { MediaKindRegistry, defaultMediaKinds } from './core/media-kinds.js';
import type { MediaSource } from './core/ports.js';
import { StreamSessions } from './core/stream-sessions.js';
import { buildInternalApp } from './entrypoints/http/internal-routes.js';
import { createLogger } from './entrypoints/http/logging.js';
import { buildPublicApp } from './entrypoints/http/public-routes.js';

/**
 * Wiring: plugs connectors into core and starts both HTTP servers.
 * `source` can be replaced (the e2e test passes a fake); production uses SkyBell.
 */
export async function start(env: NodeJS.ProcessEnv, sourceOverride?: MediaSource): Promise<void> {
  const config = loadConfig(env);
  const logger = createLogger(config.logLevel);

  const source =
    sourceOverride ??
    new SkyBellSource(
      new SkyBellClient({
        credentials: config.skybell,
        logger: logger.child({ component: 'skybell' }),
      }),
    );
  const kinds = new MediaKindRegistry(defaultMediaKinds);
  const catalog = new DeviceCatalog(source, kinds, systemClock);
  const publisher = new FfmpegPublisher({
    rtspBaseUrl: config.mediamtxRtspUrl,
    logger: logger.child({ component: 'ffmpeg' }),
  });
  const sessions = new StreamSessions({
    source,
    publisher,
    catalog,
    clock: systemClock,
    kinds,
    logger: logger.child({ component: 'streams' }),
  });

  const publicApp = buildPublicApp({ catalog, rtspPublicUrl: config.rtspPublicUrl, logger });
  const internalApp = buildInternalApp({ sessions, secret: config.internalSecret, logger });

  const shutdown = async (): Promise<void> => {
    logger.info({}, 'Shutting down');
    // Live calls first, so no SkyBell call or FFmpeg process outlives the server.
    await sessions.stopAll();
    await Promise.all([publicApp.close(), internalApp.close()]);
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());

  await publicApp.listen({ host: '0.0.0.0', port: config.publicPort });
  await internalApp.listen({ host: '0.0.0.0', port: config.internalPort });
}

export function exitOnStartupError(error: unknown): never {
  // Config errors name variables only; anything else is reported by name to avoid leaking secrets.
  const message = error instanceof Error ? `${error.name}: ${error.message}` : 'Startup failed';
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  start(process.env).catch(exitOnStartupError);
}

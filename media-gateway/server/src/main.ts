import { loadConfig } from './config/env.js';
import { systemClock } from './connectors/clock/system-clock.js';
import { SkyBellClient } from './connectors/skybell/client.js';
import { SkyBellSource } from './connectors/skybell/source.js';
import { DeviceCatalog } from './core/devices.js';
import { MediaKindRegistry, defaultMediaKinds } from './core/media-kinds.js';
import { createLogger } from './entrypoints/http/logging.js';
import { buildPublicApp } from './entrypoints/http/public-routes.js';

/** Wiring: plugs connectors into core and starts the HTTP servers. */
async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const logger = createLogger(config.logLevel);

  const client = new SkyBellClient({
    credentials: config.skybell,
    logger: logger.child({ component: 'skybell' }),
  });
  const source = new SkyBellSource(client);
  const catalog = new DeviceCatalog(source, new MediaKindRegistry(defaultMediaKinds), systemClock);

  const publicApp = buildPublicApp({ catalog, rtspPublicUrl: config.rtspPublicUrl, logger });

  const shutdown = async (): Promise<void> => {
    logger.info({}, 'Shutting down');
    await publicApp.close();
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());

  await publicApp.listen({ host: '0.0.0.0', port: config.publicPort });
}

main().catch((error: unknown) => {
  // Config errors name variables only; anything else is logged by name to avoid leaking secrets.
  const message = error instanceof Error ? `${error.name}: ${error.message}` : 'Startup failed';
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

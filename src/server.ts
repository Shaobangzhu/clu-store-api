import { createCatalogDatabase } from './lib/catalog-database.js';
import { createDatabase } from './lib/database.js';
import { createApp } from './app.js';
import { parseEnv } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { createAuthRepository } from './modules/auth/repository.js';
import { createAuthService } from './modules/auth/service.js';
import { initializePasswordHashing } from './modules/auth/password.js';

const config = parseEnv(process.env);
const logger = createLogger(config);
const database = config.DATABASE_URL ? createDatabase(config.DATABASE_URL, config.DB_CHECK_TIMEOUT_MS) : undefined;
const auth = database && config.JWT_SECRET ? createAuthService(createAuthRepository(database.client), config) : undefined;
if (auth) await initializePasswordHashing();
else logger.warn('Authentication is disabled until DATABASE_URL and JWT_SECRET are configured');
const server = createApp(config, logger, database?.check, {
  ...(database ? { catalog: createCatalogDatabase(database.client), cartDatabase: database.client, ordersDatabase: database.client } : {}),
  ...(auth ? { auth } : {}),
}).listen(config.PORT, config.HOST, () => {
  logger.info({ host: config.HOST, port: config.PORT }, 'HTTP server listening');
});
server.requestTimeout = 30000;
server.headersTimeout = 15000;
server.keepAliveTimeout = 5000;
server.on('error', () => {
  logger.fatal('HTTP server failed');
  process.exitCode = 1;
  void database?.disconnect().catch(() => logger.error('Database shutdown failed'));
});

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Stopping HTTP server');
  const deadline = setTimeout(() => {
    logger.error('HTTP shutdown deadline exceeded');
    server.closeAllConnections();
    process.exit(1);
  }, config.SHUTDOWN_TIMEOUT_MS);
  deadline.unref();
  server.close((error) => {
    void (async () => {
      try {
        await database?.disconnect();
        process.exitCode = error ? 1 : 0;
        logger.info('HTTP server and database pool stopped');
      } catch {
        process.exitCode = 1;
        logger.error('Database shutdown failed');
      } finally {
        clearTimeout(deadline);
      }
    })();
  });
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

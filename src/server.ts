import { createApp } from './app.js';
import { parseEnv } from './config/env.js';
import { createLogger } from './lib/logger.js';

const config = parseEnv(process.env);
const logger = createLogger(config);
const server = createApp(config, logger).listen(config.PORT, config.HOST, () => {
  logger.info({ host: config.HOST, port: config.PORT }, 'HTTP server listening');
});
server.requestTimeout = 30000;
server.headersTimeout = 15000;
server.keepAliveTimeout = 5000;
server.on('error', () => {
  logger.fatal('HTTP server failed');
  process.exitCode = 1;
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
    clearTimeout(deadline);
    process.exitCode = error ? 1 : 0;
    logger.info('HTTP server stopped');
  });
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

import { pino, type DestinationStream } from 'pino';
import type { Env } from '../config/env.js';

export function createLogger(config: Env, destination?: DestinationStream) {
  const options = {
    level: config.LOG_LEVEL,
    base: { service: 'clu-store-api' },
    redact: {
      paths: [
        'authorization', 'cookie', 'password', 'passwordHash', 'confirmPassword', 'ConfirmPassword',
        'headers', 'req.headers', 'res.headers', 'req.body', 'body', 'credentials',
        'email', 'identifier', 'username', 'ADMIN_PASSWORD',
        'accessToken', 'token', 'secret', 'JWT_SECRET', 'DATABASE_URL', 'TEST_DATABASE_URL',
        'POSTGRES_PASSWORD', 'CLU_DEV_PASSWORD', 'CLU_TEST_PASSWORD',
        '*.password', '*.passwordHash', '*.confirmPassword', '*.ConfirmPassword', '*.accessToken',
        '*.email', '*.identifier', '*.username', '*.headers', '*.credentials',
        '*.token', '*.secret', 'req.headers.authorization', 'req.headers.cookie',
        'res.headers["set-cookie"]',
      ],
      censor: '[REDACTED]',
    },
  };
  return destination ? pino(options, destination) : pino(options);
}

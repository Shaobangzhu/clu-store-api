import { pino } from 'pino';
import type { Env } from '../config/env.js';

export function createLogger(config: Env) {
  return pino({
    level: config.LOG_LEVEL,
    base: { service: 'clu-store-api' },
    redact: {
      paths: [
        'authorization', 'cookie', 'password', 'confirmPassword', 'ConfirmPassword',
        'accessToken', 'token', 'secret', 'JWT_SECRET', 'DATABASE_URL',
        '*.password', '*.confirmPassword', '*.ConfirmPassword', '*.accessToken',
        '*.token', '*.secret', 'req.headers.authorization', 'req.headers.cookie',
        'res.headers["set-cookie"]',
      ],
      censor: '[REDACTED]',
    },
  });
}

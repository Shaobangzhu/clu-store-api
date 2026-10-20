import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import type { Logger } from 'pino';
import type { Env } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { AppError } from './lib/errors.js';
import { requestId } from './middleware/request-id.js';
import { envelope } from './middleware/envelope.js';
import { errorHandler } from './middleware/error-handler.js';

export function createApp(config: Env, logger: Logger = createLogger(config)) {
  const app = express();
  app.disable('x-powered-by');
  app.enable('case sensitive routing');
  app.set('trust proxy', false);
  app.use(requestId, envelope, helmet());
  app.use((req, res, next) => {
    const start = performance.now();
    res.on('finish', () => {
      // No raw URL, headers, query or body: callers can put secrets in any of them.
      logger.info({ requestId: res.locals.requestId, method: req.method,
        status: res.statusCode, durationMs: Math.round(performance.now() - start) }, 'Request completed');
    });
    next();
  });
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.CORS_ORIGINS.includes(origin)) callback(null, true);
      else callback(new AppError(403, 'CORS_ORIGIN_DENIED', 'Origin is not allowed'));
    },
    exposedHeaders: ['X-Request-Id'],
  }));
  app.use(rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    limit: config.RATE_LIMIT_MAX,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', 'Too many requests')),
  }));
  app.use(express.json({ limit: config.JSON_BODY_LIMIT_BYTES }));
  app.get('/health', (_req, res) => res.locals.success({ status: 'ok' }));
  app.get('/ready', (_req, _res, next) => next(new AppError(
    503, 'SERVICE_NOT_READY', 'Database readiness is not configured; pending Phase P02',
    { database: 'not_configured' },
  )));
  app.use((_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Route not found')));
  app.use(errorHandler(logger));
  return app;
}

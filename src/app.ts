import express from 'express';
import { fileURLToPath } from 'node:url';
import type { CatalogDatabase } from './lib/catalog-database.js';
import { productsRouter } from './modules/products/routes.js';
import { categoriesRouter } from './modules/categories/routes.js';
import { informationRouter } from './modules/information/routes.js';
import { authRouter, authIpLimiter } from './modules/auth/routes.js';
import type { AuthService } from './modules/auth/service.js';
import type { PrismaClient } from './generated/prisma/client.js';
import { cartRouter } from './modules/cart/routes.js';
import { ordersRouter, adminOrdersRouter } from './modules/orders/routes.js';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import type { Logger } from 'pino';
import type { Env } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { boundedReadiness } from './lib/readiness.js';
import { AppError } from './lib/errors.js';
import { requestId } from './middleware/request-id.js';
import { envelope } from './middleware/envelope.js';
import { errorHandler } from './middleware/error-handler.js';

export interface AppDependencies {
  catalog?: CatalogDatabase;
  now?: () => Date;
  auth?: AuthService;
  cartDatabase?: PrismaClient;
  ordersDatabase?: PrismaClient;
}
export function createApp(config: Env, logger: Logger = createLogger(config), databaseProbe?: () => Promise<void>, dependencies: AppDependencies = {}) {
  const checkDatabase = databaseProbe ? boundedReadiness(databaseProbe, config.DB_CHECK_TIMEOUT_MS) : undefined;
  const app = express();
  app.disable('x-powered-by');
  app.enable('case sensitive routing');
  app.set('trust proxy', false);
  app.set('json escape', true);
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
  app.use('/api/auth', authIpLimiter(config));
  app.use(express.json({ limit: config.JSON_BODY_LIMIT_BYTES }));
  app.get('/health', (_req, res) => res.locals.success({ status: 'ok' }));
  app.get('/ready', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!checkDatabase) {
      throw new AppError(503, 'SERVICE_NOT_READY', 'Database readiness is not configured',
        { database: 'not_configured' });
    }
    try {
      await checkDatabase();
    } catch {
      throw new AppError(503, 'SERVICE_NOT_READY', 'Database is unavailable',
        { database: 'unavailable' });
    }
    res.locals.success({ status: 'ready', database: 'up' });
  });
  app.use('/api/products', productsRouter(dependencies.catalog, dependencies.now ?? (() => new Date())));
  app.use('/api/categories', categoriesRouter(dependencies.catalog));
  app.use('/api/information', informationRouter(dependencies.catalog));
  app.use('/api/auth', authRouter(dependencies.auth, config));
  const cart = cartRouter(dependencies.cartDatabase, dependencies.auth);
  app.use('/api/ShoppingCart', cart);
  app.use('/api/shopping-cart', cart);
  app.use('/api/orders', ordersRouter(dependencies.ordersDatabase, dependencies.auth));
  app.use('/api/admin/orders', adminOrdersRouter(dependencies.ordersDatabase, dependencies.auth));
  app.get('/media/demo-placeholder.svg', (_req, res, next) => {
    res.sendFile(fileURLToPath(new URL('../public/media/demo-placeholder.svg', import.meta.url)), (error) => {
      if (error) next(error);
    });
  });
  app.use((_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Route not found')));
  app.use(errorHandler(logger));
  return app;
}

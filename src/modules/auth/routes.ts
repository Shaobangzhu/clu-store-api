import { contractRoute } from '../../contracts/api.js';
import { createHmac, randomBytes } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { z } from 'zod';
import type { Env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { validate } from '../../middleware/validate.js';
import { loginRequest, registerRequest } from './schemas.js';
import type { AuthService } from './service.js';

export function authIpLimiter(config: Env) {
  const limiter = rateLimit({ windowMs: config.AUTH_RATE_LIMIT_WINDOW_MS, limit: config.AUTH_RATE_LIMIT_MAX,
    standardHeaders: 'draft-8', legacyHeaders: false,
    handler: () => { throw new AppError(429, 'RATE_LIMITED', 'Too many authentication attempts'); },
  });
  const router = Router({ caseSensitive: true });
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use(limiter);
  return router;
}

export function authRouter(service: AuthService | undefined, config: Env) {
  const router = Router({ caseSensitive: true });
  const limiterOptions = {
    windowMs: config.AUTH_RATE_LIMIT_WINDOW_MS, standardHeaders: 'draft-8' as const, legacyHeaders: false,
    handler: () => { throw new AppError(429, 'RATE_LIMITED', 'Too many authentication attempts'); },
  };
  // Count successes and failures together; clients cannot reset a failure budget with one success.
  const privacyKey = randomBytes(32);
  const identityKey = (identity: string) => createHmac('sha256', privacyKey).update(identity).digest('hex');
  const accountLimiter = rateLimit({ ...limiterOptions, limit: config.AUTH_IDENTIFIER_RATE_LIMIT_MAX,
    keyGenerator: (_req, res) => {
      const input = res.locals.validated as z.output<typeof loginRequest> | z.output<typeof registerRequest>;
      return identityKey('identifier' in input.body ? input.body.identifier : input.body.username);
    },
  });
  const ensureConfigured: RequestHandler = (_req, _res, next) => {
    if (!service) throw new AppError(503, 'SERVICE_NOT_READY', 'Authentication is not configured');
    next();
  };
  contractRoute(router, 'register', ensureConfigured, validate(registerRequest), accountLimiter, async (_req, res) => {
    const { body } = res.locals.validated as z.output<typeof registerRequest>;
    const data = await service!.register(body);
    res.locals.success(data, 201, body.deprecatedConfirmation ? { deprecatedFields: ['ConfirmPassword'] } : null);
  });
  contractRoute(router, 'login', ensureConfigured, validate(loginRequest), accountLimiter, async (_req, res) => {
    const { body } = res.locals.validated as z.output<typeof loginRequest>;
    const data = await service!.login(body);
    res.locals.success(data, 200, body.deprecatedUsername ? { deprecatedFields: ['username'] } : null);
  });
  return router;
}

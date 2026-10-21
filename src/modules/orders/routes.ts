import { Router, type RequestHandler } from 'express';
import type { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { AuthService } from '../auth/service.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { AppError } from '../../lib/errors.js';
import { idempotencyKeySchema, placeRequest } from './schemas.js';
import { createOrdersRepository } from './repository.js';
import { createOrdersService } from './service.js';

const validateKey: RequestHandler = (req, res, next) => {
  const count = req.rawHeaders.filter((_, index) => index % 2 === 0 && req.rawHeaders[index]!.toLowerCase() === 'idempotency-key').length;
  const value = req.headers['idempotency-key'];
  if (count > 1 || value !== undefined && !idempotencyKeySchema.safeParse(value).success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid Idempotency-Key header');
  }
  res.locals.idempotencyKey = value;
  next();
};
export function ordersRouter(database: PrismaClient | undefined, auth: AuthService | undefined) {
  const router = Router({ caseSensitive: true });
  const service = createOrdersService(createOrdersRepository(database));
  router.post('/place', requireAuth(auth), validateKey, validate(placeRequest), async (_req, res) => {
    const { body } = res.locals.validated as z.output<typeof placeRequest>;
    const result = await service.place(res.locals.user!.id, body, res.locals.idempotencyKey as string | undefined);
    res.locals.success(result.order, result.created ? 201 : 200);
  });
  return router;
}

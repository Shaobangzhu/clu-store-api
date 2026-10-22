import { contractRoute } from '../../contracts/api.js';
import { Router, type RequestHandler } from 'express';
import type { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { AuthService } from '../auth/service.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { AppError } from '../../lib/errors.js';
import { idempotencyKeySchema, placeRequest } from './schemas.js';
import { createOrdersRepository } from './repository.js';
import { createOrdersService } from './service.js';
import { createOrderManagementRepository } from './management-repository.js';
import { createOrderManagementService } from './management-service.js';
import { decisionRequest, orderDetailRequest, orderListRequest } from './management-schemas.js';

const rejectUnparsedBody: RequestHandler = (req, _res, next) => {
  if (req.body === undefined && (req.headers['transfer-encoding'] || Number(req.headers['content-length'] ?? 0) > 0)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Expected a JSON body');
  }
  next();
};

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
  const management = createOrderManagementService(createOrderManagementRepository(database));
  contractRoute(router, 'place', requireAuth(auth), validateKey, validate(placeRequest), async (_req, res) => {
    const { body } = res.locals.validated as z.output<typeof placeRequest>;
    const result = await service.place(res.locals.user!.id, body, res.locals.idempotencyKey as string | undefined);
    res.locals.success(result.order, result.created ? 201 : 200);
  });
  contractRoute(router, 'ownOrders', requireAuth(auth), rejectUnparsedBody, validate(orderListRequest), async (_req, res) => {
    const { query } = res.locals.validated as z.output<typeof orderListRequest>;
    const result = await management.list(query, res.locals.user!.id);
    res.locals.success(result.data, 200, result.meta);
  });
  contractRoute(router, 'order', requireAuth(auth), rejectUnparsedBody, validate(orderDetailRequest), async (_req, res) => {
    const { params } = res.locals.validated as z.output<typeof orderDetailRequest>;
    res.locals.success(await management.detail(params.id, res.locals.user!));
  });
  for (const [path, target] of [['approve', 'approved'], ['reject', 'rejected']] as const) {
    contractRoute(router, path === 'approve' ? 'approve' : 'reject', requireAuth(auth), requireRole('ADMIN'), rejectUnparsedBody, validate(decisionRequest), async (_req, res) => {
      const { params, body } = res.locals.validated as z.output<typeof decisionRequest>;
      const data = await management.decide(params.id, res.locals.user!.id, target, body?.metadata?.value);
      res.locals.success(data, 200, body?.metadata?.legacy ? { deprecatedFields: ['metadata'] } : null);
    });
  }
  return router;
}

export function adminOrdersRouter(database: PrismaClient | undefined, auth: AuthService | undefined) {
  const router = Router({ caseSensitive: true });
  const management = createOrderManagementService(createOrderManagementRepository(database));
  contractRoute(router, 'adminOrders', requireAuth(auth), requireRole('ADMIN'), rejectUnparsedBody, validate(orderListRequest), async (_req, res) => {
    const { query } = res.locals.validated as z.output<typeof orderListRequest>;
    const result = await management.list(query);
    res.locals.success(result.data, 200, result.meta);
  });
  return router;
}

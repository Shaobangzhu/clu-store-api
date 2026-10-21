import { Router } from 'express';
import type { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { AuthService } from '../auth/service.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { addItemRequest, cartReadRequest, clearCartRequest, removeItemRequest } from './schemas.js';
import { createCartRepository } from './repository.js';
import { createCartService } from './service.js';
import { demoCart } from './demo.js';

export function cartRouter(database: PrismaClient | undefined, auth: AuthService | undefined) {
  const router = Router({ caseSensitive: true });
  const service = createCartService(createCartRepository(database));
  const authenticated = requireAuth(auth);
  // Static, public, synthetic route must be registered independently of authentication.
  router.get('/fake-shopping-cart', validate(cartReadRequest), (_req, res) => res.locals.success(demoCart()));
  router.get('/', authenticated, validate(cartReadRequest), async (_req, res) => {
    res.locals.success(await service.read(res.locals.user!.id));
  });
  router.post('/items', authenticated, validate(addItemRequest), async (_req, res) => {
    const { body } = res.locals.validated as z.output<typeof addItemRequest>;
    const result = await service.add(res.locals.user!.id, body);
    res.locals.success(result.item, result.created ? 201 : 200,
      body.deprecatedFields.length ? { deprecatedFields: body.deprecatedFields } : null);
  });
  router.delete('/items/:id', authenticated, validate(removeItemRequest), async (_req, res) => {
    const { params } = res.locals.validated as z.output<typeof removeItemRequest>;
    await service.remove(res.locals.user!.id, params.id);
    res.locals.success(null, 204);
  });
  router.delete('/items', authenticated, validate(clearCartRequest), async (_req, res) => {
    await service.clear(res.locals.user!.id);
    res.locals.success(null, 204);
  });
  return router;
}

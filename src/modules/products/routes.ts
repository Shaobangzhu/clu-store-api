import { Router } from 'express';
import type { z } from 'zod';
import type { CatalogDatabase } from '../../lib/catalog-database.js';
import { validate } from '../../middleware/validate.js';
import { listRequest, detailRequest, emptyReadRequest } from './schemas.js';
import { createProductsRepository } from './repository.js';
import { createProductsService } from './service.js';

export function productsRouter(database: CatalogDatabase | undefined, now: () => Date) {
  const router = Router({ caseSensitive: true });
  const service = createProductsService(createProductsRepository(database), now);
  router.get('/offers', validate(emptyReadRequest), async (_req, res) => res.locals.success(await service.offers()));
  router.get('/newarrivals', validate(emptyReadRequest), async (_req, res) => res.locals.success(await service.arrivals()));
  router.get('/', validate(listRequest), async (_req, res) => {
    const { query } = res.locals.validated as z.output<typeof listRequest>;
    const { data, meta } = await service.list(query);
    res.locals.success(data, 200, meta);
  });
  router.get('/:id', validate(detailRequest), async (_req, res) => {
    const { params } = res.locals.validated as z.output<typeof detailRequest>;
    res.locals.success(await service.detail(params.id));
  });
  return router;
}

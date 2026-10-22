import { contractRoute } from '../../contracts/api.js';
import { Router } from 'express';
import type { z } from 'zod';
import type { CatalogDatabase } from '../../lib/catalog-database.js';
import { validate } from '../../middleware/validate.js';
import { emptyReadRequest } from '../products/schemas.js';
import { categoryRequest } from './schemas.js';
import { createCategoriesRepository } from './repository.js';
import { createCategoriesService } from './service.js';

export function categoriesRouter(database: CatalogDatabase | undefined) {
  const router = Router({ caseSensitive: true });
  const service = createCategoriesService(createCategoriesRepository(database));
  contractRoute(router, 'categories', validate(emptyReadRequest), async (_req, res) => res.locals.success(await service.list()));
  contractRoute(router, 'category', validate(categoryRequest), async (_req, res) => {
    const { params } = res.locals.validated as z.output<typeof categoryRequest>;
    // Express has already decoded the path exactly once.
    res.locals.success(await service.detail(params.title));
  });
  return router;
}

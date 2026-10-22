import { contractRoute } from '../../contracts/api.js';
import { Router } from 'express';
import type { CatalogDatabase } from '../../lib/catalog-database.js';
import { validate } from '../../middleware/validate.js';
import { emptyReadRequest } from '../products/schemas.js';
import { createInformationRepository } from './repository.js';
import { createInformationService } from './service.js';

export function informationRouter(database: CatalogDatabase | undefined) {
  const router = Router({ caseSensitive: true });
  const service = createInformationService(createInformationRepository(database));
  contractRoute(router, 'support', validate(emptyReadRequest), async (_req, res) => res.locals.success(await service.support()));
  return router;
}

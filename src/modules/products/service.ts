import { AppError } from '../../lib/errors.js';
import type { createProductsRepository } from './repository.js';
import type { ProductQuery } from './schemas.js';
import { serializeProduct, serializeOffer, serializeArrival } from './serializer.js';

export function createProductsService(repository: ReturnType<typeof createProductsRepository>, now: () => Date) {
  return {
    async list(query: ProductQuery) {
      const { records, total } = await repository.list(query);
      return { data: records.map(serializeProduct), meta: {
        page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize),
      } };
    },
    async detail(id: number) {
      const product = await repository.detail(id);
      if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
      return serializeProduct(product);
    },
    async offers() { return (await repository.offers(now())).map(serializeOffer); },
    async arrivals() { return (await repository.arrivals()).map(serializeArrival); },
  };
}

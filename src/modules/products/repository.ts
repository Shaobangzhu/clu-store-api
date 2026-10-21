import type { Prisma, Product } from '../../generated/prisma/client.js';
import { readCatalog, literalLike, type CatalogDatabase, type CatalogReader } from '../../lib/catalog-database.js';
import { findCategory } from '../categories/repository.js';
import type { ProductQuery } from './schemas.js';

async function configurations(client: CatalogReader, products: Product[]) {
  const ids = products.map((product) => product.id);
  const categories = await client.category.findMany({ where: { id: { in: products.flatMap((product) => product.categoryId === null ? [] : [product.categoryId]) } } });
  // Sequential reads keep one consistent snapshot without parallel queries on a transaction connection.
  const models = await client.productModel.findMany({ where: { productId: { in: ids }, inStock: true }, orderBy: { id: 'asc' } });
  const memories = await client.productMemorySize.findMany({ where: { productId: { in: ids }, inStock: true }, orderBy: { id: 'asc' } });
  const colors = await client.productColor.findMany({ where: { productId: { in: ids }, inStock: true }, orderBy: { id: 'asc' } });
  return products.map((product) => ({ ...product,
    category: categories.find((category) => category.id === product.categoryId)?.title ?? null,
    models: models.filter((model) => model.productId === product.id),
    memorySizes: memories.filter((memory) => memory.productId === product.id),
    colors: colors.filter((color) => color.productId === product.id),
  }));
}
export type ProductRecord = Awaited<ReturnType<typeof configurations>>[number];
const sorting: Record<ProductQuery['sort'], Prisma.ProductOrderByWithRelationInput[]> = {
  newest: [{ createdAt: 'desc' }, { id: 'asc' }],
  price_asc: [{ startingPrice: 'asc' }, { id: 'asc' }],
  price_desc: [{ startingPrice: 'desc' }, { id: 'asc' }],
  name_asc: [{ name: 'asc' }, { id: 'asc' }],
  name_desc: [{ name: 'desc' }, { id: 'asc' }],
};
export function createProductsRepository(database: CatalogDatabase | undefined) {
  return {
    list: (query: ProductQuery) => readCatalog(database, async (client) => {
      const category = query.category ? await findCategory(client, query.category) : undefined;
      if (query.category && !category) return { records: [], total: 0 };
      const keyword = query.keyword ? literalLike(query.keyword) : undefined;
      const where: Prisma.ProductWhereInput = {
        ...(category ? { categoryId: category.id } : {}),
        ...(keyword ? { OR: [
          { name: { contains: keyword, mode: 'insensitive' } },
          { title: { contains: keyword, mode: 'insensitive' } },
          { category: { is: { OR: [
            { title: { contains: keyword, mode: 'insensitive' } },
            { slug: { contains: keyword, mode: 'insensitive' } },
          ] } } },
        ] } : {}),
      };
      const total = await client.product.count({ where });
      const products = await client.product.findMany({ where, orderBy: sorting[query.sort],
        skip: (query.page - 1) * query.pageSize, take: query.pageSize });
      return { records: await configurations(client, products), total };
    }),
    detail: (id: number) => readCatalog(database, async (client) => {
      const product = await client.product.findUnique({ where: { id } });
      return product ? (await configurations(client, [product]))[0] ?? null : null;
    }),
    offers: (now: Date) => readCatalog(database, (client) => client.offer.findMany({ where: {
      active: true, AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ],
    }, orderBy: { id: 'asc' } })),
    arrivals: () => readCatalog(database, (client) => client.newArrival.findMany({ orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }] })),
  };
}

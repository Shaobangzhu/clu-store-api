import { readCatalog, literalLike, type CatalogDatabase, type CatalogReader } from '../../lib/catalog-database.js';

export async function findCategory(client: CatalogReader, titleOrSlug: string) {
  // Title wins a cross-namespace collision; ID orders any case-insensitive duplicates.
  const value = literalLike(titleOrSlug);
  return await client.category.findFirst({ where: { title: { equals: value, mode: 'insensitive' } }, orderBy: { id: 'asc' } })
    ?? await client.category.findFirst({ where: { slug: { equals: value, mode: 'insensitive' } }, orderBy: { id: 'asc' } });
}
export function createCategoriesRepository(database: CatalogDatabase | undefined) {
  return {
    list: () => readCatalog(database, (client) => client.category.findMany({ orderBy: { id: 'asc' } })),
    detail: (title: string) => readCatalog(database, async (client) => {
      const category = await findCategory(client, title);
      if (!category) return null;
      const products = await client.product.findMany({ where: { categoryId: category.id }, orderBy: { id: 'asc' } });
      return { ...category, products };
    }),
  };
}

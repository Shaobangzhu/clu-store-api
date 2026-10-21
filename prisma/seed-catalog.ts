import { Prisma, type PrismaClient } from '../src/generated/prisma/client.js';
import { loadPreviousCatalog, type SeedCatalog } from './seed-data.js';
import { isDeepStrictEqual } from 'node:util';

function comparable(value: unknown): unknown {
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toFixed(2);
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'createdAt' && key !== 'updatedAt')
    .map(([key, entry]) => [key, comparable(entry)]));
  return value;
}
export function previousProductMatches(current: unknown, previous: SeedCatalog['products'][number]): boolean {
  const { sourceKey: _sourceKey, ...product } = previous;
  void _sourceKey;
  const expected = { ...product,
    models: product.models.map((option) => ({ ...option, productId: product.id })),
    memorySizes: product.memorySizes.map((option) => ({ ...option, productId: product.id })),
    colors: product.colors.map((option) => ({ ...option, productId: product.id })),
  };
  return isDeepStrictEqual(comparable(current), comparable(expected));
}

export async function seedCatalog(client: PrismaClient, catalog: SeedCatalog, html: string) {
  return client.$transaction(async (tx) => {
    const identity = await tx.$queryRaw<{ database: string; role: string; rolsuper: boolean; rolcreaterole: boolean }[]>`
      SELECT current_database() AS database, current_user AS role, rolsuper, rolcreaterole
      FROM pg_roles WHERE rolname=current_user
    `;
    const role = identity[0];
    if (!role || role.database !== 'clu_store_dev' || role.role !== 'clu_dev' || role.rolsuper || role.rolcreaterole) {
      throw new Error('Refusing seed: actual database/role is not the isolated development target');
    }
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(20031020)`;
    const previous = catalog.productIdRemaps?.length ? loadPreviousCatalog() : undefined;
    for (const remap of catalog.productIdRemaps ?? []) {
      const product = await tx.product.findUnique({ where: { id: remap.from } });
      if (!product) continue;
      // Keep relation reads sequential on the transaction's single pg connection.
      const current = { ...product,
        models: await tx.productModel.findMany({ where: { productId: remap.from }, orderBy: { id: 'asc' } }),
        memorySizes: await tx.productMemorySize.findMany({ where: { productId: remap.from }, orderBy: { id: 'asc' } }),
        colors: await tx.productColor.findMany({ where: { productId: remap.from }, orderBy: { id: 'asc' } }),
      };
      const original = previous?.products.find((entry) => entry.id === remap.from);
      const target = await tx.product.findUnique({ where: { id: remap.to } });
      if (target || !original || !previousProductMatches(current, original)) {
        throw new Error('Unsafe product ID reconciliation: original changed or destination occupied');
      }
      // Reviewed data correction only. Existing FKs cascade; snapshots and option IDs are preserved.
      await tx.product.update({ where: { id: remap.from }, data: { id: remap.to } });
    }
    const categories = await tx.category.findMany({ where: { id: { in: catalog.categories.map((entry) => entry.id) } } });
    for (const current of categories) {
      const expected = catalog.categories.find((entry) => entry.id === current.id);
      if (!expected || expected.slug !== current.slug || expected.title !== current.title) throw new Error('Category ID collision; no seed changes committed');
    }
    const currentProducts = await tx.product.findMany({ where: { id: { in: catalog.products.map((entry) => entry.id) } } });
    for (const current of currentProducts) {
      if (catalog.products.find((entry) => entry.id === current.id)?.name !== current.name) throw new Error('Product ID collision; no seed changes committed');
    }
    const existingSupport = await tx.supportInformation.findUnique({ where: { key_locale: { key: 'support', locale: 'zh-CN' } } });
    if (existingSupport && existingSupport.html !== html) throw new Error('Existing support content differs; refusing to overwrite it');
    for (const category of catalog.categories) {
      await tx.category.upsert({ where: { id: category.id }, create: category, update: category });
    }
    for (const product of catalog.products) {
      const { sourceKey: _sourceKey, models, memorySizes, colors, ...data } = product;
      void _sourceKey;
      const productData = { ...data, startingPrice: new Prisma.Decimal(data.startingPrice) };
      await tx.product.upsert({ where: { id: product.id }, create: productData, update: productData });
      for (const model of models) {
        const current = await tx.productModel.findUnique({ where: { id: model.id } });
        if (current && (current.productId !== product.id || current.name !== model.name)) throw new Error('Model ID collision');
        const values = { ...model, productId: product.id, price: new Prisma.Decimal(model.price) };
        await tx.productModel.upsert({ where: { id: model.id }, create: values, update: values });
      }
      for (const memory of memorySizes) {
        const current = await tx.productMemorySize.findUnique({ where: { id: memory.id } });
        if (current && (current.productId !== product.id || current.name !== memory.name)) throw new Error('Memory ID collision');
        const values = { ...memory, productId: product.id, extraPrice: new Prisma.Decimal(memory.extraPrice) };
        await tx.productMemorySize.upsert({ where: { id: memory.id }, create: values, update: values });
      }
      for (const color of colors) {
        const current = await tx.productColor.findUnique({ where: { id: color.id } });
        if (current && (current.productId !== product.id || current.name !== color.name)) throw new Error('Color ID collision');
        const values = { ...color, productId: product.id };
        await tx.productColor.upsert({ where: { id: color.id }, create: values, update: values });
      }
    }
    for (const offer of catalog.offers) {
      const current = await tx.offer.findUnique({ where: { id: offer.id } });
      if (current && current.title !== offer.title) throw new Error('Offer ID collision');
      await tx.offer.upsert({ where: { id: offer.id }, create: offer, update: offer });
    }
    for (const arrival of catalog.newArrivals) {
      const current = await tx.newArrival.findUnique({ where: { id: arrival.id } });
      if (current && current.title !== arrival.title) {
        const original = previous?.newArrivals.find((entry) => entry.id === arrival.id);
        const previousLink = original?.productId;
        const targetLink = (catalog.productIdRemaps ?? []).find((entry) => entry.from === previousLink)?.to ?? previousLink;
        if (!original || !isDeepStrictEqual(comparable(current), comparable({ ...original, productId: targetLink }))) {
          throw new Error('Arrival ID collision or modified previous content');
        }
      }
      await tx.newArrival.upsert({ where: { id: arrival.id }, create: arrival, update: arrival });
    }
    const support = { key: 'support', locale: 'zh-CN', html };
    await tx.supportInformation.upsert({ where: { key_locale: { key: support.key, locale: support.locale } }, create: support, update: support });
    // Only fixed internal table names; no caller-controlled SQL identifiers. Never rewind a sequence.
    for (const table of ['Category', 'Product', 'ProductModel', 'ProductMemorySize', 'ProductColor', 'Offer', 'NewArrival'] as const) {
      await tx.$queryRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM "${table}"), (SELECT last_value FROM "${table}_id_seq")), true)`);
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

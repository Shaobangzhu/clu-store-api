import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createDatabase } from '../src/lib/database.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { loadCatalog, loadSupport } from '../prisma/seed-data.js';
import { seedDatabaseUrl } from '../prisma/seed-target.js';

const stage = process.argv[2];
assert.ok(stage === 'before' || stage === 'after-first' || stage === 'after-second', 'Specify before, after-first or after-second');
const catalog = loadCatalog();
const database = createDatabase(seedDatabaseUrl(process.env), 5000);
const run = process.env.SEED_VERIFY_RUN;
assert.ok(!run || /^[a-z0-9-]+$/.test(run), 'Unsafe verification run name');
const directory = `local-data/p03-seed-verification${run ? `/${run}` : ''}`;
mkdirSync(directory, { recursive: true });
function normalize(value: unknown): unknown {
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toFixed(2);
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'createdAt' && key !== 'updatedAt')
      .map(([key, entry]) => [key, normalize(entry)]));
  }
  return value;
}
try {
  const client = database.client;
  const identity = await client.$queryRaw<{ database: string; role: string }[]>`SELECT current_database() AS database, current_user AS role`;
  assert.equal(identity[0]?.database, 'clu_store_dev');
  assert.equal(identity[0]?.role, 'clu_dev');
  const counts = {
    categories: await client.category.count(), products: await client.product.count(),
    models: await client.productModel.count(), memories: await client.productMemorySize.count(),
    colors: await client.productColor.count(), offers: await client.offer.count(),
    arrivals: await client.newArrival.count(), supports: await client.supportInformation.count(),
    users: await client.user.count(), carts: await client.cart.count(), cartItems: await client.cartItem.count(),
    orders: await client.order.count(), orderItems: await client.orderItem.count(), histories: await client.orderStatusHistory.count(),
  };
  const allProductIds = (await client.product.findMany({ select: { id: true }, orderBy: { id: 'asc' } })).map((entry) => entry.id);
  const categories = await client.category.findMany({ where: { id: { in: catalog.categories.map((entry) => entry.id) } }, orderBy: { id: 'asc' } });
  const products = await client.product.findMany({ where: { id: { in: catalog.products.map((entry) => entry.id) } },
    include: { models: { orderBy: { id: 'asc' } }, memorySizes: { orderBy: { id: 'asc' } }, colors: { orderBy: { id: 'asc' } } }, orderBy: { id: 'asc' } });
  const offers = await client.offer.findMany({ where: { id: { in: catalog.offers.map((entry) => entry.id) } }, orderBy: { id: 'asc' } });
  const arrivals = await client.newArrival.findMany({ where: { id: { in: catalog.newArrivals.map((entry) => entry.id) } }, orderBy: { id: 'asc' } });
  const support = await client.supportInformation.findUnique({ where: { key_locale: { key: 'support', locale: 'zh-CN' } } });
  const sequences = [];
  for (const table of ['Category', 'Product', 'ProductModel', 'ProductMemorySize', 'ProductColor', 'Offer', 'NewArrival'] as const) {
    const rows = await client.$queryRawUnsafe<{ last_value: bigint }[]>(`SELECT last_value FROM "${table}_id_seq"`);
    sequences.push({ table, lastValue: rows[0]?.last_value.toString() });
  }
  const snapshot = normalize({ counts, allProductIds, categories, products, offers, arrivals, support, sequences });
  if (stage !== 'before') {
    assert.deepEqual(normalize(categories), catalog.categories);
    for (const remap of catalog.productIdRemaps ?? []) assert.ok(!allProductIds.includes(remap.from), 'Old product ID remains after reconciliation');
    const expectedProducts = catalog.products.map((entry) => {
      const { sourceKey: _sourceKey, ...product } = entry;
      void _sourceKey;
      return { ...product,
        models: product.models.map((option) => ({ ...option, productId: product.id })),
        memorySizes: product.memorySizes.map((option) => ({ ...option, productId: product.id })),
        colors: product.colors.map((option) => ({ ...option, productId: product.id })),
      };
    }).sort((a, b) => a.id - b.id);
    assert.deepEqual(normalize(products), expectedProducts);
    assert.deepEqual(normalize(offers), catalog.offers);
    assert.deepEqual(normalize(arrivals), catalog.newArrivals);
    assert.deepEqual(normalize(support), { key: 'support', locale: 'zh-CN', html: loadSupport() });
    const before = JSON.parse(readFileSync(`${directory}/before.json`, 'utf8')) as { counts: typeof counts };
    for (const key of ['users', 'carts', 'cartItems', 'orders', 'orderItems', 'histories'] as const) assert.equal(counts[key], before.counts[key]);
    if (stage === 'after-second') assert.deepEqual(snapshot, JSON.parse(readFileSync(`${directory}/after-first.json`, 'utf8')));
  }
  writeFileSync(`${directory}/${stage}.json`, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ stage, counts, productIds: allProductIds,
    snapshotHash: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') }));
} finally { await database.disconnect(); }

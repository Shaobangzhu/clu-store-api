import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Client } from 'pg';
import type { Express } from 'express';
import { Prisma } from '../../src/generated/prisma/client.js';
import { createDatabase } from '../../src/lib/database.js';
import { createCatalogDatabase } from '../../src/lib/catalog-database.js';
import { createApp } from '../../src/app.js';
import { parseEnv } from '../../src/config/env.js';
import { assertTestConnection, testDatabaseUrl } from '../../scripts/test-database-guard.js';
import { createReadFixture, testNow } from '../helpers/read-fixture.js';

type Fixture = Awaited<ReturnType<typeof createReadFixture>>;
let database: ReturnType<typeof createDatabase>;
let initialCounts: number[];
const config = parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', RATE_LIMIT_MAX: '100000' });
async function counts() {
  return [await database.client.product.count(), await database.client.category.count(),
    await database.client.productModel.count(), await database.client.productMemorySize.count(),
    await database.client.productColor.count(), await database.client.offer.count(),
    await database.client.newArrival.count(), await database.client.supportInformation.count()];
}
beforeAll(async () => {
  const connectionString = testDatabaseUrl(process.env);
  const guard = new Client({ connectionString, connectionTimeoutMillis: 2000 });
  try { await guard.connect(); await assertTestConnection(guard); } finally { await guard.end(); }
  database = createDatabase(connectionString, 5000);
  initialCounts = await counts();
});
afterAll(async () => {
  if (!database) return;
  try { expect(await counts()).toEqual(initialCounts); }
  finally { await database.disconnect(); }
});
async function withFixture(test: (app: Express, fixture: Fixture, tx: Prisma.TransactionClient) => Promise<void>) {
  const rollback = new Error('Intentional integration rollback');
  let completed = false;
  try {
    await database.client.$transaction(async (tx) => {
      const fixture = await createReadFixture(tx);
      const app = createApp(config, undefined, async () => { await tx.$queryRaw`SELECT 1`; },
        { catalog: { read: (operation) => operation(tx) }, now: () => testNow });
      await test(app, fixture, tx);
      completed = true;
      throw rollback;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
  } catch (error) { if (error !== rollback) throw error; }
  expect(completed).toBe(true);
}
function bodyIds(body: { data: { id: number }[] }): number[] { return body.data.map((entry) => entry.id); }

describe('public reads against real PostgreSQL', () => {
  it('uses the production database snapshot adapter against committed PostgreSQL data', async () => {
    const app = createApp(config, undefined, database.check, { catalog: createCatalogDatabase(database.client) });
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(initialCounts[0]);
    expect(res.body.data.length).toBe(Math.min(initialCounts[0]!, 20));
  });
  it('lists a bounded page with consistent count/default metadata and legacy keys', () => withFixture(async (app, f) => {
    const res = await request(app).get('/api/products').query({ keyword: f.prefix });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 20, total: 5, totalPages: 1 });
    expect(bodyIds(res.body)).toEqual([f.alpha.id, f.beta.id, f.duplicate.id, f.summary.id, f.special.id]);
    expect(res.body.data[0]).toMatchObject({ image: '/media/demo-placeholder.svg', startingPrice: '10.00', installments: '0.50', category: f.category.title });
    expect(res.body.data[0]).not.toHaveProperty('imageSrc');
    expect(res.body.data[0].models).toHaveLength(1);
  }));

  it.each(['price_asc', 'price_desc', 'name_asc', 'name_desc', 'newest'] as const)('sorts %s deterministically with ID tie breaks', (sort) => withFixture(async (app, f) => {
    const expected = sort === 'price_asc' ? [f.special.id, f.beta.id, f.alpha.id, f.duplicate.id, f.summary.id]
      : sort === 'price_desc' ? [f.summary.id, f.alpha.id, f.duplicate.id, f.beta.id, f.special.id]
      : sort === 'name_asc' ? [f.special.id, f.alpha.id, f.duplicate.id, f.beta.id, f.summary.id]
      : sort === 'name_desc' ? [f.summary.id, f.beta.id, f.alpha.id, f.duplicate.id, f.special.id]
      : [f.alpha.id, f.beta.id, f.duplicate.id, f.summary.id, f.special.id];
    const res = await request(app).get('/api/products').query({ keyword: f.prefix, sort });
    expect(res.status).toBe(200);
    expect(bodyIds(res.body)).toEqual(expected);
  }));

  it('uses numeric prices rather than lexicographic ordering across pages', () => withFixture(async (app, f) => {
    const first = await request(app).get('/api/products').query({ keyword: f.prefix, sort: 'price_asc', pageSize: 2 });
    const second = await request(app).get('/api/products').query({ keyword: f.prefix, sort: 'price_asc', pageSize: 2, page: 2 });
    expect(bodyIds(first.body)).toEqual([f.special.id, f.beta.id]);
    expect(bodyIds(second.body)).toEqual([f.alpha.id, f.duplicate.id]);
    expect(second.body.meta).toEqual({ page: 2, pageSize: 2, total: 5, totalPages: 3 });
  }));

  it('searches case-insensitive product names, titles, category titles and slugs', () => withFixture(async (app, f) => {
    const name = await request(app).get('/api/products').query({ keyword: `${f.prefix.toUpperCase()} alpha` });
    const title = await request(app).get('/api/products').query({ keyword: `${f.prefix} needle` });
    const category = await request(app).get('/api/products').query({ keyword: f.category.title });
    const slug = await request(app).get('/api/products').query({ keyword: f.category.slug.toUpperCase() });
    expect(bodyIds(name.body)).toEqual([f.alpha.id, f.duplicate.id]);
    expect(bodyIds(title.body)).toEqual([f.beta.id]);
    expect(bodyIds(category.body)).toEqual([f.alpha.id, f.beta.id, f.summary.id]);
    expect(bodyIds(slug.body)).toEqual(bodyIds(category.body));
  }));

  it('combines keyword/category filters and resolves category title/slug identically', () => withFixture(async (app, f) => {
    for (const category of [f.category.title, f.category.slug.toUpperCase()]) {
      const res = await request(app).get('/api/products').query({ keyword: `${f.prefix} alpha`, category });
      expect(res.status).toBe(200);
      expect(bodyIds(res.body)).toEqual([f.alpha.id]);
      expect(res.body.meta.total).toBe(1);
    }
  }));

  it('treats SQL wildcard characters and injection-like text literally', () => withFixture(async (app, f, tx) => {
    await tx.product.create({ data: { name: `${f.prefix} 100XYliteral`, title: 'Wildcard decoy', imageSrc: '/media/demo-placeholder.svg', carouselImages: [], features: [], startingPrice: '1.00', inStock: false } });
    const escaped = await request(app).get('/api/products').query({ keyword: `${f.prefix} 100%_` });
    expect(bodyIds(escaped.body)).toEqual([f.special.id]);
    const injection = await request(app).get('/api/products').query({ keyword: `${f.prefix}' OR 1=1 --` });
    expect(injection.status).toBe(200);
    expect(injection.body.data).toEqual([]);
  }));

  it('returns safe empty results for unknown keywords/categories and beyond-last pages', () => withFixture(async (app, f) => {
    for (const query of [{ keyword: `${f.prefix}-missing` }, { category: `${f.prefix}-missing` }]) {
      const res = await request(app).get('/api/products').query(query);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    }
    const page = await request(app).get('/api/products').query({ keyword: f.prefix, pageSize: 2, page: 100 });
    expect(page.body.data).toEqual([]);
    expect(page.body.meta.total).toBe(5);
  }));

  it.each(['page=0', 'page=-1', 'page=1.5', 'page=1e3', 'page=10001', 'page=01', 'pageSize=0',
    'pageSize=101', 'page=1&page=2', 'sort=unknown', 'unexpected=1', 'keyword=' + 'x'.repeat(101), 'category='])('rejects invalid query %s', (query) => withFixture(async (app) => {
    const res = await request(app).get(`/api/products?${query}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  }));

  it('serves nested SKU DTOs with full-base/increment prices and no double addition', () => withFixture(async (app, f) => {
    const res = await request(app).get(`/api/products/${f.alpha.id}`);
    expect(res.status).toBe(200);
    expect(res.body.meta).toBeNull();
    const product = res.body.data;
    expect(product.startingPrice).toBe('10.00');
    expect(product.models[0]).toMatchObject({ name: `${f.alpha.name} full model`, specification: 'Complete test specification', price: '10.00' });
    expect(product.memorySizes.find((entry: { id: number }) => entry.id === f.upgrade.id).price).toBe('0.10');
    const unitPrice = new Prisma.Decimal(product.models[0].price).plus(product.memorySizes.find((entry: { id: number }) => entry.id === f.upgrade.id).price);
    expect(unitPrice.toFixed(2)).toBe('10.10');
    expect(unitPrice.equals(new Prisma.Decimal(product.startingPrice).plus(product.models[0].price).plus('0.10'))).toBe(false);
    expect(product.colors).toEqual(['Silver']);
    expect(product.models.some((entry: { id: number }) => entry.id === f.retired.id)).toBe(false);
    expect(product).not.toHaveProperty('categoryId');
    expect(product.memorySizes[0]).not.toHaveProperty('extraPrice');
    const unavailable = await request(app).get(`/api/products/${f.summary.id}`);
    expect(unavailable.body.data).toMatchObject({ inStock: false, models: [], memorySizes: [], colors: [] });
  }));

  it('returns PRODUCT_NOT_FOUND for a valid absent ID', () => withFixture(async (app) => {
    const res = await request(app).get('/api/products/2147483647');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
  }));
  it.each(['0', '-1', '1.2', '2147483648', 'bad', '%ZZ'])('rejects invalid product path %s', (id) => withFixture(async (app) => {
    const res = await request(app).get(`/api/products/${id}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  }));

  it('serves offers before dynamic IDs, respecting start/end schedules and soldOut independence', () => withFixture(async (app, f) => {
    const res = await request(app).get('/api/products/offers');
    expect(res.status).toBe(200);
    expect(res.body.meta).toBeNull();
    const ids = bodyIds(res.body);
    for (const offer of [f.offers.live, f.offers.starting, f.offers.undated]) expect(ids).toContain(offer.id);
    for (const offer of [f.offers.inactive, f.offers.expired, f.offers.future, f.offers.historical]) expect(ids).not.toContain(offer.id);
    expect(res.body.data.find((entry: { id: number }) => entry.id === f.offers.live.id)).toMatchObject({ soldOut: true, image: '/media/demo-placeholder.svg' });
    expect((await request(app).get(`/api/products/${f.alpha.id}`)).body.data.inStock).toBe(true);
  }));

  it('returns ordered arrivals with nullable product links and distinct display soldOut state', () => withFixture(async (app, f) => {
    const res = await request(app).get('/api/products/newarrivals');
    expect(res.status).toBe(200);
    const mine = res.body.data.filter((entry: { title: string }) => entry.title === f.prefix);
    expect(mine.map((entry: { id: number }) => entry.id)).toEqual([f.arrivals.arrivalFirst.id, f.arrivals.arrivalA.id, f.arrivals.arrivalB.id]);
    expect(mine[0].productId).toBeNull();
    expect(mine[1]).toMatchObject({ productId: f.alpha.id, soldOut: true });
  }));

  it('returns category navigation and landing editorial content for decoded titles or slugs', () => withFixture(async (app, f) => {
    const navigation = await request(app).get('/api/categories');
    expect(navigation.status).toBe(200);
    expect(navigation.body.data).toContainEqual({ id: f.category.id, title: f.category.title, slug: f.category.slug, subTitle: 'Editorial category' });
    const title = await request(app).get(`/api/categories/${encodeURIComponent(f.category.title)}`);
    const slug = await request(app).get(`/api/categories/${f.category.slug.toUpperCase()}`);
    expect(title.status).toBe(200);
    expect(slug.body).toEqual(title.body);
    expect(title.body.data).toMatchObject({ videos: { id: 2, regularSrc: null, smallSrc: null },
      features: [{ id: 13, title: 'Editorial card', detail: 'A reviewed demo card', image: '/media/demo-placeholder.svg', textColor: 'black' }] });
    expect(title.body.data.products.map((entry: { id: number }) => entry.id)).toEqual([f.alpha.id, f.beta.id, f.summary.id]);
    expect(title.body.data.products[0].startingPrice).toBe('10.00');
    expect(title.body.data).not.toHaveProperty('editorialFeatures');
  }));

  it('returns CATEGORY_NOT_FOUND without double decoding and rejects malformed path encoding', () => withFixture(async (app, f) => {
    for (const value of [`${f.prefix}-missing`, encodeURIComponent(encodeURIComponent(f.category.title))]) {
      const res = await request(app).get(`/api/categories/${value}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CATEGORY_NOT_FOUND');
    }
    const invalid = await request(app).get('/api/categories/%ZZ');
    expect(invalid.status).toBe(400);
  }));

  it('serves only sanitized support HTML with locale under the envelope data', () => withFixture(async (app, f) => {
    const res = await request(app).get('/api/information/support');
    expect(res.status).toBe(200);
    expect(res.body.meta).toBeNull();
    expect(res.body.data.locale).toBe('zh-CN');
    expect(res.body.data.html).toContain(`<h1>${f.prefix}</h1>`);
    expect(res.body.data.html).toContain('<strong>safe</strong>');
    expect(res.body.data.html).not.toMatch(/script|style|img|svg|iframe|onclick|onerror|href|attack\(/i);
  }));
  it('returns an explicit missing-content error rather than invented support HTML', () => withFixture(async (app, _f, tx) => {
    await tx.supportInformation.delete({ where: { key_locale: { key: 'support', locale: 'zh-CN' } } });
    const res = await request(app).get('/api/information/support');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('INFORMATION_NOT_FOUND');
  }));
});


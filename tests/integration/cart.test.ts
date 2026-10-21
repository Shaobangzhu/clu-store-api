import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { Client } from 'pg';
import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { createApp } from '../../src/app.js';
import { parseEnv } from '../../src/config/env.js';
import { createDatabase } from '../../src/lib/database.js';
import { createAuthRepository } from '../../src/modules/auth/repository.js';
import { createAuthService } from '../../src/modules/auth/service.js';
import { createTokens } from '../../src/modules/auth/token.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { testDatabaseUrl, assertTestConnection } from '../../scripts/test-database-guard.js';
import { createCartFixture, type CartFixture } from '../helpers/cart-fixture.js';

const config = parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET: randomBytes(32).toString('hex') });
const tokens = createTokens(config);
const canonical = '/api/shopping-cart';
const legacy = '/api/ShoppingCart';
let database: ReturnType<typeof createDatabase>;
let fixture: CartFixture | undefined;
let app: ReturnType<typeof createApp>;
let firstToken: string;
let secondToken: string;
let passwordHash: string;
let initialCounts: number[];
function f() { if (!fixture) throw new Error('Fixture missing'); return fixture; }
async function counts() {
  return Promise.all([database.client.user.count(), database.client.cart.count(), database.client.cartItem.count(),
    database.client.product.count(), database.client.productModel.count(), database.client.productMemorySize.count(), database.client.productColor.count()]);
}
beforeAll(async () => {
  const connectionString = testDatabaseUrl(process.env);
  const guard = new Client({ connectionString, connectionTimeoutMillis: 2000 });
  try { await guard.connect(); await assertTestConnection(guard); } finally { await guard.end(); }
  database = createDatabase(connectionString, 5000);
  initialCounts = await counts();
  passwordHash = await hashPassword(randomBytes(32).toString('base64url'));
});
beforeEach(async () => {
  fixture = await database.client.$transaction((tx) => createCartFixture(tx, passwordHash));
  firstToken = (await tokens.issue(f().firstUser.id)).token;
  secondToken = (await tokens.issue(f().secondUser.id)).token;
  const auth = createAuthService(createAuthRepository(database.client), config);
  app = createApp(config, undefined, database.check, { auth, cartDatabase: database.client });
});
afterEach(async () => {
  if (!fixture) return;
  const owned = fixture;
  await database.client.$transaction(async (tx) => {
    // Exact generated user/product IDs only; user cascade removes their carts and lines.
    await tx.user.deleteMany({ where: { id: { in: [owned.firstUser.id, owned.secondUser.id] } } });
    const where = { productId: { in: [owned.product.id, owned.foreignProduct.id] } };
    await tx.productColor.deleteMany({ where });
    await tx.productMemorySize.deleteMany({ where });
    await tx.productModel.deleteMany({ where });
    await tx.product.deleteMany({ where: { id: { in: where.productId.in } } });
  });
  fixture = undefined;
});
afterAll(async () => {
  if (!database) return;
  try { expect(await counts()).toEqual(initialCounts); } finally { await database.disconnect(); }
});
const add = (changes: Record<string, unknown> = {}, token = firstToken, base = canonical) =>
  request(app).post(`${base}/items`).set('Authorization', `Bearer ${token}`).send({ ...f().input, ...changes });
const read = (token = firstToken, base = canonical) => request(app).get(base).set('Authorization', `Bearer ${token}`);
const clear = (token = firstToken, base = canonical) => request(app).delete(`${base}/items`).set('Authorization', `Bearer ${token}`);
const remove = (id: number | string, token = firstToken, base = canonical) =>
  request(app).delete(`${base}/items/${id}`).set('Authorization', `Bearer ${token}`);
async function prefill(quantities: number[]) {
  const colors = quantities.map((_, index) => `Boundary${index}`);
  await database.client.productColor.createMany({ data: colors.map((name) => ({ productId: f().product.id, name, inStock: true })) });
  return database.client.cart.create({ data: { userId: f().firstUser.id, currency: 'CNY', items: { create: quantities.map((quantity, index) => ({
    productId: f().product.id, modelId: f().model.id, memorySizeId: f().memory.id, color: colors[index]!, quantity, unitPrice: '10.10',
  })) } }, include: { items: true } });
}

describe('P06 persistent owned carts against PostgreSQL', () => {
  it('serves a deterministic synthetic public demo with no auth/database dependency or real IDs', async () => {
    const noDependencies = createApp(config);
    const publicDemo = await request(noDependencies).get(`${legacy}/fake-shopping-cart`);
    expect(publicDemo.status).toBe(200);
    const created = await add({ qty: 3 });
    expect(created.status).toBe(201);
    for (const base of [canonical, legacy]) {
      const response = await request(app).get(`${base}/fake-shopping-cart`).set('Authorization', 'Bearer malformed');
      expect(response.body).toEqual(publicDemo.body);
      expect(response.body.data).toMatchObject({ id: null, isDemo: true, currency: 'CNY', totalAmount: '240.00' });
      expect(response.body.data.items[0]).toMatchObject({ id: null, available: false, product: { id: null }, model: { id: null }, memorySize: { id: null } });
      expect(response.text).not.toContain(f().product.name);
      expect(response.text).not.toContain(f().firstUser.id);
    }
  });
  it.each([canonical, legacy])('requires valid authentication for all private operations under %s', async (base) => {
    for (const token of [undefined, 'invalid-token']) {
      for (const [method, path] of [['get', base], ['post', `${base}/items`], ['delete', `${base}/items/1`], ['delete', `${base}/items`]] as const) {
        const req = request(app)[method](path);
        if (token) req.set('Authorization', `Bearer ${token}`);
        if (method === 'post') req.send(f().input);
        const response = await req;
        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('UNAUTHORIZED');
      }
    }
    expect(await database.client.cart.count({ where: { userId: f().firstUser.id } })).toBe(0);
  });
  it('returns an empty private cart without creating database rows', async () => {
    const response = await read();
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ success: true, data: { id: null, isDemo: false, currency: 'CNY', items: [], itemCount: 0, totalQty: 0, totalAmount: '0.00' }, meta: null });
    expect(await database.client.cart.findUnique({ where: { userId: f().firstUser.id } })).toBeNull();
  });
  it('adds with exact Decimal base-plus-upgrade pricing, CNY and structured safe DTOs', async () => {
    const response = await add({ qty: 2 });
    expect(response.status).toBe(201);
    expect(response.body.meta).toBeNull();
    expect(response.body.data).toMatchObject({ product: { id: f().product.id, name: f().product.name, image: '/media/demo-placeholder.svg' },
      model: { id: f().model.id, price: '10.00', specification: 'Test model specification' }, memorySize: { id: f().memory.id, price: '0.10' },
      color: 'Silver', qty: 2, currency: 'CNY', unitPrice: '10.10', lineTotal: '20.20', available: true });
    expect(response.text).not.toMatch(/passwordHash|userId|cartId|999\.99/);
    const row = await database.client.cartItem.findUniqueOrThrow({ where: { id: response.body.data.id }, include: { cart: true } });
    expect(row.unitPrice.toFixed(2)).toBe('10.10');
    expect(row.cart.currency).toBe('CNY');
    const cart = await read();
    expect(cart.body.data).toMatchObject({ itemCount: 1, totalQty: 2, totalAmount: '20.20', items: [response.body.data] });
  });
  it('merges only identical full configurations and preserves distinct option IDs/colors', async () => {
    const original = await add({ qty: 2 });
    const merged = await add({ qty: 3 }, firstToken, legacy);
    expect(merged.status).toBe(200);
    expect(merged.body.data).toMatchObject({ id: original.body.data.id, qty: 5, lineTotal: '50.50' });
    for (const configuration of [{ modelId: f().secondModel.id }, { memorySizeId: f().secondMemory.id }, { color: 'Black' }]) {
      expect((await add(configuration)).status).toBe(201);
    }
    const cart = (await read()).body.data;
    expect(cart.itemCount).toBe(4);
    expect(cart.totalQty).toBe(8);
    const ids = cart.items.map((item: { id: number }) => item.id);
    expect(ids).toEqual([...ids].sort((a: number, b: number) => a - b));
    expect(new Set(ids).size).toBe(4);
  });
  it('discards all legacy names/media/prices and marks them deprecated', async () => {
    const response = await add({ name: 'Attacker name', imageSrc: 'https://attacker.invalid/media', model: 'Forged model',
      modelPrice: '-999999', memorySize: 'Forged memory', memorySizePrice: -500 });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ unitPrice: '10.10', product: { name: f().product.name } });
    expect(response.body.meta).toEqual({ deprecatedFields: ['name', 'imageSrc', 'model', 'modelPrice', 'memorySize', 'memorySizePrice'] });
    expect(response.text).not.toMatch(/Attacker|attacker\.invalid|Forged|-999999|-500/);
    expect((await database.client.cartItem.findUniqueOrThrow({ where: { id: response.body.data.id } })).unitPrice.toFixed(2)).toBe('10.10');
  });
  it('keeps private carts isolated and hides foreign line existence on delete', async () => {
    const a = await add({ qty: 2 });
    expect((await read(secondToken)).body.data.items).toEqual([]);
    const b = await add({ color: 'Black' }, secondToken);
    expect((await read()).body.data.items.map((item: { id: number }) => item.id)).toEqual([a.body.data.id]);
    const forbidden = await remove(a.body.data.id, secondToken);
    const missing = await remove(2147483647, secondToken);
    expect(forbidden.status).toBe(404);
    expect(forbidden.body).toEqual(missing.body);
    expect(forbidden.body.error.code).toBe('CART_ITEM_NOT_FOUND');
    expect((await read(secondToken)).body.data.items[0].id).toBe(b.body.data.id);
    expect((await read()).body.data.items[0].id).toBe(a.body.data.id);
  });
  it('deletes an owned line, clears only the caller cart and keeps clear idempotent', async () => {
    expect((await clear()).status).toBe(204);
    const a = await add();
    await add({ color: 'Black' });
    const other = await add({}, secondToken);
    const deleted = await remove(a.body.data.id);
    expect(deleted.status).toBe(204);
    expect(deleted.text).toBe('');
    expect((await remove(a.body.data.id)).status).toBe(404);
    const cartId = (await read()).body.data.id;
    for (const base of [legacy, canonical]) {
      const cleared = await clear(firstToken, base);
      expect(cleared.status).toBe(204);
      expect(cleared.text).toBe('');
    }
    expect((await read()).body.data).toMatchObject({ id: cartId, items: [], totalAmount: '0.00' });
    expect((await read(secondToken)).body.data.items[0].id).toBe(other.body.data.id);
    expect((await add()).status).toBe(201);
    expect((await read()).body.data.id).toBe(cartId);
  });
  it('exposes identical operations on both prefixes with intentional exact casing', async () => {
    const a = await add({}, firstToken, legacy);
    expect(a.status).toBe(201);
    expect((await read(firstToken, canonical)).body).toEqual((await read(firstToken, legacy)).body);
    expect((await remove(a.body.data.id, firstToken, canonical)).status).toBe(204);
    const b = await add({}, firstToken, canonical);
    expect((await remove(b.body.data.id, firstToken, legacy)).status).toBe(204);
    for (const path of ['/api/shoppingcart', '/api/Shopping-Cart', '/api/SHOPPINGCART', `${canonical}/Items`, `${legacy}/Fake-shopping-cart`]) {
      expect((await request(app).get(path).set('Authorization', `Bearer ${firstToken}`)).status).toBe(404);
    }
  });
  it.each(['model', 'memory', 'color', 'missing-model', 'missing-memory'])('rejects cross-product or unknown %s configurations', async (kind) => {
    const changes = kind === 'model' ? { modelId: f().foreignModel.id } : kind === 'memory' ? { memorySizeId: f().foreignMemory.id }
      : kind === 'color' ? { color: 'Foreign color' } : kind === 'missing-model' ? { modelId: 2147483647 } : { memorySizeId: 2147483647 };
    const response = await add(changes);
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('INVALID_PRODUCT_CONFIGURATION');
    expect((await read()).body.data.items).toEqual([]);
    expect(await database.client.cart.findUnique({ where: { userId: f().firstUser.id } })).toBeNull();
  });
  it('returns 404 for a missing product and matches color names exactly', async () => {
    const missing = await add({ productId: 2147483647 });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('PRODUCT_NOT_FOUND');
    expect((await add({ color: 'silver' })).status).toBe(422);
    expect((await add({ color: ' Silver ' })).status).toBe(422);
  });
  it.each(['product', 'model', 'memory', 'color'] as const)('rejects out-of-stock %s and retains existing unavailable lines for removal', async (kind) => {
    const existing = await add();
    if (kind === 'product') await database.client.product.update({ where: { id: f().product.id }, data: { inStock: false } });
    if (kind === 'model') await database.client.productModel.update({ where: { id: f().model.id }, data: { inStock: false } });
    if (kind === 'memory') await database.client.productMemorySize.update({ where: { id: f().memory.id }, data: { inStock: false } });
    if (kind === 'color') await database.client.productColor.update({ where: { id: f().color.id }, data: { inStock: false } });
    const response = await add();
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('PRODUCT_UNAVAILABLE');
    const item = (await read()).body.data.items[0];
    expect(item).toMatchObject({ available: false, qty: 1, unitPrice: '10.10' });
    expect((await remove(existing.body.data.id)).status).toBe(204);
  });
  it('reprices GET from a consistent catalog snapshot and refreshes the cache on merge', async () => {
    const created = await add({ qty: 2 });
    await database.client.productModel.update({ where: { id: f().model.id }, data: { price: '12.40' } });
    await database.client.productMemorySize.update({ where: { id: f().memory.id }, data: { extraPrice: '0.20' } });
    const response = await read();
    expect(response.body.data).toMatchObject({ totalAmount: '25.20', items: [{ unitPrice: '12.60', lineTotal: '25.20' }] });
    const where = { id: created.body.data.id };
    expect((await database.client.cartItem.findUniqueOrThrow({ where })).unitPrice.toFixed(2)).toBe('10.10');
    expect((await add()).body.data).toMatchObject({ unitPrice: '12.60', qty: 3, lineTotal: '37.80' });
    expect((await database.client.cartItem.findUniqueOrThrow({ where })).unitPrice.toFixed(2)).toBe('12.60');
  });
  it('serializes concurrent first adds across aliases without duplicate carts or lost quantities', async () => {
    const responses = await Promise.all([add(), add({}, firstToken, legacy), add()]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 200, 201]);
    expect(new Set(responses.map((response) => response.body.data.id)).size).toBe(1);
    expect((await read()).body.data).toMatchObject({ itemCount: 1, totalQty: 3, items: [{ qty: 3 }] });
    expect(await database.client.cart.count({ where: { userId: f().firstUser.id } })).toBe(1);
  });
  it('enforces the per-line maximum on additions and concurrent merges without partial updates', async () => {
    expect((await add({ qty: 100 })).status).toBe(422);
    const initial = await add({ qty: 98 });
    expect(initial.status).toBe(201);
    const responses = await Promise.all([add(), add({}, firstToken, legacy)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 422]);
    expect(responses.find((response) => response.status === 422)!.body.error.code).toBe('CART_LIMIT_EXCEEDED');
    expect((await read()).body.data.items[0].qty).toBe(99);
  });
  it('enforces the 50-line cap under concurrent distinct adds but permits merges and freed slots', async () => {
    const existing = await prefill(Array.from({ length: 49 }, () => 1));
    const responses = await Promise.all([add(), add({ color: 'Black' }, firstToken, legacy)]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 422]);
    expect((await read()).body.data.itemCount).toBe(50);
    expect((await add({ color: 'Boundary0' })).status).toBe(200);
    expect((await remove(existing.items[1]!.id)).status).toBe(204);
    const rejectedColor = responses[0]!.status === 422 ? 'Silver' : 'Black';
    expect((await add({ color: rejectedColor })).status).toBe(201);
    expect((await read()).body.data.itemCount).toBe(50);
  });
  it('enforces the aggregate 500-unit cap under concurrent additions', async () => {
    await prefill([99, 99, 99, 99, 99, 4]);
    const responses = await Promise.all([add(), add({ color: 'Black' })]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 422]);
    expect((await read()).body.data.totalQty).toBe(500);
  });
  it('rejects unit prices exceeding Decimal(12,2) before persisting a cart', async () => {
    await database.client.productModel.update({ where: { id: f().model.id }, data: { price: '9999999999.99' } });
    const response = await add();
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('INVALID_PRODUCT_CONFIGURATION');
    expect(await database.client.cart.findUnique({ where: { userId: f().firstUser.id } })).toBeNull();
  });
  it.each([
    ['missing qty', { qty: undefined }], ['zero qty', { qty: 0 }], ['negative qty', { qty: -1 }], ['fraction qty', { qty: 1.5 }],
    ['string qty', { qty: '2' }], ['string id', { modelId: '1' }], ['zero id', { productId: 0 }],
    ['overflow id', { memorySizeId: 2147483648 }], ['empty color', { color: '' }], ['control color', { color: 'Silver\n' }],
    ['long color', { color: 'x'.repeat(101) }], ['extra owner', { userId: 'someone-else' }], ['extra currency', { currency: 'USD' }],
    ['object legacy price', { modelPrice: { amount: 1 } }],
  ])('rejects invalid payload: %s', async (_label, input) => {
    const response = await add(input);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await database.client.cart.findUnique({ where: { userId: f().firstUser.id } })).toBeNull();
  });
  it('rejects invalid delete IDs and caller-selected owners in query/body', async () => {
    for (const id of ['0', '-1', '1.5', '2147483648', 'bad', '%ZZ']) expect((await remove(id)).status).toBe(400);
    expect((await request(app).get(canonical).set('Authorization', `Bearer ${firstToken}`).query({ userId: f().secondUser.id })).status).toBe(400);
    expect((await clear().send({ userId: f().secondUser.id })).status).toBe(400);
  });
});

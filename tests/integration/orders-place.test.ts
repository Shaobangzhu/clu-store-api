import { randomBytes } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
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
import { installCheckoutFault } from '../helpers/checkout-fault.js';

const config = parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET: randomBytes(32).toString('hex') });
const tokens = createTokens(config);
let database: ReturnType<typeof createDatabase>;
let control: Client;
let fixture: CartFixture | undefined;
let app: ReturnType<typeof createApp>;
let token: string;
let otherToken: string;
let passwordHash: string;
let initialCounts: number[];
function f() { if (!fixture) throw new Error('Missing fixture'); return fixture; }
async function counts() {
  return Promise.all([database.client.user.count(), database.client.cart.count(), database.client.cartItem.count(),
    database.client.order.count(), database.client.orderItem.count(), database.client.orderStatusHistory.count(),
    database.client.product.count(), database.client.productModel.count(), database.client.productMemorySize.count(), database.client.productColor.count()]);
}
beforeAll(async () => {
  const connectionString = testDatabaseUrl(process.env);
  control = new Client({ connectionString, connectionTimeoutMillis: 2000 });
  await control.connect();
  await assertTestConnection(control);
  database = createDatabase(connectionString, 5000);
  initialCounts = await counts();
  passwordHash = await hashPassword(randomBytes(32).toString('base64url'));
});
beforeEach(async () => {
  fixture = await database.client.$transaction((tx) => createCartFixture(tx, passwordHash));
  token = (await tokens.issue(f().firstUser.id)).token;
  otherToken = (await tokens.issue(f().secondUser.id)).token;
  const auth = createAuthService(createAuthRepository(database.client), config);
  app = createApp(config, undefined, database.check, { auth, cartDatabase: database.client, ordersDatabase: database.client });
});
afterEach(async () => {
  if (!fixture) return;
  const owned = fixture;
  await database.client.$transaction(async (tx) => {
    const owner = { userId: { in: [owned.firstUser.id, owned.secondUser.id] } };
    await tx.orderStatusHistory.deleteMany({ where: { order: owner } });
    await tx.orderItem.deleteMany({ where: { order: owner } });
    await tx.order.deleteMany({ where: owner });
    await tx.user.deleteMany({ where: { id: owner.userId } });
    const products = { in: [owned.product.id, owned.foreignProduct.id] };
    await tx.productColor.deleteMany({ where: { productId: products } });
    await tx.productMemorySize.deleteMany({ where: { productId: products } });
    await tx.productModel.deleteMany({ where: { productId: products } });
    await tx.product.deleteMany({ where: { id: products } });
  });
  fixture = undefined;
});
afterAll(async () => {
  try { if (database) expect(await counts()).toEqual(initialCounts); }
  finally { await database?.disconnect(); await control?.end(); }
});
const add = (changes: Record<string, unknown> = {}, auth = token) => request(app).post('/api/shopping-cart/items')
  .set('Authorization', `Bearer ${auth}`).send({ ...f().input, ...changes });
function place(key?: string, body: unknown = {}, auth = token) {
  const req = request(app).post('/api/orders/place').set('Authorization', `Bearer ${auth}`);
  if (key !== undefined) req.set('Idempotency-Key', key);
  return req.set('Content-Type', 'application/json').send(JSON.stringify(body));
}
const cart = (auth = token) => request(app).get('/api/shopping-cart').set('Authorization', `Bearer ${auth}`);
const orderCount = () => database.client.order.count({ where: { userId: f().firstUser.id } });
async function withFault(stage: 'history' | 'delete', sqlstate: '23514' | '40001' | '40P01', failures: number,
  action: (fault: Awaited<ReturnType<typeof installCheckoutFault>>) => Promise<void>) {
  const persisted = await database.client.cart.findUniqueOrThrow({ where: { userId: f().firstUser.id } });
  const fault = await installCheckoutFault(control, { userId: f().firstUser.id, cartId: persisted.id }, stage, sqlstate, failures);
  try { await action(fault); } finally { await fault.remove(); }
}

describe('P07 real PostgreSQL checkout', () => {
  it('atomically prices, snapshots, records pending history and clears only the owner cart', async () => {
    expect((await add({ qty: 2 })).status).toBe(201);
    expect((await add({ modelId: f().secondModel.id, memorySizeId: f().secondMemory.id, color: 'Black', qty: 3 })).status).toBe(201);
    await add({}, otherToken);
    // Ignore cached/cart/starting prices: checkout must read live full-base prices.
    await database.client.cartItem.updateMany({ where: { cart: { userId: f().firstUser.id } }, data: { unitPrice: '0.01' } });
    await database.client.productModel.update({ where: { id: f().model.id }, data: { price: '11.00' } });
    const response = await place('checkout-complete');
    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({ success: true, data: { status: 'pending', currency: 'CNY', totalAmount: '83.70',
      items: [{ productName: f().product.name, modelName: f().model.name, modelSpecification: f().model.specification,
        memoryName: f().memory.name, qty: 2, unitPrice: '11.10', lineTotal: '22.20' },
      { qty: 3, unitPrice: '20.50', lineTotal: '61.50' }] }, meta: null });
    expect(response.text).not.toMatch(/passwordHash|requestFingerprint|idempotencyKey|userId|999\.99/);
    const order = await database.client.order.findUniqueOrThrow({ where: { id: response.body.data.id } });
    expect(order).toMatchObject({ userId: f().firstUser.id, currency: 'CNY', status: 'pending', idempotencyKey: 'checkout-complete' });
    expect(order.requestFingerprint).toMatch(/^[a-f0-9]{64}$/);
    const history = await database.client.orderStatusHistory.findMany({ where: { orderId: order.id } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ fromStatus: null, toStatus: 'pending', operatorId: f().firstUser.id });
    expect((await cart()).body.data.items).toEqual([]);
    expect((await cart(otherToken)).body.data.totalQty).toBe(1);
  });
  it('replays before empty/invalid cart checks and returns the exact original response after later changes', async () => {
    await add({ qty: 2 });
    const original = await place('exact-replay');
    expect(original.status).toBe(201);
    expect((await place('exact-replay')).body).toEqual(original.body);
    await add({ color: 'Black' });
    const refilled = (await cart()).body;
    await database.client.product.update({ where: { id: f().product.id }, data: { name: 'Later product name' } });
    await database.client.productModel.update({ where: { id: f().model.id }, data: { name: 'Later model', specification: 'Later specification', price: '99.00', inStock: false } });
    await database.client.productMemorySize.update({ where: { id: f().memory.id }, data: { name: 'Later memory', extraPrice: '3.00' } });
    // Simulate a future P08 status transition: placement replay remains the creation receipt.
    await database.client.order.update({ where: { id: original.body.data.id }, data: { status: 'approved' } });
    const replay = await place('exact-replay');
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(original.body);
    expect((await cart()).body.data.totalQty).toBe(refilled.data.totalQty);
    const snapshot = await database.client.orderItem.findFirstOrThrow({ where: { orderId: original.body.data.id } });
    expect(snapshot).toMatchObject({ productName: f().product.name, modelName: f().model.name,
      modelSpecification: f().model.specification, memoryName: f().memory.name });
    expect(snapshot.unitPrice.toFixed(2)).toBe('10.10');
    expect(snapshot.lineTotal.toFixed(2)).toBe('20.20');
    expect(await orderCount()).toBe(1);
  });
  it('serializes truly overlapping same-key requests after observed PostgreSQL owner-lock waits', async () => {
    await add();
    await control.query('BEGIN');
    await control.query('SELECT id FROM "User" WHERE id = $1::uuid FOR UPDATE', [f().firstUser.id]);
    const pending = Promise.all([place('overlap'), place('overlap'), place('overlap')]);
    let observed = 0;
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        await control.query('SELECT pg_stat_clear_snapshot()');
        const waits = await control.query<{ count: string }>(`SELECT count(*) FROM pg_stat_activity
          WHERE usename = current_user AND wait_event_type = 'Lock'
          AND query LIKE '%SELECT id FROM "User" WHERE id =%' AND pid <> pg_backend_pid()`);
        observed = Number(waits.rows[0]!.count);
        if (observed >= 3) break;
        await setTimeout(10);
      }
    } finally { await control.query('ROLLBACK'); }
    const responses = await pending;
    expect(observed).toBeGreaterThanOrEqual(3);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 200, 201]);
    for (const response of responses) expect(response.body).toEqual(responses[0]!.body);
    expect(await orderCount()).toBe(1);
    expect(await database.client.orderStatusHistory.count({ where: { operatorId: f().firstUser.id } })).toBe(1);
  });
  it('scopes the same key to each user during simultaneous checkout', async () => {
    await add(); await add({ qty: 2 }, otherToken);
    const responses = await Promise.all([place('shared-key'), place('shared-key', {}, otherToken)]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(responses[0]!.body.data.id).not.toBe(responses[1]!.body.data.id);
    expect(responses.map((response) => response.body.data.totalAmount)).toEqual(['10.10', '20.20']);
  });
  it.each(['price', 'stock'] as const)('uses committed live %s after waiting for a catalog writer', async (change) => {
    await add();
    await control.query('BEGIN');
    if (change === 'price') await control.query('UPDATE "ProductModel" SET price = 12.00 WHERE id = $1', [f().model.id]);
    else await control.query('UPDATE "ProductModel" SET "inStock" = false WHERE id = $1', [f().model.id]);
    const pending = place('catalog-race').then((response) => response);
    let observed = false;
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        await control.query('SELECT pg_stat_clear_snapshot()');
        const waits = await control.query<{ count: string }>(`SELECT count(*) FROM pg_stat_activity
          WHERE usename = current_user AND wait_event_type = 'Lock'
          AND query LIKE '%SELECT chosen.ordinal%' AND pid <> pg_backend_pid()`);
        observed = Number(waits.rows[0]!.count) > 0;
        if (observed) break;
        await setTimeout(10);
      }
    } finally { await control.query('COMMIT'); }
    const response = await pending;
    expect(observed).toBe(true);
    if (change === 'price') {
      expect(response.status).toBe(201);
      expect(response.body.data.totalAmount).toBe('12.10');
      expect((await cart()).body.data.items).toEqual([]);
    } else {
      expect(response.status).toBe(422); expect(response.body.error.code).toBe('PRODUCT_UNAVAILABLE');
      expect(await orderCount()).toBe(0); expect((await cart()).body.data.totalQty).toBe(1);
    }
  });
  it('protects against two different keys consuming the same cart twice', async () => {
    await add();
    const responses = await Promise.all([place('first-key'), place('second-key')]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 422]);
    expect(responses.find((response) => response.status === 422)!.body.error.code).toBe('EMPTY_CART');
    expect(await orderCount()).toBe(1);
  });
  it('serializes checkout against concurrent cart adds without losing purchased or remaining units', async () => {
    await add();
    const [order, added] = await Promise.all([place('cart-race'), add()]);
    expect(order.status).toBe(201);
    expect([200, 201]).toContain(added.status);
    expect(order.body.data.items[0].qty + (await cart()).body.data.totalQty).toBe(2);
  });
  it('allows optional keys but gives unkeyed direct requests no replay guarantee', async () => {
    const first = await place(undefined, f().input);
    const second = await place(undefined, f().input);
    expect(first.status).toBe(201); expect(second.status).toBe(201);
    expect(first.body.data.id).not.toBe(second.body.data.id);
    const row = await database.client.order.findUniqueOrThrow({ where: { id: first.body.data.id } });
    expect(row.idempotencyKey).toBeNull(); expect(row.requestFingerprint).toBeNull();
    await add();
    expect((await place()).status).toBe(201);
    expect((await place()).body.error.code).toBe('EMPTY_CART');
  });
  it('supports direct SKU mode, discards untrusted display/prices and leaves the cart unchanged', async () => {
    await add({ color: 'Black', qty: 4 });
    const before = (await cart()).body;
    const direct = { ...f().input, qty: 2, name: 'Fake', imageSrc: 'https://attacker.invalid/image', model: 'Fake model',
      modelPrice: '-1000', memorySize: 'Fake memory', memorySizePrice: -1000 };
    const response = await place('direct', direct);
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ totalAmount: '20.20', items: [{ productName: f().product.name, unitPrice: '10.10' }] });
    expect(response.text).not.toMatch(/Fake|attacker|-1000/);
    expect((await cart()).body).toEqual(before);
    const replay = await place('direct', { ...direct, name: 'Changed ignored name', modelPrice: 100000 });
    expect(replay.status).toBe(200); expect(replay.body).toEqual(response.body);
  });
  it('returns one order and 409 for overlapping same-key direct payloads with different quantities', async () => {
    const responses = await Promise.all([place('payload-conflict', f().input), place('payload-conflict', { ...f().input, qty: 2 })]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(responses.find((response) => response.status === 409)!.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await orderCount()).toBe(1);
  });
  it('rejects key reuse across modes or changed direct configurations', async () => {
    expect((await place('mode-conflict', f().input)).status).toBe(201);
    for (const body of [{}, { ...f().input, color: 'Black' }, { ...f().input, modelId: f().secondModel.id }, { ...f().input, memorySizeId: f().secondMemory.id }]) {
      expect((await place('mode-conflict', body)).status).toBe(409);
    }
    await add();
    expect((await place('cart-first')).status).toBe(201);
    expect((await place('cart-first', f().input)).status).toBe(409);
  });
  it('returns stable EMPTY_CART and permits the same failed key after adding items', async () => {
    const empty = await place('recover');
    expect(empty.status).toBe(422); expect(empty.body.error.code).toBe('EMPTY_CART');
    expect(await orderCount()).toBe(0);
    await add(); expect((await place('recover')).status).toBe(201);
  });
  it.each(['product', 'model', 'memory', 'color'] as const)('rejects live unavailable %s without consuming any cart line', async (kind) => {
    await add(); await add({ color: 'Black' });
    const before = await database.client.cartItem.findMany({ where: { cart: { userId: f().firstUser.id } }, orderBy: { id: 'asc' } });
    if (kind === 'product') await database.client.product.update({ where: { id: f().product.id }, data: { inStock: false } });
    if (kind === 'model') await database.client.productModel.update({ where: { id: f().model.id }, data: { inStock: false } });
    if (kind === 'memory') await database.client.productMemorySize.update({ where: { id: f().memory.id }, data: { inStock: false } });
    if (kind === 'color') await database.client.productColor.update({ where: { id: f().color.id }, data: { inStock: false } });
    const response = await place('stock');
    expect(response.status).toBe(422); expect(response.body.error.code).toBe('PRODUCT_UNAVAILABLE');
    expect(await orderCount()).toBe(0);
    expect(await database.client.cartItem.findMany({ where: { cart: { userId: f().firstUser.id } }, orderBy: { id: 'asc' } })).toEqual(before);
  });
  it.each(['model', 'memory', 'color', 'product'])('rejects cross-product/unknown direct %s configurations', async (kind) => {
    await add(); const before = (await cart()).body;
    const change = kind === 'model' ? { modelId: f().foreignModel.id } : kind === 'memory' ? { memorySizeId: f().foreignMemory.id }
      : kind === 'color' ? { color: 'Foreign color' } : { productId: 2147483647 };
    const response = await place('invalid-config', { ...f().input, ...change });
    expect(response.status).toBe(422); expect(response.body.error.code).toBe('INVALID_PRODUCT_CONFIGURATION');
    expect((await cart()).body).toEqual(before); expect(await orderCount()).toBe(0);
  });
  it('rejects out-of-band excessive persisted quantity rather than trusting prior validation', async () => {
    await add();
    await database.client.cartItem.updateMany({ where: { cart: { userId: f().firstUser.id } }, data: { quantity: 100 } });
    const response = await place('over-quantity');
    expect(response.status).toBe(422); expect(response.body.error.code).toBe('INVALID_CART');
    expect((await cart()).body.data.totalQty).toBe(100); expect(await orderCount()).toBe(0);
  });
  it.each(['unit', 'line', 'total'])('rejects Decimal column overflow for %s amounts without writes', async (level) => {
    await add({ qty: level === 'line' ? 2 : 1 });
    if (level === 'total') await add({ color: 'Black' });
    await database.client.productModel.update({ where: { id: f().model.id }, data: { price: level === 'unit' ? '9999999999.99' : '6000000000.00' } });
    const before = (await cart()).body;
    const response = await place('overflow');
    expect(response.status).toBe(422); expect(response.body.error.code).toBe('ORDER_AMOUNT_EXCEEDED');
    expect((await cart()).body).toEqual(before); expect(await orderCount()).toBe(0);
  });
  it.each(['history', 'delete'] as const)('rolls back order/items/history/cart on a real database failure during %s', async (stage) => {
    await add({ qty: 2 }); await add({ color: 'Black' });
    const before = (await cart()).body;
    await withFault(stage, '23514', 100, async (fault) => {
      const response = await place('rollback');
      expect(response.status).toBe(500); expect(response.body.error.code).toBe('INTERNAL_ERROR');
      expect(response.text).not.toMatch(/private|23514|p07_fault|Prisma/);
      expect(await fault.attempts()).toBe(1);
      expect(await orderCount()).toBe(0);
      expect(await database.client.orderItem.count({ where: { order: { userId: f().firstUser.id } } })).toBe(0);
      expect(await database.client.orderStatusHistory.count({ where: { operatorId: f().firstUser.id } })).toBe(0);
      expect((await cart()).body).toEqual(before);
    });
    expect((await place('rollback')).status).toBe(201);
  });
  it.each(['40001', '40P01'] as const)('retries the complete transaction for PostgreSQL %s and commits only once', async (code) => {
    await add();
    await withFault('delete', code, 1, async (fault) => {
      const response = await place('retry-conflict');
      expect(response.status).toBe(201); expect(await fault.attempts()).toBe(2);
      expect(await orderCount()).toBe(1);
      expect(await database.client.orderStatusHistory.count({ where: { operatorId: f().firstUser.id } })).toBe(1);
      expect((await cart()).body.data.items).toEqual([]);
      expect((await place('retry-conflict')).body).toEqual(response.body);
    });
  });
  it('bounds repeated recognized conflicts to three attempts, preserving the cart for client retry', async () => {
    await add(); const before = (await cart()).body;
    await withFault('delete', '40001', 100, async (fault) => {
      const response = await place('exhausted');
      expect(response.status).toBe(503); expect(response.body.error.code).toBe('CHECKOUT_BUSY');
      expect(await fault.attempts()).toBe(3); expect(await orderCount()).toBe(0);
      expect((await cart()).body).toEqual(before);
    });
    expect((await place('exhausted')).status).toBe(201);
  });
  it('keeps the per-user unique key constraint authoritative for direct database writes', async () => {
    const first = await place('unique-db', f().input); expect(first.status).toBe(201);
    await expect(database.client.order.create({ data: { userId: f().firstUser.id, totalAmount: '10.10',
      idempotencyKey: 'unique-db', requestFingerprint: 'a'.repeat(64) } })).rejects.toMatchObject({ code: 'P2002' });
    expect(await orderCount()).toBe(1);
  });
  it('requires valid auth and rejects unexpected route casing', async () => {
    expect((await request(app).post('/api/orders/place').send({})).status).toBe(401);
    expect((await place('auth', {}, 'invalid')).status).toBe(401);
    expect((await request(app).post('/api/orders/Place').set('Authorization', `Bearer ${token}`).send({})).status).toBe(404);
  });
  it.each(['', 'a'.repeat(129), 'with space', 'a,b', 'bad/key'])('rejects invalid idempotency header [%s]', async (key) => {
    const response = await place(key, f().input);
    expect(response.status).toBe(400); expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await orderCount()).toBe(0);
  });
  it('accepts the maximum 128-character key and replays it using case-insensitive header names', async () => {
    const key = 'a'.repeat(128);
    const first = await place(key, f().input); expect(first.status).toBe(201);
    const second = await request(app).post('/api/orders/place').set('Authorization', `Bearer ${token}`)
      .set('iDeMpOtEnCy-KeY', key).send(f().input);
    expect(second.status).toBe(200); expect(second.body).toEqual(first.body);
  });
  it('rejects repeated wire headers even when the key values match', async () => {
    const response = await request(app).post('/api/orders/place').set('Authorization', `Bearer ${token}`)
      .set({ 'Idempotency-Key': ['repeat', 'repeat'] }).send(f().input);
    expect(response.status).toBe(400); expect(await orderCount()).toBe(0);
  });
  it('requires an explicit JSON body instead of treating an unparsed body as cart checkout', async () => {
    await add();
    const missing = await request(app).post('/api/orders/place').set('Authorization', `Bearer ${token}`);
    const unparsed = await request(app).post('/api/orders/place').set('Authorization', `Bearer ${token}`)
      .type('form').send({ total: '0.01' });
    const query = await request(app).post('/api/orders/place?userId=other').set('Authorization', `Bearer ${token}`).send({});
    for (const response of [missing, unparsed, query]) {
      expect(response.status).toBe(400); expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await orderCount()).toBe(0); expect((await cart()).body.data.totalQty).toBe(1);
  });
  it.each([{ total: '0.01' }, { shipping: 0 }, { payment: 'paid' }, { userId: 'other' },
    { productId: 1 }, { qty: 1 }, null, []])('rejects unsupported bodies without consuming the cart: %j', async (body) => {
    await add();
    const response = await place('invalid-body', body);
    expect(response.status).toBe(400);
    expect((await cart()).body.data.totalQty).toBe(1); expect(await orderCount()).toBe(0);
  });
});

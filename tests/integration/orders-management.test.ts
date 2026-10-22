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
import { installDecisionFault } from '../helpers/order-decision-fault.js';

const config = parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET: randomBytes(32).toString('hex') });
const tokens = createTokens(config);
let database: ReturnType<typeof createDatabase>;
let control: Client;
let app: ReturnType<typeof createApp>;
let fixture: CartFixture | undefined;
let adminId: string;
let firstToken: string;
let secondToken: string;
let adminToken: string;
let firstOrder: number;
let secondOrder: number;
let passwordHash: string;
let baseline: number[];
function f() { if (!fixture) throw new Error('Missing fixture'); return fixture; }
const counts = () => Promise.all([database.client.user.count(), database.client.cart.count(), database.client.cartItem.count(),
  database.client.order.count(), database.client.orderItem.count(), database.client.orderStatusHistory.count(),
  database.client.product.count(), database.client.productModel.count(), database.client.productMemorySize.count(), database.client.productColor.count()]);
const detail = (id: number | string, token = firstToken) => request(app).get(`/api/orders/${id}`).set('Authorization', `Bearer ${token}`);
const list = (query: Record<string, unknown> = {}, token = firstToken, admin = false) => request(app)
  .get(admin ? '/api/admin/orders' : '/api/orders').set('Authorization', `Bearer ${token}`).query(query);
const decide = (id: number, action: 'approve' | 'reject', body: unknown = {}, token = adminToken) => request(app)
  .post(`/api/orders/${id}/${action}`).set('Authorization', `Bearer ${token}`).type('json').send(JSON.stringify(body));
const history = (id = firstOrder) => database.client.orderStatusHistory.findMany({ where: { orderId: id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
async function place(token = firstToken, key = randomBytes(12).toString('hex')) {
  const response = await request(app).post('/api/orders/place').set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', key).send({ ...f().input, qty: 2 });
  expect(response.status).toBe(201);
  return response;
}
async function waitForLocks(pattern: string, minimum: number) {
  let observed = 0;
  for (let i = 0; i < 100; i += 1) {
    await control.query('SELECT pg_stat_clear_snapshot()');
    const rows = await control.query<{ count: string }>(`SELECT count(*) FROM pg_stat_activity
      WHERE usename = current_user AND wait_event_type = 'Lock' AND query LIKE $1 AND pid <> pg_backend_pid()`, [pattern]);
    observed = Number(rows.rows[0]!.count);
    if (observed >= minimum) break;
    await setTimeout(10);
  }
  return observed;
}
beforeAll(async () => {
  control = new Client({ connectionString: testDatabaseUrl(process.env), connectionTimeoutMillis: 2000 });
  await control.connect(); await assertTestConnection(control);
  database = createDatabase(testDatabaseUrl(process.env), 5000);
  baseline = await counts();
  passwordHash = await hashPassword(randomBytes(32).toString('base64url'));
});
beforeEach(async () => {
  await database.client.$transaction(async (tx) => {
    fixture = await createCartFixture(tx, passwordHash);
    const admin = await tx.user.create({ data: { username: `${f().firstUser.username}_admin`,
      email: `${f().firstUser.username}_admin@example.test`, passwordHash, role: 'ADMIN' } });
    adminId = admin.id;
  });
  firstToken = (await tokens.issue(f().firstUser.id)).token;
  secondToken = (await tokens.issue(f().secondUser.id)).token;
  adminToken = (await tokens.issue(adminId)).token;
  const auth = createAuthService(createAuthRepository(database.client), config);
  app = createApp(config, undefined, database.check, { auth, cartDatabase: database.client, ordersDatabase: database.client });
  firstOrder = (await place()).body.data.id;
  secondOrder = (await place(secondToken)).body.data.id;
});
afterEach(async () => {
  if (!fixture) return;
  const owned = fixture;
  await database.client.$transaction(async (tx) => {
    const userId = { in: [owned.firstUser.id, owned.secondUser.id, adminId] };
    await tx.orderStatusHistory.deleteMany({ where: { order: { userId } } });
    await tx.orderItem.deleteMany({ where: { order: { userId } } });
    await tx.order.deleteMany({ where: { userId } });
    await tx.user.deleteMany({ where: { id: userId } });
    const productId = { in: [owned.product.id, owned.foreignProduct.id] };
    await tx.productColor.deleteMany({ where: { productId } });
    await tx.productMemorySize.deleteMany({ where: { productId } });
    await tx.productModel.deleteMany({ where: { productId } });
    await tx.product.deleteMany({ where: { id: productId } });
  });
  fixture = undefined;
});
afterAll(async () => {
  try { if (database) expect(await counts()).toEqual(baseline); }
  finally { await database?.disconnect(); await control?.end(); }
});

describe('P08 real PostgreSQL order reads and ADMIN decisions', () => {
  it('returns owned immutable snapshots/history and allows ADMIN detail without sensitive fields', async () => {
    await database.client.productModel.update({ where: { id: f().model.id }, data: { name: 'Changed live model', price: '99.00' } });
    const response = await detail(firstOrder);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({ success: true, meta: null, data: { id: firstOrder, userId: f().firstUser.id,
      status: 'pending', currency: 'CNY', totalAmount: '20.20',
      items: [{ productName: f().product.name, modelName: f().model.name, qty: 2, unitPrice: '10.10', lineTotal: '20.20' }],
      statusHistory: [{ fromStatus: null, toStatus: 'pending', operatorId: f().firstUser.id, metadata: null }] } });
    expect(response.text).not.toMatch(/passwordHash|\$argon2|requestFingerprint|idempotencyKey|checkoutVersion|placement|token|paymentUri|Changed live/);
    expect((await detail(firstOrder, adminToken)).body).toEqual(response.body);
    expect((await detail(secondOrder, secondToken)).status).toBe(200);
    expect((await detail(secondOrder, adminToken)).status).toBe(200);
  });
  it('makes another user order indistinguishable from a missing ID', async () => {
    const foreign = await detail(firstOrder, secondToken);
    const missing = await detail(2147483647, secondToken);
    expect(foreign.status).toBe(404); expect(missing.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
    expect(foreign.body.error.code).toBe('ORDER_NOT_FOUND');
  });
  it('lists only own orders, including for an ADMIN, while the ADMIN list includes both users', async () => {
    const own = await list();
    expect(own.status).toBe(200); expect(own.body.data.map((o: { id: number }) => o.id)).toEqual([firstOrder]);
    expect(own.body.meta).toEqual({ pageSize: 20, sort: 'newest', hasMore: false, nextCursor: null });
    expect((await list({}, secondToken)).body.data.map((o: { id: number }) => o.id)).toEqual([secondOrder]);
    expect((await list({}, adminToken)).body.data).toEqual([]);
    const all = await list({}, adminToken, true);
    expect(all.status).toBe(200);
    expect(all.body.data.map((o: { id: number }) => o.id)).toEqual(expect.arrayContaining([firstOrder, secondOrder]));
    expect(all.body.data[0]).toHaveProperty('items'); expect(all.body.data[0]).toHaveProperty('statusHistory');
    expect(all.text).not.toMatch(/passwordHash|requestFingerprint|idempotencyKey|JWT|paymentUri/);
  });
  it.each(['newest', 'oldest'])('paginates deterministically with timestamp ties (%s), without offsets or another user data', async (sort) => {
    const third = (await place()).body.data.id as number;
    const fourth = (await place()).body.data.id as number;
    await database.client.order.updateMany({ where: { id: { in: [firstOrder, third, fourth] } }, data: { createdAt: new Date('2026-01-01T00:00:00.000Z') } });
    const expected = [firstOrder, third, fourth].sort((a, b) => sort === 'newest' ? b - a : a - b);
    const first = await list({ pageSize: 2, sort });
    expect(first.status).toBe(200); expect(first.body.meta.hasMore).toBe(true);
    expect(first.body.data.map((o: { id: number }) => o.id)).toEqual(expected.slice(0, 2));
    const second = await list({ pageSize: 2, sort, cursor: first.body.meta.nextCursor });
    expect(second.body.data.map((o: { id: number }) => o.id)).toEqual(expected.slice(2));
    expect(second.body.meta).toEqual({ pageSize: 2, sort, hasMore: false, nextCursor: null });
    const mismatch = await list({ sort: sort === 'newest' ? 'oldest' : 'newest', cursor: first.body.meta.nextCursor });
    expect(mismatch.status).toBe(400);
  });
  it('supports ADMIN cursor pagination and a foreign cursor never grants access to foreign orders', async () => {
    const first = await list({ pageSize: 1 }, adminToken, true);
    expect(first.body.meta.hasMore).toBe(true);
    const second = await list({ pageSize: 1, cursor: first.body.meta.nextCursor }, adminToken, true);
    expect(second.status).toBe(200); expect(second.body.data[0].id).not.toBe(first.body.data[0].id);
    const own = await list({ cursor: first.body.meta.nextCursor });
    expect(own.status).toBe(200);
    expect(own.body.data.every((order: { userId: string }) => order.userId === f().firstUser.id)).toBe(true);
  });
  it('returns an empty page for a valid cursor beyond the oldest order', async () => {
    const cursor = Buffer.from(JSON.stringify({ v: 1, sort: 'newest', createdAt: '1900-01-01T00:00:00.000Z', id: 1 })).toString('base64url');
    const response = await list({ cursor });
    expect(response.status).toBe(200); expect(response.body.data).toEqual([]);
    expect(response.body.meta.hasMore).toBe(false); expect(response.body.meta.nextCursor).toBeNull();
  });
  it.each(['approve', 'reject'] as const)('atomically applies %s with correct operator/time and preserves receipt/items', async (action) => {
    const id = action === 'approve' ? firstOrder : secondOrder;
    const before = await database.client.order.findUniqueOrThrow({ where: { id }, include: { items: true } });
    const response = await decide(id, action, { metadata: { note: '  Reviewed by operator  ' } });
    const status = action === 'approve' ? 'approved' : 'rejected';
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe(status);
    const after = await database.client.order.findUniqueOrThrow({ where: { id }, include: { items: true } });
    expect(after.metadata).toEqual(before.metadata); expect(after.items).toEqual(before.items);
    expect(after.totalAmount.equals(before.totalAmount)).toBe(true);
    const entries = await history(id);
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({ operatorId: adminId, fromStatus: 'pending', toStatus: status, metadata: { note: 'Reviewed by operator' } });
    expect(entries[1]!.createdAt).toEqual(after.updatedAt);
    expect(response.body.data.statusHistory[1].createdAt).toBe(after.updatedAt.toISOString());
    expect((await detail(id, action === 'approve' ? firstToken : secondToken)).body).toEqual(response.body);
    for (const repeated of ['approve', 'reject'] as const) {
      const conflict = await decide(id, repeated);
      expect(conflict.status).toBe(409); expect(conflict.body.error.code).toBe('ORDER_INVALID_TRANSITION');
    }
    expect(await history(id)).toHaveLength(2);
  });
  it('keeps P07 exact placement replay distinct from fresh current-status reads', async () => {
    const placed = await place(firstToken, 'p08-replay');
    expect((await decide(placed.body.data.id, 'approve')).status).toBe(200);
    const replay = await request(app).post('/api/orders/place').set('Authorization', `Bearer ${firstToken}`)
      .set('Idempotency-Key', 'p08-replay').send({ ...f().input, qty: 2 });
    expect(replay.status).toBe(200); expect(replay.body).toEqual(placed.body);
    expect((await detail(placed.body.data.id)).body.data.status).toBe('approved');
  });
  it('normalizes a deprecated metadata string as a plain bounded note without parsing authority', async () => {
    const note = '{"operatorId":"attacker","status":"approved","paymentUri":"fake"}';
    const response = await decide(firstOrder, 'reject', { metadata: `  ${note}  ` });
    expect(response.status).toBe(200); expect(response.body.meta).toEqual({ deprecatedFields: ['metadata'] });
    expect(response.body.data.status).toBe('rejected');
    expect((await history())[1]).toMatchObject({ operatorId: adminId, toStatus: 'rejected', metadata: { note } });
  });
  it('accepts absent metadata/body and exposes only recognized structured history metadata', async () => {
    const response = await request(app).post(`/api/orders/${firstOrder}/approve`).set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(200); expect((await history())[1]!.metadata).toBeNull();
    const entry = (await history())[1]!;
    await database.client.orderStatusHistory.update({ where: { id: entry.id }, data: { metadata: { passwordHash: 'private-value', token: 'private-token' } } });
    await database.client.orderItem.updateMany({ where: { orderId: firstOrder }, data: { productId: null } });
    const read = await detail(firstOrder);
    expect(read.status).toBe(200); expect(read.body.data.items[0].productId).toBeNull();
    expect(read.body.data.statusHistory[1].metadata).toBeNull(); expect(read.text).not.toMatch(/private-value|private-token|passwordHash/);
  });
  it('allows exactly one opposite decision under observed concurrent PostgreSQL UPDATE waits', async () => {
    await control.query('BEGIN');
    await control.query('SELECT id FROM "Order" WHERE id = $1 FOR UPDATE', [firstOrder]);
    const pending = Promise.all([decide(firstOrder, 'approve'), decide(firstOrder, 'reject')]);
    let waiters: number;
    try { waiters = await waitForLocks('%UPDATE "Order"%', 2); }
    finally { await control.query('ROLLBACK'); }
    const responses = await pending;
    expect(waiters).toBeGreaterThanOrEqual(2);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = responses.find((r) => r.status === 200)!;
    const row = await database.client.order.findUniqueOrThrow({ where: { id: firstOrder } });
    const entries = await history();
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({ fromStatus: 'pending', toStatus: row.status, operatorId: adminId });
    expect(row.status).toBe(winner.body.data.status); expect(entries[1]!.createdAt).toEqual(row.updatedAt);
  });
  it('rolls back the conditional state update when history insertion fails in PostgreSQL', async () => {
    const before = await database.client.order.findUniqueOrThrow({ where: { id: firstOrder } });
    const fault = await installDecisionFault(control, firstOrder);
    try {
      const response = await decide(firstOrder, 'approve');
      expect(response.status).toBe(500); expect(response.body.error.code).toBe('INTERNAL_ERROR');
      expect(response.text).not.toMatch(/private|23514|Prisma|p08_fault/); expect(await fault.called()).toBe(true);
      expect(await database.client.order.findUniqueOrThrow({ where: { id: firstOrder } })).toEqual(before);
      expect(await history()).toHaveLength(1);
    } finally { await fault.remove(); }
    expect((await decide(firstOrder, 'reject')).status).toBe(200);
  });
  it('rechecks ADMIN role inside the transaction after a concurrent demotion', async () => {
    await control.query('BEGIN');
    await control.query('UPDATE "User" SET role = \'USER\' WHERE id = $1::uuid', [adminId]);
    const pending = decide(firstOrder, 'approve').then((response) => response);
    let waiters: number;
    try { waiters = await waitForLocks('%SELECT role FROM "User"%', 1); }
    finally { await control.query('COMMIT'); }
    const response = await pending;
    expect(waiters).toBeGreaterThanOrEqual(1); expect(response.status).toBe(403);
    expect((await detail(firstOrder)).body.data.status).toBe('pending'); expect(await history()).toHaveLength(1);
    expect((await list({}, adminToken, true)).status).toBe(403);
  });
  it.each(['approve', 'reject'] as const)('denies USER %s even for own/missing orders', async (action) => {
    for (const id of [firstOrder, secondOrder, 2147483647]) expect((await decide(id, action, {}, firstToken)).status).toBe(403);
    expect(await history()).toHaveLength(1); expect(await history(secondOrder)).toHaveLength(1);
  });
  it('denies USER access to the ADMIN list and exposes no unapprove action', async () => {
    expect((await list({}, firstToken, true)).status).toBe(403);
    expect((await request(app).post(`/api/orders/${firstOrder}/unapprove`).set('Authorization', `Bearer ${adminToken}`).send({})).status).toBe(404);
  });
  it.each(['', 'Bearer invalid'])('requires authentication on all new routes (%s)', async (authorization) => {
    for (const [method, path] of [['get', '/api/orders'], ['get', `/api/orders/${firstOrder}`], ['get', '/api/admin/orders'],
      ['post', `/api/orders/${firstOrder}/approve`], ['post', `/api/orders/${firstOrder}/reject`]] as const) {
      const req = request(app)[method](path);
      if (authorization) req.set('Authorization', authorization);
      const response = await req;
      expect(response.status).toBe(401); expect(response.body.error.code).toBe('UNAUTHORIZED');
    }
  });
  it('returns stable missing-order errors for ADMIN detail and decisions', async () => {
    for (const response of [await detail(2147483647, adminToken), await decide(2147483647, 'approve'), await decide(2147483647, 'reject')]) {
      expect(response.status).toBe(404); expect(response.body.error.code).toBe('ORDER_NOT_FOUND');
    }
  });
  it.each(['0', '-1', '1.5', '2147483648', 'abc', '01'])('rejects invalid order ID %s', async (id) => {
    expect((await detail(id)).status).toBe(400);
    expect((await request(app).post(`/api/orders/${id}/approve`).set('Authorization', `Bearer ${adminToken}`).send({})).status).toBe(400);
  });
  it.each([{ pageSize: 0 }, { pageSize: 101 }, { pageSize: '01' }, { pageSize: '1.5' }, { pageSize: ['1', '2'] },
    { cursor: '*' }, { cursor: 'a'.repeat(257) }, { cursor: Buffer.from('{}').toString('base64url') },
    { sort: 'price_asc' }, { sort: ['newest', 'oldest'] }, { userId: 'another' }, { page: 1 }])('rejects invalid query %j', async (query) => {
    for (const admin of [false, true]) {
      const response = await list(query, admin ? adminToken : firstToken, admin);
      expect(response.status).toBe(400); expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
  it.each([{ metadata: '' }, { metadata: 'a'.repeat(501) }, { metadata: ' '.repeat(1001) }, { metadata: 'line\nline' },
    { metadata: null }, { metadata: [] }, { metadata: { note: 'ok', operatorId: 'other' } }, { metadata: { note: { nested: true } } },
    { status: 'approved' }, { operatorId: 'other' }, { paymentUri: 'fake' }, { metadata: { note: 'ok' }, totalAmount: '0.01' }, []])('rejects invalid decision body %j without changing state', async (body) => {
      const response = await decide(firstOrder, 'approve', body);
      expect(response.status).toBe(400); expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect((await detail(firstOrder)).body.data.status).toBe('pending'); expect(await history()).toHaveLength(1);
    });
  it('rejects GET bodies, decision queries and unparsed non-JSON decision bodies', async () => {
    const read = await request(app).get(`/api/orders/${firstOrder}`).set('Authorization', `Bearer ${firstToken}`).send({ userId: 'other' });
    const query = await request(app).post(`/api/orders/${firstOrder}/approve?status=rejected`).set('Authorization', `Bearer ${adminToken}`).send({});
    const form = await request(app).post(`/api/orders/${firstOrder}/approve`).set('Authorization', `Bearer ${adminToken}`).type('form').send({ metadata: 'ignored?' });
    for (const response of [read, query, form]) expect(response.status).toBe(400);
    expect(await history()).toHaveLength(1);
  });
  it('has both reviewed keyset indexes on the actual test schema', async () => {
    const rows = await control.query<{ indexname: string }>(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'Order'`);
    expect(rows.rows.map((row) => row.indexname)).toEqual(expect.arrayContaining(['Order_createdAt_id_idx', 'Order_userId_createdAt_id_idx']));
  });
});

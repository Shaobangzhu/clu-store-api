import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { assertTestConnection, testDatabaseUrl } from './test-database-guard.js';
import { createDatabase } from '../src/lib/database.js';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { serializeMoney } from '../src/lib/money.js';

const connectionString = testDatabaseUrl(process.env);
const client = new Client({ connectionString, connectionTimeoutMillis: 2000, statement_timeout: 2000 });
let checks = 0;
async function rejects(sql: string, values: unknown[], expectedCode: string) {
  await client.query('SAVEPOINT expected_failure');
  let actualCode: unknown;
  try { await client.query(sql, values); }
  catch (error) { actualCode = error && typeof error === 'object' && 'code' in error ? error.code : undefined; }
  finally { await client.query('ROLLBACK TO SAVEPOINT expected_failure'); }
  assert.equal(actualCode, expectedCode, `Expected PostgreSQL SQLSTATE ${expectedCode}`);
  checks += 1;
}
async function id(sql: string, values: unknown[] = []): Promise<number> {
  const result = await client.query<{ id: number }>(sql, values);
  assert.ok(result.rows[0]);
  return result.rows[0].id;
}

await client.connect();
try {
  await assertTestConnection(client);
  const migrations = await client.query('SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
  assert.ok(migrations.rows[0].count >= 1);
  const version = await client.query('SHOW server_version_num');
  assert.equal(Math.floor(Number(version.rows[0].server_version_num) / 10000), 18);
  checks += 2;

  const forbiddenUrl = new URL(connectionString);
  forbiddenUrl.pathname = '/clu_store_dev';
  const forbidden = new Client({ connectionString: forbiddenUrl.toString(), connectionTimeoutMillis: 2000 });
  try { await assert.rejects(forbidden.connect(), (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === '42501'); }
  finally { await forbidden.end(); }
  checks += 1;

  await client.query('BEGIN');
  try {
    // Synthetic integrity probes only; everything below is rolled back, never catalog seed data.
    const user = randomUUID();
    const other = randomUUID();
    const username = `smoke-${user}`;
    await client.query('INSERT INTO "User" (id,username,email,"passwordHash","updatedAt") VALUES ($1,$2,$3,$4,now()),($5,$6,$7,$4,now())',
      [user, username, `${user}@example.invalid`, 'not-a-login-hash', other, `smoke-${other}`, `${other}@example.invalid`]);
    await rejects('INSERT INTO "User" (id,username,email,"passwordHash","updatedAt") VALUES ($1,$2,$3,$4,now())',
      [randomUUID(), username.toUpperCase(), 'different@example.invalid', 'not-a-login-hash'], '23505');
    await rejects('INSERT INTO "User" (id,username,email,"passwordHash","updatedAt") VALUES ($1,$2,$3,$4,now())',
      [randomUUID(), 'different', ` ${user.toUpperCase()}@EXAMPLE.INVALID `, 'not-a-login-hash'], '23505');
    const category = await id('INSERT INTO "Category" (title,slug,"editorialFeatures") VALUES ($1,$1,$2) RETURNING id', [user, JSON.stringify([{ title: 'synthetic probe' }])]);
    const productSql = 'INSERT INTO "Product" ("categoryId",name,title,"imageSrc","carouselImages","startingPrice",features,"updatedAt") VALUES ($1,$2,$2,$3,$4,$5,$4,now()) RETURNING id';
    const product = await id(productSql, [category, 'synthetic probe', 'local-placeholder', '[]', '10.10']);
    const otherProduct = await id(productSql, [null, 'synthetic probe', 'local-placeholder', '[]', '20.00']);
    await rejects(productSql, [category, 'synthetic probe', 'local-placeholder', '[]', '-1'], '23514');
    const modelSql = 'INSERT INTO "ProductModel" ("productId",name,specification,price) VALUES ($1,$2,$2,$3) RETURNING id';
    const model = await id(modelSql, [product, 'synthetic probe', '10.10']);
    const wrongModel = await id(modelSql, [otherProduct, 'synthetic probe', '20.00']);
    const memory = await id('INSERT INTO "ProductMemorySize" ("productId",name,"extraPrice") VALUES ($1,$2,$3) RETURNING id', [product, 'synthetic probe', '2.20']);
    const wrongMemory = await id('INSERT INTO "ProductMemorySize" ("productId",name,"extraPrice") VALUES ($1,$2,$3) RETURNING id', [otherProduct, 'synthetic probe', '0.00']);
    await client.query('INSERT INTO "ProductColor" ("productId",name) VALUES ($1,$2),($3,$4)', [product, 'probe-color', otherProduct, 'other-color']);
    const cartSql = 'INSERT INTO "Cart" ("userId","updatedAt") VALUES ($1,now()) RETURNING id';
    const cart = await id(cartSql, [user]);
    await rejects(cartSql, [user], '23505');
    const cartItemSql = 'INSERT INTO "CartItem" ("cartId","productId","modelId","memorySizeId",color,quantity,"unitPrice","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,now()) RETURNING id';
    const values = [cart, product, model, memory, 'probe-color', 2, '12.30'];
    await id(cartItemSql, values);
    await rejects(cartItemSql, values, '23505');
    await rejects(cartItemSql, [cart, product, wrongModel, memory, 'probe-color', 1, '1'], '23503');
    await rejects(cartItemSql, [cart, product, model, wrongMemory, 'probe-color', 1, '1'], '23503');
    await rejects(cartItemSql, [cart, product, model, memory, 'other-color', 1, '1'], '23503');
    await rejects('UPDATE "CartItem" SET quantity=0 WHERE "cartId"=$1', [cart], '23514');
    await rejects('UPDATE "CartItem" SET "unitPrice"=-1 WHERE "cartId"=$1', [cart], '23514');

    const orderSql = 'INSERT INTO "Order" ("userId","totalAmount","idempotencyKey","requestFingerprint",metadata,"updatedAt") VALUES ($1,$2,$3,$4,$5,now()) RETURNING id';
    const order = await id(orderSql, [user, '24.60', 'probe-key', 'a'.repeat(64), '{"probe":true}']);
    await rejects(orderSql, [user, '24.60', 'probe-key', 'a'.repeat(64), null], '23505');
    await id(orderSql, [other, '0', 'probe-key', 'b'.repeat(64), null]);
    await id(orderSql, [user, '0', null, null, null]);
    await id(orderSql, [user, '0', null, null, null]);
    await rejects(orderSql, [user, '0', 'missing-fingerprint', null, null], '23514');
    await rejects(orderSql, [user, '0', 'bad-fingerprint', 'bad', null], '23514');
    await rejects('UPDATE "Order" SET currency=$1 WHERE id=$2', ['USD', order], '22P02');
    const itemSql = 'INSERT INTO "OrderItem" ("orderId","productId","productName","modelName","modelSpecification","memoryName",color,"unitPrice",quantity,"lineTotal") VALUES ($1,$2,$3,$3,$3,$3,$3,$4,$5,$6) RETURNING id';
    await id(itemSql, [order, product, 'synthetic snapshot', '12.30', 2, '24.60']);
    await rejects(itemSql, [order, product, 'synthetic snapshot', '12.30', 2, '0'], '23514');
    await rejects('DELETE FROM "Order" WHERE id=$1', [order], '23001');
    await rejects('DELETE FROM "Product" WHERE id=$1', [product], '23001');
    await rejects('DELETE FROM "User" WHERE id=$1', [user], '23001');
    await client.query('INSERT INTO "OrderStatusHistory" ("orderId","toStatus","operatorId") VALUES ($1,$2,$3)', [order, 'pending', user]);
    await rejects('INSERT INTO "OrderStatusHistory" ("orderId","fromStatus","toStatus","operatorId") VALUES ($1,$2,$3,$4)', [order, 'approved', 'pending', user], '23514');
    await client.query('INSERT INTO "NewArrival" ("displayOrder",title,detail,"imageSrc","textColor") VALUES (0,$1,$1,$1,$1)', ['synthetic editorial probe']);
    const arrival = await id('INSERT INTO "NewArrival" ("productId","displayOrder",title,detail,"imageSrc","textColor") VALUES ($1,0,$2,$2,$2,$2) RETURNING id', [otherProduct, 'synthetic linked probe']);
    // Remove only option probes within this transaction, then verify SetNull behavior.
    await client.query('DELETE FROM "ProductModel" WHERE "productId"=$1', [otherProduct]);
    await client.query('DELETE FROM "ProductMemorySize" WHERE "productId"=$1', [otherProduct]);
    await client.query('DELETE FROM "ProductColor" WHERE "productId"=$1', [otherProduct]);
    await client.query('DELETE FROM "Product" WHERE id=$1', [otherProduct]);
    assert.equal((await client.query('SELECT "productId" FROM "NewArrival" WHERE id=$1', [arrival])).rows[0].productId, null);
    await client.query('DELETE FROM "Cart" WHERE id=$1', [cart]);
    assert.equal((await client.query('SELECT count(*)::int AS count FROM "CartItem" WHERE "cartId"=$1', [cart])).rows[0].count, 0);
    checks += 4; // distinct users/nullable keys, editorial card, SetNull and cart cascade
  } finally {
    await client.query('ROLLBACK');
  }
} finally {
  await client.end();
}

const database = createDatabase(connectionString, 500);
try {
  const result = await database.client.$queryRaw<{ amount: import('../src/generated/prisma/client.js').Prisma.Decimal }[]>`SELECT 12.30::numeric(12,2) AS amount`;
  assert.ok(result[0]);
  assert.equal(serializeMoney(result[0].amount), '12.30');
  const config = parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', DB_CHECK_TIMEOUT_MS: '500' });
  const response = await request(createApp(config, undefined, database.check)).get('/ready');
  assert.equal(response.status, 200);
  checks += 2;
} finally { await database.disconnect(); }
console.log(`PostgreSQL 18 migration/constraint/role/readiness smoke passed (${checks} checks); synthetic rows rolled back.`);

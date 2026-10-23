import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { boundedReadiness } from '../src/lib/readiness.js';
import { serializeMoney } from '../src/lib/money.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { testDatabaseUrl } from '../scripts/test-database-guard.js';

const config = parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', DB_CHECK_TIMEOUT_MS: '20' });
const dev = 'postgresql://clu_dev@localhost:5433/clu_store_dev';
const test = 'postgresql://clu_test@localhost:5433/clu_store_test';

describe('database readiness', () => {
  it('returns ready only after a successful probe', async () => {
    let called = false;
    const app = createApp(config, undefined, async () => { called = true; });
    const res = await request(app).get('/ready');
    expect(called).toBe(true);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { status: 'ready', database: 'up' }, meta: null });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('sanitizes database failures', async () => {
    const app = createApp(config, undefined, async () => { throw new Error('private connection details'); });
    const res = await request(app).get('/ready');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_NOT_READY');
    expect(res.body.error.details).toEqual({ database: 'unavailable' });
    expect(JSON.stringify(res.body)).not.toContain('private');
  });

  it('bounds stalled probes, coalesces them, and leaves liveness available', async () => {
    let calls = 0;
    const app = createApp(config, undefined, () => {
      calls += 1;
      return new Promise<void>(() => {});
    });
    const responses = await Promise.all([request(app).get('/ready'), request(app).get('/ready')]);
    expect(responses.map((res) => res.status)).toEqual([503, 503]);
    expect(calls).toBe(1);
    expect((await request(app).get('/health')).status).toBe(200);
  });

  it('allows a new probe after a database failure', async () => {
    let fail = true;
    const check = boundedReadiness(async () => { if (fail) throw new Error('unavailable'); }, 100);
    await expect(check()).rejects.toThrow();
    fail = false;
    await expect(check()).resolves.toBeUndefined();
  });
});

describe('test database protection', () => {
  it('accepts the isolated local test database', () => {
    expect(testDatabaseUrl({ DATABASE_URL: dev, TEST_DATABASE_URL: test })).toBe(test);
  });
  it.each([
    dev,
    test.replace('clu_test@', 'clu_dev@'),
    test.replace('localhost', 'remote.example'),
    `${test}?schema=public`,
    test.replace('clu_store_test', 'clu_store_dev'),
    test.replace('clu_store_test', 'clu_store_%64ev'),
  ])('refuses an unsafe test target: %s', (value) => {
    expect(() => testDatabaseUrl({ DATABASE_URL: dev, TEST_DATABASE_URL: value })).toThrow();
  });
  it('refuses the same database through a different host alias', () => {
    expect(() => testDatabaseUrl({ DATABASE_URL: test.replace('localhost', '127.0.0.1'), TEST_DATABASE_URL: test })).toThrow();
  });
  it('fails closed when either URL is missing', () => {
    expect(() => testDatabaseUrl({ DATABASE_URL: dev })).toThrow();
    expect(() => testDatabaseUrl({ TEST_DATABASE_URL: test })).toThrow();
  });
  it('refuses production mode even for an otherwise valid local test URL', () => {
    expect(() => testDatabaseUrl({ NODE_ENV: 'production', DATABASE_URL: dev, TEST_DATABASE_URL: test })).toThrow('production');
  });
});

it('serializes Decimal money as fixed-scale strings without floating point arithmetic', () => {
  const total = new Prisma.Decimal('5999.00').plus('800.10');
  expect(serializeMoney(total)).toBe('6799.10');
  expect(JSON.stringify({ price: serializeMoney(new Prisma.Decimal('0')) })).toBe('{"price":"0.00"}');
});

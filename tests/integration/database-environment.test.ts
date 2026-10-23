import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertTestConnection, testDatabaseUrl } from '../../scripts/test-database-guard.js';
import { acquireTestRun } from '../helpers/database-setup.js';
import { createDatabase } from '../../src/lib/database.js';
import { createApp } from '../../src/app.js';
import { parseEnv } from '../../src/config/env.js';

let client: Client;
beforeAll(async () => {
  client = new Client({ connectionString: testDatabaseUrl(process.env), connectionTimeoutMillis: 2000 });
  await client.connect(); await assertTestConnection(client);
});
afterAll(async () => { await client?.end(); });

describe('P10 real database safety and migration gate', () => {
  it('runs on PostgreSQL 18 with the restricted test identity', async () => {
    await expect(assertTestConnection(client)).resolves.toBeUndefined();
    const version = await client.query<{ server_version_num: string }>('SHOW server_version_num');
    expect(Math.floor(Number(version.rows[0]!.server_version_num) / 10000)).toBe(18);
  });
  it('cannot connect to the development database using test credentials', async () => {
    const forbiddenUrl = new URL(testDatabaseUrl(process.env));
    forbiddenUrl.pathname = '/clu_store_dev';
    const forbidden = new Client({ connectionString: forbiddenUrl.toString(), connectionTimeoutMillis: 2000 });
    try { await expect(forbidden.connect()).rejects.toMatchObject({ code: '42501' }); }
    finally { await forbidden.end(); }
  });
  it('has every reviewed migration applied exactly once with matching checksums', async () => {
    const migrations = readdirSync('prisma/migrations', { withFileTypes: true }).filter((entry) => entry.isDirectory());
    const applied = await client.query<{ migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null }>(
      'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name');
    expect(applied.rows.map((row) => row.migration_name)).toEqual(migrations.map((entry) => entry.name).sort());
    for (const migration of migrations) {
      const checksum = createHash('sha256').update(readFileSync(`prisma/migrations/${migration.name}/migration.sql`)).digest('hex');
      expect(applied.rows.find((row) => row.migration_name === migration.name)).toMatchObject({ checksum, finished_at: expect.any(Date), rolled_back_at: null });
    }
  });
  it('refuses a second integration run while the global session lock is held', async () => {
    await expect(acquireTestRun(process.env)).rejects.toThrow('Another integration run owns the test database');
  });
  it('checks real foreign keys, uniqueness, money checks, rollback and readiness using the guarded smoke script', async () => {
    const { stdout } = await promisify(execFile)(process.execPath, ['--import', 'tsx', 'scripts/db-smoke.ts'], {
      env: process.env, timeout: 20000,
    });
    expect(stdout).toMatch(/PostgreSQL 18 migration\/constraint\/role\/readiness smoke passed \(\d+ checks\); synthetic rows rolled back/);
  });
  it('returns ready for a real probe and safely handles a PostgreSQL statement timeout', async () => {
    const database = createDatabase(testDatabaseUrl(process.env), 500);
    const app = createApp(parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', DB_CHECK_TIMEOUT_MS: '500' }), undefined, database.check);
    try {
      const ready = await request(app).get('/ready');
      expect(ready.status).toBe(200);
      expect(ready.body).toEqual({ success: true, data: { status: 'ready', database: 'up' }, meta: null });
    } finally { await database.disconnect(); }
    const slow = new Client({ connectionString: testDatabaseUrl(process.env), connectionTimeoutMillis: 2000, statement_timeout: 25 });
    try {
      await slow.connect(); await assertTestConnection(slow);
      let sqlstate: unknown;
      const timeoutApp = createApp(parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', DB_CHECK_TIMEOUT_MS: '500' }), undefined, async () => {
        try { await slow.query('SELECT pg_sleep(1)'); }
        catch (error) { sqlstate = (error as { code?: string }).code; throw error; }
      });
      const unavailable = await request(timeoutApp).get('/ready');
      expect(sqlstate).toBe('57014');
      expect(unavailable.status).toBe(503);
      expect(unavailable.body).toEqual({ success: false, error: {
        code: 'SERVICE_NOT_READY', message: 'Database is unavailable', details: { database: 'unavailable' },
      } });
      expect((await request(timeoutApp).get('/health')).status).toBe(200);
    } finally { await slow.end(); }
  });
});

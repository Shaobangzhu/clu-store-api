import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { Client } from 'pg';
import { assertTestConnection, testDatabaseUrl } from '../../scripts/test-database-guard.js';

// Session lock spans the whole run, including all fixture cleanup. Independent
// processes cannot race global counts, support fixtures or fault-trigger DDL.
export const testRunLock = [106700, 10] as const;
export async function acquireTestRun(environment: NodeJS.ProcessEnv) {
  const client = new Client({ connectionString: testDatabaseUrl(environment), connectionTimeoutMillis: 2000 });
  try {
    try { await client.connect(); }
    catch { throw new Error('Test PostgreSQL connection unavailable; check the local service and private TEST_DATABASE_URL'); }
    await assertTestConnection(client);
    const result = await client.query<{ acquired: boolean }>('SELECT pg_try_advisory_lock($1, $2) AS acquired', [...testRunLock]);
    if (!result.rows[0]?.acquired) throw new Error('Another integration run owns the test database; wait for it to finish');
    const leftovers = await client.query<{ count: string }>(`SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
      AND (p.proname LIKE 'p07_fault_%' OR p.proname LIKE 'p08_fault_%')`);
    if (leftovers.rows[0]?.count !== '0') throw new Error('Test fault objects remain from an interrupted run; inspect their exact targets before manual cleanup');
    return async () => { await client.end(); }; // Closing releases only this session's locks.
  } catch (error) { await client.end(); throw error; }
}

export default async function setup() {
  // Explicit CI/process environment wins; no .env is required on CI.
  if (existsSync('.env')) loadEnvFile('.env');
  return acquireTestRun(process.env);
}

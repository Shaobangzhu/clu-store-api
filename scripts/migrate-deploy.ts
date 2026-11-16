import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import { migrationTarget, assertMigrationIdentity, identitySql, migrationSchema, type MigrationIdentity } from './migration-target.js';

try {
  const target = migrationTarget(process.env.DATABASE_URL);
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 2000, query_timeout: 2000, statement_timeout: 2000 });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const result = await client.query<MigrationIdentity>(identitySql, [migrationSchema]);
    assertMigrationIdentity(result.rows[0], target);
  } finally {
    await client.end(); // Closing rolls back the read-only transaction.
  }
  console.info('PASS B3 CLU development migration target and restricted owner preflight.');
  const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { stdio: 'pipe' });
  process.exitCode = result.status ?? 1;
  console.info(process.exitCode === 0 ? 'Reviewed migration deploy completed.' : 'Migration deploy failed; output suppressed to protect credentials.');
} catch {
  console.error('Migration refused or failed; verify the B3 CLU development target, role, ownership and history. Private details suppressed.');
  process.exitCode = 1;
}

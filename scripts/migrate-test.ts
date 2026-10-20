import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import { assertTestConnection, testDatabaseUrl } from './test-database-guard.js';

const connectionString = testDatabaseUrl(process.env);
const client = new Client({ connectionString, connectionTimeoutMillis: 2000 });
try {
  await client.connect();
  await assertTestConnection(client);
} finally {
  await client.end();
}
// Only apply reviewed migrations; no reset, drop, or dev/shadow commands here.
const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
  env: { ...process.env, DATABASE_URL: connectionString },
  stdio: 'inherit',
});
process.exitCode = result.status ?? 1;

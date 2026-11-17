import { spawnSync } from 'node:child_process';
import { testDatabaseUrl } from './test-database-guard.js';
import { acquireTestRun } from '../tests/helpers/database-setup.js';

const connectionString = testDatabaseUrl(process.env);
const release = await acquireTestRun(process.env);
try {
  // Only apply reviewed migrations; no reset, drop, or dev/shadow commands here.
  const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: connectionString },
    stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
} finally { await release(); }

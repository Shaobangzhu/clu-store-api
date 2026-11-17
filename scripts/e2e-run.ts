import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { createDatabase } from '../src/lib/database.js';
import { createCatalogDatabase } from '../src/lib/catalog-database.js';
import { createAuthRepository } from '../src/modules/auth/repository.js';
import { createAuthService } from '../src/modules/auth/service.js';
import { acquireTestRun } from '../tests/helpers/database-setup.js';
import { createE2eFixture } from '../tests/helpers/e2e-fixture.js';
import { testDatabaseUrl } from './test-database-guard.js';

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error('Usage: npm run test:e2e:run -- <command> [args...]');
const url = testDatabaseUrl(process.env);
const config = parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent',
  JWT_SECRET: randomBytes(32).toString('hex'), CORS_ORIGINS: process.env.E2E_CORS_ORIGINS ?? 'http://127.0.0.1:5173' });
const release = await acquireTestRun(process.env);
const database = createDatabase(url, 5000);
let fixture: Awaited<ReturnType<typeof createE2eFixture>> | undefined;
let directory: string | undefined;
let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;
try {
  fixture = await createE2eFixture(database.client);
  directory = await mkdtemp(join(tmpdir(), 'clu-e2e-'));
  const manifestPath = join(directory, 'fixture.json');
  const auth = createAuthService(createAuthRepository(database.client), config);
  server = createApp(config, undefined, database.check, {
    auth, catalog: createCatalogDatabase(database.client), cartDatabase: database.client, ordersDatabase: database.client,
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing E2E listen address');
  const baseURL = `http://127.0.0.1:${address.port}`;
  await writeFile(manifestPath, JSON.stringify({ ...fixture.manifest, baseURL }), { mode: 0o600, flag: 'wx' });
  const childEnv: NodeJS.ProcessEnv = { ...process.env, E2E_API_URL: baseURL, E2E_FIXTURE_PATH: manifestPath };
  delete childEnv.DATABASE_URL;
  delete childEnv.TEST_DATABASE_URL;
  delete childEnv.JWT_SECRET;
  const grouped = process.platform !== 'win32';
  const child = spawn(command, args, { stdio: 'inherit', shell: false, detached: grouped, env: childEnv });
  const kill = (signal: NodeJS.Signals) => {
    if (!child.pid) return;
    try { if (grouped) process.kill(-child.pid, signal); else child.kill(signal); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  };
  let deadline: NodeJS.Timeout | undefined;
  const stop = () => {
    kill('SIGTERM');
    deadline ??= setTimeout(() => kill('SIGKILL'), 5000).unref();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    const [code] = await once(child, 'exit');
    process.exitCode = typeof code === 'number' ? code : 1;
  } finally {
    clearTimeout(deadline);
    if (grouped) kill('SIGKILL'); // Do not leave npm/Playwright descendants behind.
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
} finally {
  try {
    if (server) await new Promise<void>((resolve, reject) => {
      server!.close((error) => error ? reject(error) : resolve());
      server!.closeAllConnections();
    });
  } finally {
    try { await fixture?.cleanup(); }
    finally {
      try { await database.disconnect(); }
      finally {
        try { if (directory) await rm(directory, { recursive: true, force: true }); }
        finally { await release(); }
      }
    }
  }
}

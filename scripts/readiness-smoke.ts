import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { createDatabase } from '../src/lib/database.js';
import { testDatabaseUrl } from './test-database-guard.js';

const expected = Number(process.argv[2]);
assert.ok(expected === 200 || expected === 503, 'Specify expected readiness status: 200 or 503');
const config = parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', DB_CHECK_TIMEOUT_MS: '500' });
const db = createDatabase(testDatabaseUrl(process.env), config.DB_CHECK_TIMEOUT_MS);
try {
  const app = createApp(config, undefined, db.check);
  const start = performance.now();
  const result = await request(app).get('/ready');
  assert.equal(result.status, expected);
  assert.ok(performance.now() - start < 3000, 'Readiness exceeded bounded response budget');
  if (expected === 503) assert.equal(result.body.error.code, 'SERVICE_NOT_READY');
  assert.equal((await request(app).get('/health')).status, 200);
  console.log(`Real DB readiness returned ${expected}; liveness returned 200.`);
} finally { await db.disconnect(); }

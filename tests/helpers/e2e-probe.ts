import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { createE2eFixture } from './e2e-fixture.js';

type Manifest = Awaited<ReturnType<typeof createE2eFixture>>['manifest'] & { baseURL: string };
const fixture = JSON.parse(await readFile(process.env.E2E_FIXTURE_PATH!, 'utf8')) as Manifest;
assert.equal(process.env.E2E_API_URL, fixture.baseURL);
assert.equal(process.env.DATABASE_URL, undefined);
assert.equal(process.env.TEST_DATABASE_URL, undefined);
const call = async (path: string, token?: string, body?: unknown, key?: string) => {
  const response = await fetch(`${fixture.baseURL}${path}`, {
    method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
};
assert.equal((await call('/ready')).status, 200);
const tokens: string[] = [];
for (const user of [fixture.users.customer, fixture.users.other, fixture.users.admin]) {
  const login = await call('/api/auth/login', undefined, { identifier: user.email, password: user.password });
  assert.equal(login.status, 200);
  tokens.push(login.body.data.token);
}
assert.equal((await call('/api/admin/orders', tokens[0])).status, 403);
assert.equal((await call('/api/admin/orders', tokens[2])).status, 200);
const order = await call('/api/orders/place', tokens[0], fixture.input, 'e2e-probe');
assert.equal(order.status, 201);
assert.equal(order.body.data.totalAmount, fixture.expectedUnitPrice);
const replay = await call('/api/orders/place', tokens[0], fixture.input, 'e2e-probe');
assert.equal(replay.body.data.id, order.body.data.id);
assert.equal((await call(`/api/orders/${order.body.data.id}`, tokens[1])).status, 404);
console.log('Isolated E2E runner smoke passed');

import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { createDatabase } from '../../src/lib/database.js';
import { testDatabaseUrl } from '../../scripts/test-database-guard.js';
import { createE2eFixture } from '../helpers/e2e-fixture.js';
import { createApp } from '../../src/app.js';
import { parseEnv } from '../../src/config/env.js';
import { createAuthService } from '../../src/modules/auth/service.js';
import { createAuthRepository } from '../../src/modules/auth/repository.js';

let database: ReturnType<typeof createDatabase>;
beforeAll(() => { database = createDatabase(testDatabaseUrl(process.env), 5000); });
afterAll(async () => { await database?.disconnect(); });

it('repeats browser fixtures, authenticates real roles, and cleans only allocated rows', async () => {
  const counts = () => Promise.all([database.client.user.count(), database.client.product.count(), database.client.category.count(),
    database.client.order.count(), database.client.orderItem.count(), database.client.orderStatusHistory.count(), database.client.cart.count()]);
  const baseline = await counts();
  const config = parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET: randomBytes(32).toString('hex') });
  const app = createApp(config, undefined, database.check, {
    auth: createAuthService(createAuthRepository(database.client), config), cartDatabase: database.client, ordersDatabase: database.client,
  });
  for (let run = 0; run < 2; run++) {
    const fixture = await createE2eFixture(database.client);
    try {
      const { users, input } = fixture.manifest;
      expect(fixture.manifest.expectedUnitPrice).toBe('10.10');
      const login = async (user: typeof users.customer) => {
        const result = await request(app).post('/api/auth/login').send({ identifier: user.email, password: user.password });
        expect(result.status).toBe(200);
        return result.body.data.token as string;
      };
      const customer = await login(users.customer);
      const admin = await login(users.admin);
      expect((await request(app).get('/api/admin/orders').auth(customer, { type: 'bearer' })).status).toBe(403);
      expect((await request(app).get('/api/admin/orders').auth(admin, { type: 'bearer' })).status).toBe(200);
      const order = await request(app).post('/api/orders/place').auth(customer, { type: 'bearer' })
        .set('Idempotency-Key', `e2e-repeat-${run}`).send(input);
      expect(order.status).toBe(201);
      expect(order.body.data.totalAmount).toBe('10.10');
    } finally { await fixture.cleanup(); }
    await fixture.cleanup(); // Teardown is repeatable too.
    expect(await counts()).toEqual(baseline);
  }
});

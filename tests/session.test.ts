import { randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { createAuthService } from '../src/modules/auth/service.js';
import type { AuthRepository } from '../src/modules/auth/repository.js';
import { createTokens } from '../src/modules/auth/token.js';
import { exampleUser } from '../src/contracts/examples.js';
import { updateItemRequest } from '../src/modules/cart/schemas.js';

const config = parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET: randomBytes(32).toString('hex') });
function setup() {
  const findSafeById = vi.fn().mockResolvedValue({ ...exampleUser, createdAt: new Date(exampleUser.createdAt), passwordHash: 'never-expose' });
  const repository: AuthRepository = { findSafeById, create: vi.fn(), findCredentials: vi.fn() };
  const auth = createAuthService(repository, config);
  return { app: createApp({ ...config, AUTH_RATE_LIMIT_MAX: 1 }, undefined, undefined, { auth }), findSafeById };
}
describe('session recovery', () => {
  it('returns only the safe current user, observes changes/deletion and bypasses credential budgets', async () => {
    const { app, findSafeById } = setup();
    const { token } = await createTokens(config).issue(exampleUser.id);
    const me = () => request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect((await request(app).post('/api/auth/login').send({})).status).toBe(400);
    for (let i = 0; i < 3; i++) {
      const response = await me();
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: exampleUser, meta: null });
      expect(response.headers['cache-control']).toBe('no-store');
    }
    expect((await request(app).post('/api/auth/register').send({})).status).toBe(429);
    findSafeById.mockResolvedValueOnce({ ...exampleUser, role: 'ADMIN', createdAt: new Date(exampleUser.createdAt) });
    expect((await me()).body.data.role).toBe('ADMIN');
    findSafeById.mockResolvedValueOnce(null);
    expect((await me()).status).toBe(401);
    expect((await me().query({ userId: exampleUser.id })).status).toBe(400);
  });
  it('rejects malformed, expired and wrongly signed JWTs before querying users', async () => {
    const { app, findSafeById } = setup();
    const now = Math.floor(Date.now() / 1000);
    for (const kind of ['missing', 'malformed', 'expired', 'signature']) {
      const token = await new SignJWT({}).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(exampleUser.id).setIssuer(config.JWT_ISSUER).setAudience(config.JWT_AUDIENCE)
        .setIssuedAt(kind === 'expired' ? now - 1000 : now).setExpirationTime(kind === 'expired' ? now - 100 : now + 900)
        .sign(kind === 'signature' ? randomBytes(32) : Buffer.from(config.JWT_SECRET!, 'hex'));
      const req = request(app).get('/api/auth/me');
      if (kind !== 'missing') req.set('Authorization', kind === 'malformed' ? 'Bearer bad' : `Bearer ${token}`);
      const response = await req;
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.headers['www-authenticate']).toBe('Bearer');
    }
    expect(findSafeById).not.toHaveBeenCalled();
  });
  it('fails closed when authentication is unavailable', async () => {
    expect((await request(createApp(config)).get('/api/auth/me')).status).toBe(503);
  });
});
describe('absolute quantity schema', () => {
  it('accepts an absolute integer and rejects coercion and client authority fields', () => {
    const input = { params: { id: '12' }, query: {}, body: { qty: 2 } };
    expect(updateItemRequest.parse(input).body).toEqual({ qty: 2 });
    for (const body of [{ qty: '2' }, { qty: 0 }, { qty: 1.5 }, { qty: 2, price: 1 }, { qty: 2, modelId: 1 }]) {
      expect(updateItemRequest.safeParse({ ...input, body }).success).toBe(false);
    }
  });
});

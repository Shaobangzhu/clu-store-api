import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import express from 'express';
import request from 'supertest';
import { Client } from 'pg';
import { SignJWT, decodeJwt } from 'jose';
import { verify as verifyHash } from 'argon2';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createApp } from '../../src/app.js';
import { parseEnv } from '../../src/config/env.js';
import { createDatabase } from '../../src/lib/database.js';
import { createLogger } from '../../src/lib/logger.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { envelope } from '../../src/middleware/envelope.js';
import { requestId } from '../../src/middleware/request-id.js';
import { requireAuth, requireRole } from '../../src/middleware/auth.js';
import { createAuthRepository } from '../../src/modules/auth/repository.js';
import { createAuthService } from '../../src/modules/auth/service.js';
import { initializePasswordHashing } from '../../src/modules/auth/password.js';
import { testDatabaseUrl, assertTestConnection } from '../../scripts/test-database-guard.js';

const config = parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET: randomBytes(32).toString('hex') });
const password = randomBytes(24).toString('base64url');
const prefix = `p05_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const names = new Set<string>();
let database: ReturnType<typeof createDatabase>;
let service: ReturnType<typeof createAuthService>;
let initialCount: number;
let connectionString: string;
let baseline: { id: string; username: string; email: string };
let baselineToken: string;

function identity() {
  const username = `${prefix}_${names.size}`;
  names.add(username);
  return { username, email: `${username}@example.test`, password, confirmPassword: password };
}
function app() { return createApp(config, undefined, database.check, { auth: service }); }
function guardedApp() {
  // Test-only routes exercise reusable guards without introducing business endpoints.
  const app = express();
  app.use(requestId, envelope);
  app.get('/private', requireAuth(service), (_req, res) => res.locals.success(res.locals.user));
  app.get('/admin', requireAuth(service), requireRole('ADMIN'), (_req, res) => res.locals.success(res.locals.user));
  app.get('/guard-without-auth', requireRole('ADMIN'), (_req, res) => res.locals.success(null));
  app.use(errorHandler(createLogger(config)));
  return app;
}
beforeAll(async () => {
  connectionString = testDatabaseUrl(process.env);
  const guard = new Client({ connectionString, connectionTimeoutMillis: 2000 });
  try { await guard.connect(); await assertTestConnection(guard); } finally { await guard.end(); }
  database = createDatabase(connectionString, 5000);
  initialCount = await database.client.user.count();
  service = createAuthService(createAuthRepository(database.client), config);
  await initializePasswordHashing();
  const input = identity();
  baseline = await service.register({ ...input, deprecatedConfirmation: false });
  baselineToken = (await service.login({ identifier: input.username, password, deprecatedUsername: false })).token;
});
afterAll(async () => {
  if (!database) return;
  try {
    // Only exact identities allocated by this run; never reset/truncate shared tables.
    await database.client.user.deleteMany({ where: { username: { in: [...names] } } });
    expect(await database.client.user.count()).toBe(initialCount);
  } finally { await database.disconnect(); }
});
function expectNoSecrets(text: string) {
  expect(text).not.toContain(password);
  expect(text).not.toMatch(/passwordHash|\$argon2/);
  expect(text).not.toContain(config.JWT_SECRET);
}

describe('P05 authentication with real PostgreSQL', () => {
  it('registers normalized identities, persists Argon2id, and returns only safe user fields', async () => {
    const input = identity();
    const response = await request(app()).post('/api/auth/register').send({ ...input,
      username: ` ${input.username.toUpperCase()} `, email: ` ${input.email.toUpperCase()} ` });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ success: true, data: { username: input.username, email: input.email, role: 'USER' }, meta: null });
    expect(Object.keys(response.body.data).sort()).toEqual(['createdAt', 'email', 'id', 'role', 'username']);
    expect(response.body.data.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers['cache-control']).toBe('no-store');
    expectNoSecrets(response.text);
    const row = await database.client.user.findUniqueOrThrow({ where: { id: response.body.data.id } });
    const [, algorithm, version, parameters] = row.passwordHash.split('$');
    expect(algorithm).toBe('argon2id');
    expect(version).toBe('v=19');
    expect(parameters?.split(',').sort()).toEqual(['m=65536', 'p=1', 't=3']);
    expect(await verifyHash(row.passwordHash, password)).toBe(true);
    expect(row.passwordHash).not.toBe(password);
  });
  it('marks the legacy ConfirmPassword and username aliases deprecated', async () => {
    const { confirmPassword, ...input } = identity();
    const response = await request(app()).post('/api/auth/register').send({ ...input, ConfirmPassword: confirmPassword });
    expect(response.status).toBe(201);
    expect(response.body.meta).toEqual({ deprecatedFields: ['ConfirmPassword'] });
    const login = await request(app()).post('/api/auth/login').send({ username: input.username, password });
    expect(login.status).toBe(200);
    expect(login.body.meta).toEqual({ deprecatedFields: ['username'] });
    expectNoSecrets(login.text);
  });
  it.each(['username', 'email'] as const)('rejects duplicate %s including case/space variants with the same generic conflict', async (field) => {
    const input = identity();
    const first = await request(app()).post('/api/auth/register').send(input);
    expect(first.status).toBe(201);
    for (const value of [input[field], ` ${input[field].toUpperCase()} `]) {
      const duplicate = { ...identity(), [field]: value };
      const response = await request(app()).post('/api/auth/register').send(duplicate);
      expect(response.status).toBe(409);
      expect(response.body.error).toEqual({ code: 'ACCOUNT_CONFLICT', message: 'Unable to register with those account details', details: null });
      expectNoSecrets(response.text);
    }
  });
  it('relies on DB uniqueness under concurrent registration rather than a pre-check', async () => {
    const input = identity();
    const responses = await Promise.all([
      request(app()).post('/api/auth/register').send(input),
      request(app()).post('/api/auth/register').send({ ...input, username: input.username.toUpperCase(), email: input.email.toUpperCase() }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await database.client.user.count({ where: { username: input.username } })).toBe(1);
  });
  it.each([
    ['missing email', { email: undefined }], ['invalid email', { email: 'invalid' }],
    ['Unicode email', { email: 'test@例子.test' }], ['Unicode username', { username: '测试用户' }],
    ['weak password', { password: 'short', confirmPassword: 'short' }],
    ['repeated password', { password: 'a'.repeat(20), confirmPassword: 'a'.repeat(20) }],
    ['common password', { password: 'password123456789', confirmPassword: 'password123456789' }],
    ['long password', { password: 'a'.repeat(129), confirmPassword: 'a'.repeat(129) }],
    ['invalid confirmation', { confirmPassword: 'different' }], ['missing confirmation', { confirmPassword: undefined }],
    ['ambiguous confirmation', { ConfirmPassword: password }], ['client role', { role: 'ADMIN' }],
  ])('rejects %s without creating a user or reflecting credentials', async (_label, changes) => {
    const input = identity();
    const response = await request(app()).post('/api/auth/register').send({ ...input, ...changes });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await database.client.user.findUnique({ where: { username: input.username } })).toBeNull();
    expectNoSecrets(response.text);
  });
  it('preserves password spaces exactly instead of trimming before hashing or verification', async () => {
    const input = { ...identity(), password: ` ${password} `, confirmPassword: ` ${password} ` };
    expect((await request(app()).post('/api/auth/register').send(input)).status).toBe(201);
    expect((await request(app()).post('/api/auth/login').send({ identifier: input.username, password })).status).toBe(401);
    expect((await request(app()).post('/api/auth/login').send({ identifier: input.username, password: input.password })).status).toBe(200);
  });
  it.each(['username', 'email'] as const)('logs in by normalized %s and issues bounded JWT metadata without role/hash claims', async (field) => {
    const response = await request(app()).post('/api/auth/login').send({ identifier: ` ${baseline[field].toUpperCase()} `, password });
    expect(response.status).toBe(200);
    const data = response.body.data;
    expect(data.user).toMatchObject({ id: baseline.id, role: 'USER' });
    expect(data.tokenType).toBe('Bearer');
    expect(data.expiresIn).toBe(900);
    expect(data.expiresAt).toBe(new Date(decodeJwt(data.token).exp! * 1000).toISOString());
    const claims = decodeJwt(data.token);
    expect(claims).toMatchObject({ sub: baseline.id, iss: config.JWT_ISSUER, aud: config.JWT_AUDIENCE });
    expect(claims.exp! - claims.iat!).toBe(900);
    expect(claims).not.toHaveProperty('role');
    expect(claims).not.toHaveProperty('email');
    expectNoSecrets(response.text);
  });
  it('returns indistinguishable messages/status/envelopes for absent user and wrong password', async () => {
    const absent = await request(app()).post('/api/auth/login').send({ identifier: `${prefix}_absent`, password });
    const wrong = await request(app()).post('/api/auth/login').send({ identifier: baseline.username, password: 'incorrect' });
    expect(absent.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(absent.body).toEqual(wrong.body);
    expect(absent.body.error).toEqual({ code: 'UNAUTHORIZED', message: 'Authentication failed', details: null });
    expect(absent.headers['www-authenticate']).toBe('Bearer');
    expectNoSecrets(absent.text);
    expectNoSecrets(wrong.text);
  });
  it('rejects ambiguous login identifiers and unknown fields', async () => {
    for (const body of [{ password }, { identifier: baseline.username, username: baseline.username, password },
      { identifier: baseline.username, password, role: 'ADMIN' }]) {
      expect((await request(app()).post('/api/auth/login').send(body)).status).toBe(400);
    }
  });
  it('authenticates a valid token, denies USER, and observes promotion/demotion immediately', async () => {
    const input = identity();
    const user = await service.register({ ...input, deprecatedConfirmation: false });
    const { token } = await service.login({ identifier: input.username, password, deprecatedUsername: false });
    const guarded = guardedApp();
    const get = (path: string) => request(guarded).get(path).set('Authorization', `Bearer ${token}`);
    const safe = await get('/private');
    expect(safe.status).toBe(200);
    expectNoSecrets(safe.text);
    expect((await get('/admin')).status).toBe(403);
    await database.client.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
    expect((await get('/admin')).status).toBe(200);
    await database.client.user.update({ where: { id: user.id }, data: { role: 'USER' } });
    expect((await get('/admin')).status).toBe(403);
    await database.client.user.delete({ where: { id: user.id } });
    expect((await get('/private')).status).toBe(401);
    expect((await request(guarded).get('/guard-without-auth')).status).toBe(401);
  });
  it.each([undefined, 'Basic abc', 'Bearer bad', 'Bearer a.b.c', 'Bearer a.b.c trailing', 'Bearer ' + 'a'.repeat(4096)])('rejects absent/malformed authorization %s', async (authorization) => {
    const req = request(guardedApp()).get('/private');
    if (authorization) req.set('Authorization', authorization);
    const response = await req;
    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Authentication failed');
  });
  it.each(['expired', 'issuer', 'audience', 'signature', 'algorithm', 'subject', 'missing-exp', 'future-iat', 'long-ttl', 'typ', 'none'])('rejects JWT with invalid %s', async (kind) => {
    const now = Math.floor(Date.now() / 1000);
    const claims: Record<string, unknown> = { sub: baseline.id, iss: config.JWT_ISSUER, aud: config.JWT_AUDIENCE, iat: now, exp: now + 900, role: 'ADMIN' };
    if (kind === 'expired') { claims.iat = now - 1000; claims.exp = now - 100; }
    if (kind === 'issuer') claims.iss = 'wrong';
    if (kind === 'audience') claims.aud = 'wrong';
    if (kind === 'subject') claims.sub = 'not-a-uuid';
    if (kind === 'missing-exp') delete claims.exp;
    if (kind === 'future-iat') claims.iat = now + 60;
    if (kind === 'long-ttl') claims.exp = now + 3601;
    const token = kind === 'none' ? `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.`
      : await new SignJWT(claims).setProtectedHeader({ alg: kind === 'algorithm' ? 'HS384' : 'HS256', typ: kind === 'typ' ? 'other' : 'JWT' })
        .sign(kind === 'signature' ? randomBytes(32) : Buffer.from(config.JWT_SECRET!, 'hex'));
    const response = await request(guardedApp()).get('/private').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Authentication failed');
    expect(response.text).not.toContain(token);
  });
  it('ignores an ADMIN claim even on a valid signed token and loads the actual USER role', async () => {
    const token = await new SignJWT({ role: 'ADMIN' }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(baseline.id).setIssuer(config.JWT_ISSUER).setAudience(config.JWT_AUDIENCE)
      .setIssuedAt().setExpirationTime('15m').sign(Buffer.from(config.JWT_SECRET!, 'hex'));
    const response = await request(guardedApp()).get('/admin').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
    expect((await request(guardedApp()).get('/private').set('Authorization', `Bearer ${baselineToken}`)).status).toBe(200);
  });
  it('enforces a shared auth IP budget across aliases/routes and returns a generic 429', async () => {
    const limited = createApp({ ...config, AUTH_RATE_LIMIT_MAX: 2 }, undefined, database.check, { auth: service });
    expect((await request(limited).post('/api/auth/login').send({})).status).toBe(400);
    expect((await request(limited).post('/api/auth/register').send({})).status).toBe(400);
    const response = await request(limited).post('/api/auth/login').send({ identifier: baseline.username, password });
    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
    expect(response.headers['retry-after']).toBeDefined();
    expectNoSecrets(response.text);
  });
  it('counts normalized identifier attempts across login aliases, independent of IP budget', async () => {
    const limited = createApp({ ...config, AUTH_IDENTIFIER_RATE_LIMIT_MAX: 2 }, undefined, database.check, { auth: service });
    expect((await request(limited).post('/api/auth/login').send({ identifier: baseline.username.toUpperCase(), password: 'wrong' })).status).toBe(401);
    expect((await request(limited).post('/api/auth/login').send({ username: ` ${baseline.username} `, password: 'wrong' })).status).toBe(401);
    expect((await request(limited).post('/api/auth/login').send({ identifier: baseline.username, password })).status).toBe(429);
  });
  it('provisions ADMIN only through explicit create-only CLI stdin, refusing duplicates and wrong database confirmation', async () => {
    const input = identity();
    function cli(confirm: string) {
      return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/create-admin.ts'], {
          env: { ...process.env, DATABASE_URL: connectionString, ADMIN_DATABASE_NAME: confirm }, stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = ''; let stderr = '';
        child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
        child.on('error', reject);
        child.on('close', (code) => resolve({ code, stdout, stderr }));
        child.stdin.end(JSON.stringify(input));
      });
    }
    expect((await cli('wrong_database')).code).toBe(1);
    expect(await database.client.user.findUnique({ where: { username: input.username } })).toBeNull();
    const created = await cli('clu_store_test');
    expect(created.code, created.stderr).toBe(0);
    expect(JSON.parse(created.stdout).user.role).toBe('ADMIN');
    expectNoSecrets(created.stdout + created.stderr);
    const duplicate = await cli('clu_store_test');
    expect(duplicate.code).toBe(1);
    expect(duplicate.stderr).toContain('ACCOUNT_CONFLICT');
    expectNoSecrets(duplicate.stdout + duplicate.stderr);
    const login = await request(app()).post('/api/auth/login').send({ identifier: input.username, password });
    expect(login.status).toBe(200);
    expect((await request(guardedApp()).get('/admin').set('Authorization', `Bearer ${login.body.data.token}`)).status).toBe(200);
  });
});

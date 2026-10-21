import { randomBytes } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { createLogger } from '../src/lib/logger.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { envelope } from '../src/middleware/envelope.js';
import { withPasswordSlot } from '../src/modules/auth/password.js';

const secret = randomBytes(32).toString('hex');
const config = parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET: secret });

describe('authentication configuration and exposure controls', () => {
  it('requires a strong environment secret in production, bounds TTL and hides invalid values', () => {
    expect(() => parseEnv({ NODE_ENV: 'production' })).toThrow('JWT_SECRET');
    for (const JWT_SECRET of ['weak-secret', '0'.repeat(64), 'not-hex'.repeat(10)]) {
      try { parseEnv({ JWT_SECRET }); throw new Error('Accepted invalid key'); }
      catch (error) { expect((error as Error).message).toBe('Invalid environment configuration: JWT_SECRET'); }
    }
    for (const JWT_TTL_SECONDS of ['0', '59', '3601', 'Infinity']) {
      expect(() => parseEnv({ JWT_SECRET: secret, JWT_TTL_SECONDS })).toThrow('JWT_TTL_SECONDS');
    }
    expect(() => parseEnv({ JWT_ISSUER: ' ' })).toThrow('JWT_ISSUER');
    expect(() => parseEnv({ JWT_AUDIENCE: '' })).toThrow('JWT_AUDIENCE');
    expect(() => parseEnv({ AUTH_RATE_LIMIT_MAX: '21' })).toThrow('AUTH_RATE_LIMIT_MAX');
    expect(parseEnv({ NODE_ENV: 'production', JWT_SECRET: secret }).JWT_TTL_SECONDS).toBe(900);
  });
  it('fails closed without an auth dependency while keeping liveness available', async () => {
    const app = createApp(config);
    const response = await request(app).post('/api/auth/login').send({ identifier: 'someone', password: 'private' });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SERVICE_NOT_READY');
    expect(response.headers['cache-control']).toBe('no-store');
    expect((await request(app).get('/health')).status).toBe(200);
    expect((await request(app).get('/api/auth/unknown')).status).toBe(404);
  });
  it('counts malformed JSON toward auth rate limits before parsing', async () => {
    const app = createApp({ ...config, AUTH_RATE_LIMIT_MAX: 1 });
    expect((await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{')).status).toBe(400);
    const response = await request(app).post('/api/auth/register').set('Content-Type', 'application/json').send('{');
    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('redacts passwords, hashes, aliases, tokens, identities, credentials and entire headers/bodies', () => {
    const lines: string[] = [];
    const value = 'private-marker-never-log';
    const logger = createLogger({ ...config, LOG_LEVEL: 'info' }, { write: (line) => { lines.push(line); } });
    logger.info({ password: value, passwordHash: value, ConfirmPassword: value, confirmPassword: value,
      token: value, accessToken: value, JWT_SECRET: value, ADMIN_PASSWORD: value,
      username: value, email: value, identifier: value, authorization: value, cookie: value,
      headers: { Authorization: value }, body: { nested: { password: value } }, credentials: { value },
      req: { headers: { authorization: value, cookie: value, arbitrary: value }, body: { password: value } },
      res: { headers: { 'set-cookie': value } }, user: { passwordHash: value, email: value, username: value },
    }, 'Sanitized event');
    expect(lines.join('')).toContain('[REDACTED]');
    expect(lines.join('')).not.toContain(value);
  });
  it('does not log or return raw exception text, request secrets, SQL or authorization headers', async () => {
    const lines: string[] = [];
    const marker = 'private-db-password-or-token';
    const logger = createLogger({ ...config, LOG_LEVEL: 'info' }, { write: (line) => { lines.push(line); } });
    const app = express();
    app.use(envelope, express.json());
    app.post('/failure', () => { throw new Error(marker); });
    app.use(errorHandler(logger));
    const response = await request(app).post('/failure').set('Authorization', `Bearer ${marker}`).send({ password: marker });
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(lines.join('')).toContain('INTERNAL_ERROR');
    expect(lines.join('') + response.text).not.toContain(marker);
  });
  it('bounds concurrent password work and releases capacity after failures', async () => {
    const releases: (() => void)[] = [];
    const work = Array.from({ length: 4 }, () => withPasswordSlot(() => new Promise<void>((resolve) => releases.push(resolve))));
    await expect(withPasswordSlot(async () => true)).rejects.toMatchObject({ status: 503, code: 'SERVICE_NOT_READY' });
    releases.forEach((release) => release());
    await Promise.all(work);
    await expect(withPasswordSlot(async () => { throw new Error('controlled failure'); })).rejects.toThrow('controlled failure');
    await expect(withPasswordSlot(async () => true)).resolves.toBe(true);
  });
});

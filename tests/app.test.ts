import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { createLogger } from '../src/lib/logger.js';
import { envelope } from '../src/middleware/envelope.js';
import { requestId } from '../src/middleware/request-id.js';
import { validate } from '../src/middleware/validate.js';
import { errorHandler } from '../src/middleware/error-handler.js';

const config = parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', CORS_ORIGINS: 'http://localhost:5173' });

function validationApp() {
  // A test-only route exercises reusable middleware, never mounted in the API.
  const app = express();
  app.use(requestId, envelope, express.json());
  const schema = z.object({
    params: z.object({ id: z.coerce.number().int().positive() }),
    query: z.object({ page: z.coerce.number().int().positive() }),
    body: z.object({ name: z.string().min(1) }),
  });
  app.post('/validation/:id', validate(schema), (_req, res) => {
    res.locals.success(res.locals.validated);
  });
  app.get('/crash', async () => { throw new Error('secret database password'); });
  app.delete('/empty', (_req, res) => res.locals.success(null, 204));
  app.use(errorHandler(createLogger(config)));
  return app;
}

describe('HTTP foundation', () => {
  it('returns the liveness envelope and a server-generated request ID', async () => {
    const res = await request(createApp(config)).get('/health').set('X-Request-Id', 'caller-value');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { status: 'ok' }, meta: null });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('reports the missing DB readiness dependency with 503', async () => {
    const res = await request(createApp(config)).get('/ready');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success: false, error: {
      code: 'SERVICE_NOT_READY', details: { database: 'not_configured' },
    } });
  });

  it('returns a stable 404 envelope for unimplemented business routes', async () => {
    const res = await request(createApp(config)).get('/api/not-a-route');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: {
      code: 'NOT_FOUND', message: 'Route not found', details: null,
    } });
  });

  it('normalizes malformed JSON without reflecting the input', async () => {
    const res = await request(createApp(config)).post('/health')
      .set('Content-Type', 'application/json').send('{"password":"secret",');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MALFORMED_JSON');
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });

  it('enforces the configured JSON size cap', async () => {
    const res = await request(createApp({ ...config, JSON_BODY_LIMIT_BYTES: 16 }))
      .post('/health').send({ name: 'x'.repeat(64) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('allows only configured browser origins', async () => {
    const app = createApp(config);
    const allowed = await request(app).get('/health').set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const denied = await request(app).get('/health').set('Origin', 'https://untrusted.example');
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('CORS_ORIGIN_DENIED');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('uses an error envelope when the rate limit is reached', async () => {
    const app = createApp({ ...config, RATE_LIMIT_MAX: 1 });
    expect((await request(app).get('/health')).status).toBe(200);
    const res = await request(app).get('/health');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toBeDefined();
  });

  it.each([
    ['/validation/not-a-number?page=1', { name: 'valid' }, 'params'],
    ['/validation/1?page=no', { name: 'valid' }, 'query'],
    ['/validation/1?page=1', { name: '' }, 'body'],
  ])('rejects invalid request %s', async (path, body, source) => {
    const res = await request(validationApp()).post(path).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].path[0]).toBe(source);
  });

  it('preserves parsed path/query/body values for handlers', async () => {
    const res = await request(validationApp()).post('/validation/2?page=3').send({ name: 'ok' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ params: { id: 2 }, query: { page: 3 }, body: { name: 'ok' } });
  });

  it('handles async exceptions without leaking messages or stacks', async () => {
    const res = await request(validationApp()).get('/crash');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: {
      code: 'INTERNAL_ERROR', message: 'Internal server error', details: null,
    } });
  });

  it('keeps 204 responses bodyless', async () => {
    const res = await request(validationApp()).delete('/empty');
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
  });
});

describe('environment validation', () => {
  it('rejects invalid ports and wildcard CORS configuration', () => {
    expect(() => parseEnv({ PORT: '0' })).toThrow('PORT');
    expect(() => parseEnv({ CORS_ORIGINS: '*' })).toThrow('CORS_ORIGINS');
    expect(() => parseEnv({ CORS_ORIGINS: 'https://example.com/path' })).toThrow('CORS_ORIGINS');
  });
});

it('reports a configured public read route as unavailable when no database is injected', async () => {
  const res = await request(createApp(config)).get('/api/products');
  expect(res.status).toBe(503);
  expect(res.body.error.code).toBe('SERVICE_NOT_READY');
});
it('serves only the reviewed local placeholder asset', async () => {
  const app = createApp(config);
  const asset = await request(app).get('/media/demo-placeholder.svg');
  expect(asset.status).toBe(200);
  expect(asset.headers['content-type']).toContain('image/svg+xml');
  expect((await request(app).get('/media/.env')).status).toBe(404);
});

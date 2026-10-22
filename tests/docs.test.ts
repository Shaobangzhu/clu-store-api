import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { createAuthService } from '../src/modules/auth/service.js';
import { operations, operationPaths, type ApiOperation } from '../src/contracts/api.js';
import { exampleCart, examplePlacement } from '../src/contracts/examples.js';
import { buildOpenApi } from '../src/documentation/openapi.js';
import { buildPostman, inlineSchema } from '../src/documentation/postman.js';
import { artifactPaths, generate } from '../scripts/generate-docs.js';
import { historicalRoutes, postmanItems, validateDocumentation, type PostmanItem } from '../scripts/docs-validation.js';
import { assertArtifactSafe } from '../scripts/docs-safety.js';

const spec = buildOpenApi();
const collection = buildPostman(spec);
const config = parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET: randomBytes(32).toString('hex') });

describe('generated documentation contract', () => {
  it('is reproducible from the current runtime/Zod definitions', async () => {
    expect(await generate(true)).toMatchObject({ artifacts: 3, sensitiveScan: 'passed' });
    for (const path of artifactPaths.slice(0, 2)) expect(() => JSON.parse(readFileSync(path, 'utf8'))).not.toThrow();
  });
  it('validates OpenAPI 3.1, official Postman v2.1, 17 historical routes, examples and security', async () => {
    expect(await validateDocumentation(spec, collection)).toMatchObject({ openapi: '3.1.0', historicalRoutes: 17, uniqueOperations: 30,
      postmanRequests: 30, securityDeclarations: 'passed', monetaryStrings: 'passed', postmanV21: 'passed', embeddedTokens: 0, blockedValues: 0 });
    for (const legacy of historicalRoutes) {
      const [method, path] = legacy.split(' ');
      expect(spec.paths[path!]?.[method as 'get' | 'post' | 'delete']).toBeDefined();
    }
  }, 20000);
  it('preserves all five case-accurate cart aliases with matching schemas and security', () => {
    for (const source of Object.values(operations)) {
      if (source.group !== 'cart') continue;
      const [canonical, legacy] = operationPaths(source).map((p) => p.replace(/:([A-Za-z]+)/g, '{$1}'));
      const first = spec.paths[canonical!]![source.method]!;
      const second = spec.paths[legacy!]![source.method]!;
      expect(second.responses).toEqual(first.responses);
      expect(second.security).toEqual(first.security);
      expect(second['x-canonical-path']).toBe(canonical);
    }
  });
  it('documents bodyless deletes and exact create/merge/replay/transition outcomes', () => {
    expect(Object.keys(operations.addCartItem.responses)).toEqual(['200', '201']);
    expect(Object.keys(operations.place.responses)).toEqual(['200', '201']);
    expect(spec.paths['/api/orders/{id}/approve']!.post!.responses['409']!.description).toContain('ORDER_INVALID_TRANSITION');
    expect(spec.paths['/api/orders/place']!.post!.responses['422']!.description).toContain('EMPTY_CART');
    expect(spec.paths['/api/orders/place']!.post!.responses['503']!.description).toContain('CHECKOUT_BUSY');
    expect(spec.paths['/api/shopping-cart/items']!.delete!.responses['204']!.content).toBeUndefined();
  });
  it('exports input-side transformations, deprecated compatibility fields and runtime refinements', () => {
    const body = inlineSchema(spec.paths['/api/auth/register']!.post!.requestBody!.content['application/json']!.schema, spec);
    expect(body.properties?.ConfirmPassword).toMatchObject({ deprecated: true });
    expect(body.required).toContain('email'); expect(body.oneOf).toHaveLength(2);
    const cart = inlineSchema(spec.paths['/api/shopping-cart/items']!.post!.requestBody!.content['application/json']!.schema, spec);
    for (const field of ['name', 'imageSrc', 'model', 'modelPrice', 'memorySize', 'memorySizePrice']) expect(cart.properties?.[field]).toMatchObject({ deprecated: true });
    expect(spec.info.description).toContain('refinements');
    expect(spec.paths['/api/orders/place']!.post!.description).toContain('BEFORE');
    expect(spec.paths['/api/orders/place']!.post!.parameters?.find((p) => p.name === 'Idempotency-Key')).toMatchObject({ required: false, in: 'header' });
  });
  it('keeps money strings and semantically correct model-plus-memory examples', () => {
    const item = exampleCart.items[0]!;
    expect(item.model.price).toBe('100.00'); expect(item.memorySize.price).toBe('20.00');
    expect(item.unitPrice).toBe('120.00'); expect(item.lineTotal).toBe('240.00');
    expect(examplePlacement.totalAmount).toBe(exampleCart.totalAmount);
    expect(spec.components.schemas.Money?.type).toBe('string');
    expect(spec['x-order-state-machine']).toMatchObject({ initial: 'pending', terminal: ['approved', 'rejected'] });
  });
  it('keeps product page pagination and order keyset pagination distinct', () => {
    const products = spec.paths['/api/products']!.get!.parameters!.map((p) => p.name);
    const orders = spec.paths['/api/orders']!.get!.parameters!.map((p) => p.name);
    expect(products).toEqual(['keyword', 'category', 'page', 'pageSize', 'sort']);
    expect(orders).toEqual(['pageSize', 'sort', 'cursor']);
    expect(spec.paths['/api/orders']!.get!.parameters!.find((p) => p.name === 'sort')!.schema.enum).toEqual(['newest', 'oldest']);
  });
  it('rejects security drift, even when the document is otherwise valid OpenAPI', async () => {
    const unsafe = structuredClone(spec);
    unsafe.paths['/api/orders/{id}/approve']!.post!.security = [];
    await expect(validateDocumentation(unsafe, collection)).rejects.toThrow();
  }, 20000);
  it('rejects duplicate collection requests and missing legacy coverage', async () => {
    const duplicate = structuredClone(collection) as unknown as { item: { name: string; item: PostmanItem[] }[] };
    duplicate.item[0]!.item.push(duplicate.item[0]!.item[0]!);
    await expect(validateDocumentation(spec, duplicate)).rejects.toThrow('Duplicate Postman');
    const missing = structuredClone(spec);
    delete missing.paths['/api/ShoppingCart'];
    await expect(validateDocumentation(missing, collection)).rejects.toThrow('Missing historical');
  }, 20000);
  it('has empty exported credentials/base URL, variable-only bearer auth and no capture/network scripts', () => {
    expect(collection.variable.find((v) => v.key === 'accessToken')!.value).toBe('');
    expect(collection.variable.find((v) => v.key === 'baseUrl')!.value).toBe('');
    for (const item of postmanItems(collection)) {
      expect(item.request.url.raw.startsWith('{{baseUrl}}/')).toBe(true);
      if (item.request.auth.type === 'bearer') expect(item.request.auth.bearer?.[0]?.value).toBe('{{accessToken}}');
      expect(item.event?.[0]?.listen).toBe('test');
      expect(item.event?.[0]?.script.exec.join('\n')).not.toMatch(/pm\.sendRequest|\.set\(|fetch\(|console\./);
    }
  });
});

describe('documentation HTTP routes', () => {
  it('serves local Swagger UI and the same raw spec with scoped CSP and no envelope', async () => {
    const app = createApp(config);
    const page = await request(app).get('/docs');
    expect(page.status).toBe(200); expect(page.headers['content-type']).toContain('text/html');
    expect(page.text).toContain('/docs/assets/swagger-ui-bundle.js'); expect(page.text).not.toMatch(/https?:\/\//);
    expect(page.headers['content-security-policy']).toContain("script-src 'self'");
    expect(page.headers['cache-control']).toBe('no-store');
    const raw = await request(app).get('/docs/openapi.json');
    expect(raw.status).toBe(200); expect(raw.body).toEqual(spec); expect(raw.body.success).toBeUndefined();
    expect(raw.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect((await request(app).get('/Docs')).status).toBe(404);
  });
  it('serves only the allowed local UI assets and disables external validation/token persistence', async () => {
    const app = createApp(config);
    const init = await request(app).get('/docs/assets/init.js');
    expect(init.status).toBe(200); expect(init.text).toContain('validatorUrl:null');
    expect(init.text).toContain('persistAuthorization:false'); expect(init.text).toContain('queryConfigEnabled:false');
    expect(init.text).toContain('tryItOutEnabled:false');
    for (const file of ['swagger-ui.css', 'swagger-ui-bundle.js']) expect((await request(app).get(`/docs/assets/${file}`)).status).toBe(200);
    for (const file of ['package.json', '.env', 'index.html']) expect((await request(app).get(`/docs/assets/${file}`)).status).toBe(404);
    expect((await request(app).get('/health')).body.data.status).toBe('ok');
  });
  it('continues to enforce authentication on every declared protected method/path', async () => {
    const unexpectedRepositoryCall = (): never => { throw new Error('Unexpected repository call in missing-token guard test'); };
    const auth = createAuthService({ create: unexpectedRepositoryCall, findCredentials: unexpectedRepositoryCall, findSafeById: unexpectedRepositoryCall }, config);
    const app = createApp(config, undefined, undefined, { auth });
    for (const source of Object.values(operations) as ApiOperation[]) {
      if (source.access === 'public') continue;
      for (const path of operationPaths(source)) {
        const response = await request(app)[source.method](path.replace(/:[A-Za-z]+/g, '1'));
        expect(response.status, `${source.method} ${path}`).toBe(401);
        expect(response.body.error.code).toBe('UNAUTHORIZED');
      }
    }
  });
});

describe('artifact safety scanner', () => {
  it('rejects token-like material without printing it', () => {
    const token = [Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: 'synthetic' })).toString('base64url'), 'synthetic-signature'].join('.');
    expect(() => assertArtifactSafe({ token })).toThrow('values suppressed');
    expect(() => assertArtifactSafe({ token: token.slice(0, token.lastIndexOf('.') + 1) })).toThrow('values suppressed');
  });
  it.each([
    { auth: { type: 'bearer', bearer: [{ key: 'token', value: 'literal-secret-example' }] } },
    { header: [{ key: 'Authorization', value: 'Bearer {{accessToken}}' }] },
    { Authorization: 'Bearer literal-secret-example' }, { origin: 'https://legacy-origin.invalid/api' },
    { description: 'curl --header example' }, { password: 'not-a-provisioned-password' },
  ])('rejects unsafe generated material %j', (artifact) => { expect(() => assertArtifactSafe(artifact)).toThrow(); });
  it('checks nested raw request bodies and exact private/source values without echoing them', () => {
    expect(() => assertArtifactSafe({ raw: JSON.stringify({ password: 'private-example-value' }) })).toThrow();
    expect(() => assertArtifactSafe({ description: 'contains private-example-value' }, ['private-example-value'])).toThrow('values suppressed');
    expect(() => assertArtifactSafe({ auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{accessToken}}' }] } })).not.toThrow();
  });
  it('uses runtime schemas as the request source rather than hand-maintained request examples', () => {
    const request = operations.register.request;
    const body = operations.register.bodyExample;
    expect(request.safeParse({ query: {}, body }).success).toBe(true);
    expect(request.safeParse({ query: {}, body: { ...body, email: undefined } }).success).toBe(false);
    expect(request.safeParse({ query: {}, body: { ...body, confirmPassword: 'does-not-match' } }).success).toBe(false);
    expect(z.toJSONSchema(request.shape.body, { io: 'input' }).properties).toHaveProperty('ConfirmPassword');
  });
});

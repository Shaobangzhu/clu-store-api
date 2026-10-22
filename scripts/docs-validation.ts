import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPI } from 'openapi-types';
import AjvDraft4 from 'ajv-draft-04';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { operations, operationPaths, type ApiOperation } from '../src/contracts/api.js';
import { inlineSchema } from '../src/documentation/postman.js';
import type { ApiSpec, JsonSchema } from '../src/documentation/openapi.js';
import { assertArtifactSafe, inspectSensitiveOriginal, privateEnvironmentValues } from './docs-safety.js';
import { generate, artifactPaths } from './generate-docs.js';

// Independent regression inventory from the supplied historical method/path shapes.
// No historical headers, values, descriptions or request bodies are retained.
export const historicalRoutes = [
  'get /api/products/offers', 'get /api/products/newarrivals', 'get /api/products', 'get /api/products/{id}',
  'get /api/categories/{title}', 'get /api/information/support', 'post /api/auth/register', 'post /api/auth/login',
  'get /api/ShoppingCart/fake-shopping-cart', 'get /api/ShoppingCart', 'post /api/ShoppingCart/items',
  'delete /api/ShoppingCart/items/{id}', 'delete /api/ShoppingCart/items', 'post /api/orders/place',
  'get /api/orders/{id}', 'post /api/orders/{id}/approve', 'post /api/orders/{id}/reject',
] as const;
export interface PostmanRequest {
  method: string; url: { raw: string; path: string[] }; auth: { type: string; bearer?: { key: string; value: string }[] };
  header: { key: string; value: string }[]; body?: { raw: string };
}
export interface PostmanItem {
  name: string; request?: PostmanRequest; item?: PostmanItem[];
  response?: { code: number; body: string }[]; event?: { listen: string; script: { exec: string[] } }[];
}
export function postmanItems(collection: unknown) {
  const result: (PostmanItem & { request: PostmanRequest })[] = [];
  function walk(items: PostmanItem[]) {
    for (const item of items) {
      if (item.item) walk(item.item);
      if (item.request) result.push(item as PostmanItem & { request: PostmanRequest });
    }
  }
  walk((collection as { item: PostmanItem[] }).item);
  return result;
}
function monetaryStrings(schema: JsonSchema) {
  function visit(value: unknown) {
    if (!value || typeof value !== 'object') return;
    const node = value as JsonSchema;
    for (const [key, property] of Object.entries(node.properties ?? {})) {
      if (/^(price|startingPrice|installments|unitPrice|lineTotal|totalAmount)$/.test(key)) {
        const variants = typeof property === 'object' ? property.anyOf ?? property.oneOf ?? [property] : [];
        const stringVariant = (schema: JsonSchema) => schema.type === 'string' || Array.isArray(schema.type) && schema.type.includes('string') && schema.type.every((t) => t === 'string' || t === 'null');
        assert(variants.some(stringVariant) && variants.every((schema) => schema.type === 'null' || stringVariant(schema)), 'Monetary response field must be a string');
      }
    }
    Object.values(node).forEach((child) => Array.isArray(child) ? child.forEach(visit) : visit(child));
  }
  visit(schema);
}
export async function validateDocumentation(spec: ApiSpec, collection: unknown, originalPath?: string) {
  await SwaggerParser.validate(structuredClone(spec) as unknown as OpenAPI.Document, { resolve: { external: false }, dereference: { circular: false } });
  const official = JSON.parse(readFileSync('tools/schemas/postman-v2.1.json', 'utf8')) as object;
  const postmanValidator = new AjvDraft4.default({ strict: false, allErrors: true });
  addFormats.default(postmanValidator);
  const validPostman = postmanValidator.compile(official);
  assert(validPostman(collection), 'Collection fails official Postman v2.1 schema (values suppressed)');
  const ajv = new Ajv2020({ strict: false, allErrors: true, allowUnionTypes: true });
  addFormats.default(ajv);
  const validators = new Map<string, ValidateFunction>();
  function matches(schema: JsonSchema, value: unknown) {
    const inlined = inlineSchema(schema, spec);
    const key = JSON.stringify(inlined);
    let validator = validators.get(key);
    if (!validator) { validator = ajv.compile(inlined); validators.set(key, validator); }
    return validator(value);
  }
  const covered = new Set<string>();
  const ids = new Set<string>();
  let examplesChecked = 0;
  for (const [path, methods] of Object.entries(spec.paths)) for (const [method, operation] of Object.entries(methods)) {
    const key = `${method} ${path}`;
    assert(!covered.has(key)); covered.add(key);
    assert(!ids.has(operation.operationId)); ids.add(operation.operationId);
    for (const response of Object.values(operation.responses)) for (const [media, definition] of Object.entries(response.content ?? {})) {
      if (media !== 'application/json') continue;
      const schema = inlineSchema(definition.schema, spec);
      monetaryStrings(schema);
      if (definition.example !== undefined) {
        assert(matches(schema, definition.example), `Response example schema mismatch for ${operation.operationId}`);
        examplesChecked += 1;
      }
    }
  }
  for (const route of historicalRoutes) assert(covered.has(route), `Missing historical method/path: ${route}`);
  const expected = new Set<string>();
  for (const [id, definition] of Object.entries(operations)) {
    const source: ApiOperation = definition;
    for (const rawPath of operationPaths(source)) {
      const path = rawPath.replace(/:([A-Za-z]+)/g, '{$1}');
      expected.add(`${source.method} ${path}`);
      const documented = spec.paths[path]?.[source.method];
      assert(documented, 'Runtime route missing documentation');
      assert.deepEqual(documented.security, source.access === 'public' ? [] : [{ bearerAuth: [] }]);
      assert.equal(documented['x-required-role'], source.access === 'admin' ? 'ADMIN' : undefined);
      for (const [status, schema] of Object.entries(source.responses)) {
        assert(documented.responses[status]);
        if (!schema) assert.equal(documented.responses[status]!.content, undefined);
      }
      if (source.bodyExample !== undefined && source.request) {
        const params = Object.fromEntries((documented.parameters ?? []).filter((p) => p.in === 'path').map((p) => [p.name, p.name === 'title' ? 'Phones' : '1']));
        assert(source.request.safeParse({ params, query: {}, body: source.bodyExample }).success, `Runtime Zod rejects request example for ${id}`);
        const body = documented.requestBody?.content['application/json'];
        assert(body && matches(body.schema, source.bodyExample), `Request JSON schema rejects example for ${id}`);
      }
    }
  }
  assert.deepEqual(covered, expected, 'OpenAPI/runtime route mismatch');
  const items = postmanItems(collection);
  const postmanCoverage = new Set<string>();
  for (const item of items) {
    const request = item.request;
    assert(request.url.raw.startsWith('{{baseUrl}}/'));
    const path = '/' + request.url.path.join('/').replace(/:([A-Za-z]+)/g, '{$1}');
    const method = request.method.toLowerCase() as 'get' | 'post' | 'delete';
    const key = `${method} ${path}`;
    assert(!postmanCoverage.has(key), 'Duplicate Postman method/path'); postmanCoverage.add(key);
    const op = spec.paths[path]?.[method]; assert(op);
    assert.equal(request.auth.type, op.security.length ? 'bearer' : 'noauth');
    if (op.security.length) assert.deepEqual(request.auth.bearer, [{ key: 'token', value: '{{accessToken}}', type: 'string' }]);
    assert(!request.header.some((header) => /^authorization$/i.test(header.key)));
    assert.deepEqual(new Set(item.response?.map((r) => String(r.code))), new Set(Object.keys(op.responses)));
    for (const response of item.response ?? []) {
      const schema = op.responses[String(response.code)]?.content?.['application/json']?.schema;
      if (schema) assert(matches(schema, JSON.parse(response.body)), 'Invalid Postman response example');
      if ([204, 304].includes(response.code)) assert.equal(response.body, '');
    }
    for (const event of item.event ?? []) {
      assert.equal(event.listen, 'test');
      assert(!/pm\.sendRequest|\.set\(|console\.|fetch\(|XMLHttpRequest/.test(event.script.exec.join('\n')), 'Postman scripts must be harmless assertions');
    }
  }
  assert.deepEqual(postmanCoverage, covered, 'Postman/OpenAPI route mismatch');
  const variables = (collection as { variable: { key: string; value: string }[] }).variable;
  assert.equal(variables.find((v) => v.key === 'accessToken')?.value, '');
  assert.equal(variables.find((v) => v.key === 'baseUrl')?.value, '');
  const evidence = originalPath ? inspectSensitiveOriginal(originalPath) : undefined;
  if (evidence) {
    assert.equal(evidence.requestCount, 17, 'Unexpected original request count');
    assert(evidence.legacyRoutes.size === historicalRoutes.length && historicalRoutes.every((route) => evidence.legacyRoutes.has(route)), 'Original normalized route coverage mismatch (values suppressed)');
  }
  const denied = [...privateEnvironmentValues(), ...(evidence?.blocked ?? [])];
  for (const path of artifactPaths) {
    const content = readFileSync(path, 'utf8');
    assertArtifactSafe(path.endsWith('.json') ? JSON.parse(content) : content, denied);
  }
  return { openapi: spec.openapi, historicalRoutes: 17, uniqueOperations: covered.size, postmanRequests: items.length,
    responseExamplesChecked: examplesChecked, securityDeclarations: 'passed', monetaryStrings: 'passed',
    postmanV21: 'passed', embeddedTokens: 0, blockedValues: 0, originalCompared: !!evidence };
}
if (process.argv[1]?.endsWith('docs-validation.ts')) {
  const index = process.argv.indexOf('--original');
  const original = index >= 0 ? process.argv[index + 1] : undefined;
  await generate(true, original);
  const spec = JSON.parse(readFileSync(artifactPaths[0], 'utf8')) as ApiSpec;
  const collection: unknown = JSON.parse(readFileSync(artifactPaths[1], 'utf8'));
  console.log(JSON.stringify(await validateDocumentation(spec, collection, original)));
}

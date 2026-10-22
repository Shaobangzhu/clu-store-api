import { z } from 'zod';
import { operations, operationPaths, type ApiOperation } from '../contracts/api.js';
import * as dto from '../contracts/responses.js';
import { exampleCart, exampleCartItem, exampleCurrentOrder, exampleDate, examplePlacement, exampleProduct, exampleUser } from '../contracts/examples.js';
import { demoCart } from '../modules/cart/demo.js';

export type JsonSchema = z.core.JSONSchema.BaseSchema;
export interface Media { schema: JsonSchema; example?: unknown }
export interface ResponseDefinition { description: string; content?: Record<string, Media>; headers?: Record<string, unknown> }
export interface OperationDefinition {
  operationId: string; tags: string[]; summary: string; description: string; security: { bearerAuth: never[] }[];
  parameters?: { name: string; in: 'path' | 'query' | 'header'; required: boolean; description?: string; schema: JsonSchema; example?: unknown }[];
  requestBody?: { required: boolean; content: Record<string, Media> };
  responses: Record<string, ResponseDefinition>; 'x-required-role'?: string; 'x-canonical-path'?: string;
}
export interface ApiSpec {
  openapi: '3.1.0'; info: { title: string; version: string; description: string }; servers: { url: string; description: string }[];
  paths: Record<string, Partial<Record<'get' | 'post' | 'delete', OperationDefinition>>>;
  components: { schemas: Record<string, JsonSchema>; securitySchemes: Record<string, unknown> };
  'x-order-state-machine': Record<string, unknown>;
}
const examples: Record<string, unknown> = { product: exampleProduct, category: { id: 1, title: 'Phones', slug: 'phones', subTitle: null, videos: null, features: [], products: [] },
  register: exampleUser, login: { user: exampleUser, token: '{{accessToken}}', tokenType: 'Bearer', expiresIn: 900, expiresAt: exampleDate },
  cartDemo: demoCart(), cart: exampleCart, addCartItem: exampleCartItem, place: examplePlacement, order: exampleCurrentOrder(),
  approve: exampleCurrentOrder('approved'), reject: exampleCurrentOrder('rejected') };
const infrastructureErrors = { 400: ['VALIDATION_ERROR', 'MALFORMED_JSON'], 403: ['CORS_ORIGIN_DENIED'], 413: ['PAYLOAD_TOO_LARGE'], 415: ['UNSUPPORTED_MEDIA_TYPE'], 429: ['RATE_LIMITED'], 500: ['INTERNAL_ERROR'] };
export function operationErrors(operation: ApiOperation): Record<number, string[]> {
  const result: Record<number, string[]> = structuredClone(infrastructureErrors);
  if (operation.access !== 'public') result[401] = ['UNAUTHORIZED'];
  if (operation.access === 'admin') result[403]!.push('FORBIDDEN');
  if (operation.access !== 'public' || !['root', 'cart'].includes(operation.group)) result[503] = ['SERVICE_NOT_READY'];
  for (const [status, codes] of Object.entries(operation.errors ?? {})) result[Number(status)] = [...new Set([...(result[Number(status)] ?? []), ...(codes ?? [])])];
  return result;
}
export function buildOpenApi(): ApiSpec {
  const schemas: Record<string, JsonSchema> = {};
  function register(name: string, schema: z.ZodType, io: 'input' | 'output' = 'output'): JsonSchema {
    const converted = z.toJSONSchema(schema, { io, target: 'draft-2020-12' });
    delete converted.$schema;
    schemas[name] = converted;
    return { $ref: `#/components/schemas/${name}` };
  }
  register('Money', dto.money);
  register('ErrorEnvelope', dto.errorEnvelope);
  const paths: ApiSpec['paths'] = {};
  for (const [id, definition] of Object.entries(operations)) {
    const operation: ApiOperation = definition;
    const parameters: NonNullable<OperationDefinition['parameters']> = [];
    for (const [part, location] of [['params', 'path'], ['query', 'query'], ['headers', 'header']] as const) {
      const schema = part === 'headers' ? operation.headers : operation.request?.shape[part] as z.ZodType | undefined;
      if (!schema) continue;
      const wire = z.toJSONSchema(schema, { io: 'input' });
      for (const [name, property] of Object.entries(wire.properties ?? {})) {
        const annotation = operation.parameters?.[name];
        parameters.push({ name, in: location, required: location === 'path' || (wire.required ?? []).includes(name), schema: property as JsonSchema,
          ...((annotation?.description ?? (property as JsonSchema).description) ? { description: annotation?.description ?? (property as JsonSchema).description! } : {}),
          ...(annotation?.example !== undefined ? { example: annotation.example } : {}) });
      }
    }
    const body = operation.request?.shape.body as z.ZodType | undefined;
    const responses: OperationDefinition['responses'] = {};
    for (const [status, schema] of Object.entries(operation.responses)) {
      const response: ResponseDefinition = { description: Number(status) === 204 ? 'Success; no response body' : Number(status) === 201 ? 'Created' : Number(status) === 304 ? 'Not modified; no body' : 'Success' };
      if (schema) {
        const example = operation.responseExamples?.[Number(status)] ?? (operation.mediaType ? undefined
          : id === 'spec' ? { openapi: '3.1.0' } : { success: true, data: operation.dataExample ?? examples[id], meta: null });
        if (example !== undefined) schema.parse(example);
        response.content = { [operation.mediaType ?? 'application/json']: { schema: register(`${id}Response${status}`, schema), ...(example !== undefined ? { example } : {}) } };
      }
      responses[status] = response;
    }
    for (const [status, codes] of Object.entries(operationErrors(operation))) {
      responses[status] = { description: codes.join(' | '), content: { 'application/json': {
        schema: { $ref: '#/components/schemas/ErrorEnvelope' }, example: { success: false, error: { code: codes[0], message: 'Illustrative error; see documented code', details: null } },
      } }, ...(Number(status) === 401 ? { headers: { 'WWW-Authenticate': { schema: { type: 'string', const: 'Bearer' } } } } : {}),
      ...(Number(status) === 429 ? { headers: { 'Retry-After': { schema: { type: 'string' }, description: 'Seconds until retry budget resets' } } } : {}) };
    }
    const hasBody = operation.method !== 'get' && body && !(body instanceof z.ZodUndefined);
    const canonical = operationPaths(operation)[0]!.replace(/:([A-Za-z]+)/g, '{$1}');
    for (const [index, rawPath] of operationPaths(operation).entries()) {
      const path = rawPath.replace(/:([A-Za-z]+)/g, '{$1}');
      paths[path] ??= {};
      paths[path][operation.method] = {
        operationId: id + (index ? 'Legacy' : ''), tags: [operation.group], summary: operation.summary + (index ? ' (legacy casing alias)' : ''),
        description: operation.description + (index ? ` Same router and semantics as ${canonical}; new clients should use canonical lowercase.` : ''),
        security: operation.access === 'public' ? [] : [{ bearerAuth: [] }],
        ...(operation.access === 'admin' ? { 'x-required-role': 'ADMIN' } : {}), ...(index ? { 'x-canonical-path': canonical } : {}),
        ...(parameters.length ? { parameters } : {}),
        ...(hasBody ? { requestBody: { required: operation.bodyRequired ?? !body.isOptional(), content: { 'application/json': {
          schema: register(`${id}Request`, body, 'input'), ...(operation.bodyExample !== undefined ? { example: operation.bodyExample } : {}),
        } } } } : {}), responses,
      };
    }
  }
  return { openapi: '3.1.0', info: { title: 'CLU Store API', version: '1.0.0', description:
    'V1 uses {success,data,meta} success envelopes and {success:false,error} failures; 204/HEAD/conditional/static/docs responses can be bodyless or use their declared media type. Historical paths are functional, but payloads require a typed frontend adapter that unwraps data. All monetary response fields are decimal STRINGS in CNY. Model price is full base plus memory increment; never double-add startingPrice. Synthetic examples are illustrative and are NOT provisioned accounts, SKUs or orders. IDs must be selected from the local catalog. JWT is HS256 only, issuer/audience checked, default TTL 900s with env-only strong key. ADMIN decisions are terminal and transactional. Global JSON limit, allowlisted CORS, Helmet and rate limits apply; 401 denotes invalid credentials/token, 403 wrong role or blocked origin. Input Zod refinements (confirmation equality, normalized identity rules, cursor decoding/sort matching and business limits) remain authoritative where JSON Schema cannot express them. API reads reject unknown/repeated query keys where their runtime schema declares a strict query. X-Request-Id is server-generated. No production seed credentials or remote origins are embedded.' },
    servers: [{ url: '/', description: 'Current origin; use local runtime configuration' }], paths,
    components: { schemas, securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Paste an operator-obtained access token. No token is bundled or persisted by Swagger UI.' } } },
    'x-order-state-machine': { initial: 'pending', transitions: [{ from: 'pending', to: 'approved', role: 'ADMIN' }, { from: 'pending', to: 'rejected', role: 'ADMIN' }], terminal: ['approved', 'rejected'] } };
}

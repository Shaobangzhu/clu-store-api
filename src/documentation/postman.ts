import type { ApiSpec, JsonSchema, Media } from './openapi.js';

export function inlineSchema(schema: JsonSchema, spec: ApiSpec): JsonSchema {
  if (schema.$ref) {
    const name = schema.$ref.replace('#/components/schemas/', '');
    const target = spec.components.schemas[name];
    if (!target) throw new Error('Unknown local documentation schema reference');
    return inlineSchema(target, spec);
  }
  // Postman's JSON schema assertion supports Draft 7. These responses use its common subset.
  // Cc is exactly C0/C1 controls; replace the Unicode property escape for older AJV engines.
  function visit(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') {
      const node = value as JsonSchema;
      if (typeof node.$ref === 'string') return inlineSchema(node, spec);
      return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, key === 'pattern' && typeof child === 'string'
        ? child.replaceAll('\\p{Cc}', '\\u0000-\\u001f\\u007f-\\u009f') : visit(child)]));
    }
    return value;
  }
  return visit(schema) as JsonSchema;
}
export function buildPostman(spec: ApiSpec) {
  const folders = new Map<string, unknown[]>();
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      const group = operation.tags[0]!;
      const items = folders.get(group) ?? [];
      folders.set(group, items);
      const isLegacy = operation.operationId.endsWith('Legacy');
      const variables = (operation.parameters ?? []).filter((p) => p.in === 'path').map((p) => ({ key: p.name,
        value: p.name === 'title' ? 'Phones' : path.includes('/products/') ? '{{productId}}' : path.includes('/items/') ? '{{cartItemId}}' : '{{orderId}}',
        description: p.description ?? 'Choose an actual local entity ID; example variables are not provisioned' }));
      const route = path.replace(/\{([^}]+)\}/g, ':$1');
      const query = (operation.parameters ?? []).filter((p) => p.in === 'query').map((p) => ({ key: p.name,
        value: String(p.schema.default ?? p.example ?? (p.name === 'cursor' ? '{{ordersCursor}}' : '')), disabled: p.schema.default === undefined,
        description: p.description ?? 'See generated OpenAPI schema' }));
      const enabledQuery = query.filter((q) => !q.disabled).map((q) => `${q.key}=${encodeURIComponent(q.value)}`).join('&');
      const auth = operation.security.length ? { type: 'bearer', bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }] } : { type: 'noauth' };
      const header: { key: string; value: string; disabled?: boolean }[] = [];
      const body = operation.requestBody?.content['application/json'];
      if (body) header.push({ key: 'Content-Type', value: 'application/json' });
      for (const p of operation.parameters ?? []) if (p.in === 'header') header.push({ key: p.name, value: '{{idempotencyKey}}' });
      const req = { method: method.toUpperCase(), auth, header, url: { raw: `{{baseUrl}}${route}${enabledQuery ? '?' + enabledQuery : ''}`,
        host: ['{{baseUrl}}'], path: route.slice(1).split('/'), ...(variables.length ? { variable: variables } : {}), ...(query.length ? { query } : {}) },
        description: operation.description + '\n\nNew envelope requires a frontend adapter. Examples are synthetic and not provisioned. Importing this collection executes no requests. Select actual IDs before running mutations.',
        ...(body ? { body: { mode: 'raw', raw: JSON.stringify(body.example ?? {}, null, 2), options: { raw: { language: 'json' } } } } : {}) };
      const responses = Object.entries(operation.responses).map(([code, definition]) => {
        const entry = Object.entries(definition.content ?? {})[0];
        const [type, media] = entry ?? [undefined, undefined];
        return { name: `${code} ${definition.description}`, originalRequest: req, status: definition.description, code: Number(code),
          _postman_previewlanguage: type === 'application/json' ? 'json' : 'text', header: type ? [{ key: 'Content-Type', value: type }] : [],
          body: media?.example === undefined ? '' : JSON.stringify(media.example, null, 2) };
      });
      const schemas = Object.fromEntries(Object.entries(operation.responses).flatMap(([status, response]) => {
        const media: Media | undefined = response.content?.['application/json'];
        return media ? [[status, inlineSchema(media.schema, spec)]] : [];
      }));
      const test = [
        `// Read-only assertions. No credential capture, follow-up requests, or mutation scripts.`,
        `const documented = ${JSON.stringify(Object.keys(operation.responses).map(Number))};`,
        `pm.test('Documented HTTP status', function () { pm.expect(documented).to.include(pm.response.code); });`,
        `const schemas = ${JSON.stringify(schemas)};`,
        `if (schemas[pm.response.code]) { pm.test('Generated response schema', function () { pm.response.to.have.jsonSchema(schemas[pm.response.code]); }); }`,
        `if (pm.response.code === 204 || pm.response.code === 304) { pm.test('Bodyless response', function () { pm.expect(pm.response.text()).to.equal(''); }); }`,
      ];
      items.push({ name: `${method.toUpperCase()} ${path}${isLegacy ? ' (legacy casing)' : ''}`, request: req, response: responses,
        event: [{ listen: 'test', script: { type: 'text/javascript', exec: test } }] });
    }
  }
  return { info: { name: 'CLU Store API — sanitized V1', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    description: 'Generated only from new runtime/Zod API definitions. The original collection is sensitive and is never used as a generation template. Synthetic credentials/examples are NOT provisioned. Set baseUrl and an operator-obtained accessToken locally. Do not run the entire collection blindly: POST/DELETE requests change the chosen local user data. See README.md for manual flow and ADMIN requirements.' },
    variable: [{ key: 'baseUrl', value: '', type: 'string' }, { key: 'accessToken', value: '', type: 'string' },
      { key: 'productId', value: '2', type: 'string' }, { key: 'cartItemId', value: '', type: 'string' }, { key: 'orderId', value: '', type: 'string' },
      { key: 'ordersCursor', value: '', type: 'string' }, { key: 'idempotencyKey', value: 'synthetic-checkout-001', type: 'string' }],
    item: [...folders].map(([name, item]) => ({ name, item })) };
}

export const postmanReadme = `# CLU Store API sanitized Postman collection

Import CLU_Store_API.sanitized.postman_collection.json as Postman v2.1. It is generated only from the current runtime/Zod contract, with one request per method/path, including case-accurate legacy aliases. Importing it runs nothing. Synthetic credentials, SKU IDs and response examples are illustrative and are NOT provisioned.

1. Start the local API and migrated PostgreSQL as described in ../README.md. Set baseUrl to the URL of your locally running API; it is deliberately unset in the export. Configure JWT settings before using auth.
2. Choose a unique username/email and your own password for registration, or use an existing local account. Email and a matching canonical confirmPassword are required. The example account is not pre-created.
3. Run login manually. Copy its returned token into a private local accessToken variable; do not export or commit populated secrets. All protected requests use {{accessToken}} through Postman bearer auth. Public requests explicitly use noauth. No script captures credentials or changes variables.
4. Read products/categories and select actual available model/memory/color IDs. Update request bodies before adding a line. Save the returned cart line ID as cartItemId if needed. Product model price is the full base; memory price is the increment. Monetary JSON values are strings.
5. For cart checkout send {}. Set a fresh idempotencyKey for each new purchase intent, retain it for retries, and save the returned orderId. Replay returns 200 with the original pending receipt; use GET order for current state. A direct SKU checkout preserves the cart.
6. Own-order lists use pageSize/sort/cursor. Copy nextCursor into ordersCursor and enable that optional query parameter. Product lists separately use page/pageSize/keyword/category/sort.
7. To inspect all orders or approve/reject, supply an explicitly provisioned ADMIN token. Provisioning is the operator CLI in the repository README, never a seeded account. Only pending orders transition; an approve/reject race has one winner and one 409. A note is plain owner-visible text. Do not place secrets in metadata.

Run requests manually in the intended sequence. POST/DELETE requests mutate local data; do not bulk-run this collection against valuable accounts. Response examples and generated JSON schema assertions are harmless read-only checks, without pre-request/network scripts or credential capture. Responses use {success,data,meta}; legacy raw payload consumers need a frontend adapter. Bodyless deletes, HTML/SVG assets and raw OpenAPI are explicit exceptions. Global errors, missing configuration and empty data are documented rather than mocked.

Refresh with npm run docs:generate; verify with npm run docs:check and npm run test:docs. Do not edit generated JSON. GET /docs serves local Swagger UI and GET /docs/openapi.json serves the same specification. The original Black_Apple_API.postman_collection.json remains sensitive external input and must never be copied into tracked paths.
`;

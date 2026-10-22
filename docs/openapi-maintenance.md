# OpenAPI and sanitized Postman maintenance

The authoritative route and schema definitions live in TypeScript. `docs/openapi.json`, the sanitized Postman collection and its README are generated outputs. Refresh all three together; do not patch generated JSON.

## Sources and generation

- `src/contracts/api.ts`: method/path/mount catalog, access declarations, request-schema references, documented outcomes, descriptions and safe examples. Runtime routers bind methods/paths from this catalog; auth/validation order and domain logic stay in their existing modules.
- Existing module Zod schemas: actual request validation. Documentation uses Zod's native JSON Schema input conversion so transforms are not mistaken for wire output shapes. Deprecation and constraint explanations are attached beside their runtime definitions.
- `src/contracts/responses.ts`: reusable Zod DTOs, success/error envelopes, monetary strings and both pagination shapes. Serializer return types use these inferred types. P07 placement replay uses the same placement schema.
- `src/contracts/examples.ts`: original synthetic values, never asserted to be provisioned source fixtures. Cart/order examples retain correct full-base-plus-memory arithmetic.
- `src/documentation/openapi.ts`: OpenAPI 3.1 component generation and explicit per-operation security/outcomes. `postman.ts` derives one request per method/path from the spec.

```sh
npm run docs:generate
npm run docs:check
npm run test:docs
npm run typecheck
npm run lint
npm run build
```

Native Zod conversion avoids another schema-registry dependency. The component registry remains deterministic. Custom refinements and normalization cannot all be represented in JSON Schema: matching confirmations, trimmed identities, decoded cursor consistency and DB-backed business rules stay enforced by runtime Zod/services and are described in the spec. Input properties can show wire-string types for numeric query values; descriptions state runtime maximum/default rules. Future changes must update those nearby semantic notes where conversion cannot express the rule.

The typed DTOs check serializer shape at compile time; they do not add a blanket response-validation middleware. Tests validate generated examples and relevant real responses. Domain integration tests remain necessary when behavior changes. Pagination, role policies, idempotency and order transitions are described in [the detailed contract](api-contract.md).

## Serving and safety

`GET /docs` loads a fixed shell, local pinned Swagger CSS/bundle and one initialization file. `GET /docs/openapi.json` returns the same generated spec as raw JSON. Assets and raw spec are explicit envelope exceptions. Documentation routes require no JWT/DB dependency, but inherit global CORS/rate limits/security middleware. A docs-scoped CSP allows local scripts and same-origin connections. External validation, URL configuration overrides, auto-enabled try-it-out and persisted authorization are disabled. Request execution remains a deliberate UI action.

The Postman export uses `{{baseUrl}}` and bearer `{{accessToken}}`, with empty exported values. Public requests use noauth. Synthetic password examples are clearly not provisioned; replace them with operator-chosen local input. There are no hardcoded Authorization headers, token capture, pre-request network scripts or stale cURL descriptions. Response assertions inline compatible JSON Schema; Unicode Cc patterns are converted to equivalent C0/C1 ranges for older Postman validators. Tests remain read-only assertions; importing the collection performs no request.

The original `Black_Apple_API.postman_collection.json` is sensitive external evidence. It is never a generation template and must not be copied into tracked paths. To compare against the existing original without retaining its contents:

```sh
npm run docs:check -- --original /absolute/private/path/Black_Apple_API.postman_collection.json
```

That optional check compares all 17 normalized historical method/path shapes and scans every generated artifact against original credentials/origins and private environment values. It prints counts/status only. Ordinary checks also reject token-like signed/unsigned JWT strings, literal bearer values, Authorization headers, non-synthetic credential fields, unapproved origins, embedded IPv4 addresses and cURL material. The export deliberately has no default server URL; users set their local target privately. A deterministic pattern/value scan cannot prove the absence of every possible secret encoding, so new example sources must remain synthetic and reviewed.

Validation uses the vendored official Postman v2.1 schema, Swagger Parser with external references disabled, AJV example validation, source-to-artifact drift checks and independent legacy-route regression coverage. Targeted negative tests ensure unsafe exports, security drift and duplicate endpoints fail. No validator fetches schemas or executes original collection scripts. See [P09 verification](p09-verification.md) for actual results.

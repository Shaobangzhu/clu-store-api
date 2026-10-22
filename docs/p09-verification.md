# P09 documentation verification

Verified locally on 2026-10-22. Initial `git status --short` was empty on main at `1d09963 feat(orders): enforce admin transitions and audit history`. README, active routers, runtime Zod schemas, serializers/services, current API/architecture/development documentation and package configuration were inspected before edits. No applicable AGENTS.md was found in the repository or ancestor directories. Existing P08 code and private environment settings were preserved.

## Source reconciliation and generated scope

The supplied original `Black_Apple_API.postman_collection.json` was found outside the repository and inspected as sensitive data. It contained 17 requests, eight auth entries, seven explicit authorization headers and nine descriptions. Only normalized method/path shapes and these counts were reported. No bearer, body credential, host/IP or original cURL description was printed or copied into new definitions. The original was not copied into the repository or used as a template. Its basename is ignored to prevent accidental tracking.

The current contract produces **30 unique method/path operations across 28 paths**: all 17 historical shapes, five canonical cart counterparts, category navigation, own/admin order lists, health/readiness, docs/raw spec and the existing placeholder asset. Three allowlisted Swagger UI supporting files are served separately. All case-accurate aliases, PUBLIC/bearer/ADMIN declarations and runtime request-schema references are covered.

`src/contracts/api.ts` is the route/mount/documentation catalog used by runtime router binding. Existing middleware order, auth, business services and database behavior are retained. Zod request schemas supply input schemas; shared DTO schemas supply output definitions and serializer types. P07's placement schema was moved to that shared source and re-exported at the old location, retaining receipt/replay behavior. Native Zod 4 JSON Schema conversion supplies OpenAPI 3.1 components; the Postman generator consumes the resulting spec.

Generated artifacts:

- `docs/openapi.json` — raw OpenAPI 3.1 JSON, also served at GET /docs/openapi.json.
- `postman/CLU_Store_API.sanitized.postman_collection.json` — official v2.1 collection format, one request per unique method/path.
- `postman/README.md` — generated import/manual-run guide.

GET /docs serves Swagger UI using pinned local assets only. External validation, URL-driven configuration, persisted authorization and automatically enabled try-it-out are disabled. A docs-scoped CSP allows the necessary local UI resources while preserving global API middleware. Loading docs does not execute business requests.

## Actual validation and check results

All final commands below exited **0**:

| Command | Actual result |
|---|---|
| `npm run docs:generate -- --original <external-original-path>` | Three generated artifacts; sensitive scan passed; original compared |
| `npm run docs:check -- --original <external-original-path>` | OpenAPI 3.1 and Postman v2.1 valid; 17 historical routes, 30 operations/requests; 263 response examples; security/money checks passed; zero embedded tokens/blocked values |
| `npm run test:docs` | **22 passed**, one file, 993 ms |
| `npm test` | **73 passed**, five files, 1.03 s |
| `npm run test:integration` | **226 passed**, five files, 9.58 s |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed; app plus tests/scripts/configuration |
| `npm run build` | Passed |
| `git diff --check` | Passed |
| `git ls-files -- '*Black_Apple_API.postman_collection.json'` | Empty; original not tracked |

Final validator output, with no sensitive values:

```json
{"openapi":"3.1.0","historicalRoutes":17,"uniqueOperations":30,"postmanRequests":30,"responseExamplesChecked":263,"securityDeclarations":"passed","monetaryStrings":"passed","postmanV21":"passed","embeddedTokens":0,"blockedValues":0,"originalCompared":true}
```

Final test console summaries:

```text
Test Files  1 passed (1)
     Tests  22 passed (22)
  Duration  993ms

Test Files  5 passed (5)
     Tests  73 passed (73)
  Duration  1.03s

Test Files  5 passed (5)
     Tests  226 passed (226)
  Duration  9.58s
```

The full PostgreSQL suite was run because route binding, request metadata and DTO type wiring cross module boundaries. Existing guarded fixture cleanup/count assertions passed. P09 introduced no migration, database object, seed/admin account or Docker change, and never executed a generated Postman request. No deployment was performed.

## Dependencies and validation mechanics

Pinned production dependency: swagger-ui-dist 5.34.0. Pinned development packages: @types/swagger-ui-dist 3.30.6, @apidevtools/swagger-parser 13.1.0, openapi-types 12.1.3, ajv 8.20.0, ajv-draft-04 1.0.0 and ajv-formats 3.0.1. The lockfile is updated. npm reported zero vulnerabilities. Existing pending lifecycle-script approvals were not changed; no telemetry/install script approval was added. Zod remains pinned at 4.6.7 and Prisma at 7.10.1.

OpenAPI validation uses Swagger Parser with external references disabled. Request examples are checked by the actual runtime Zod schema and the generated JSON Schema; response examples are checked with AJV. Monetary response fields must be strings, including nullable string variants. Every public operation explicitly has empty security; protected operations use bearerAuth, with an ADMIN extension and actual ADMIN guards on privileged routes. Missing-token HTTP tests exercise every declared protected method/path through the real middleware.

Postman validates against the vendored official v2.1 schema, with offline Draft 4 support. Endpoint sets must exactly match OpenAPI and be unique. Every protected request and response originalRequest uses bearer value `{{accessToken}}`; public requests use noauth. No Authorization header is embedded. Both baseUrl and accessToken are empty in the export. Its test scripts contain only assertions: no token capture, variable writes, pre-request scripts or network calls. JSON response schemas are inlined, and Unicode control-character patterns are converted to equivalent C0/C1 ranges for older Postman validators. All saved JSON responses are schema-checked; bodyless examples remain empty.

The programmatic scanner checks every generated artifact against original credential/origin values and private environment values, plus generic token-like signed/unsigned JWT detection, bearer rules, credentials, unapproved origins/IPs and cURL text. Errors suppress matching values. Exact original-content comparisons require the optional external file argument; ordinary reproducibility/security tests work without that private file. The original is always parsed as inert data, never executed.

## Repairs during implementation

Initial typechecks caught generic/overload typing for native Zod conversion and CommonJS validator imports; these were corrected. An initial lint run caught one unused test import. The first targeted run had 19 passes and three failures: a valid nullable string schema was rejected by the money checker, a canonical alias reference used Express parameter notation, and the duplicate-route negative test was blocked by the first issue. Those were repaired; both subsequent targeted runs passed all 22 cases.

An original-source comparison then found literal `:id` source parameters had not been normalized alongside numeric IDs. Normalization now handles both forms, and mismatch reports suppress original data. The scanner also rejected overlap with original host text in the initial proposed local base URL. The export/guide now leave the target unset and require a private local choice. Scanning all outputs precedes writing any new generation. All final artifact checks passed after these repairs; no sensitive value was included in this record.

Final executable checks preceded only manual documentation/provenance edits. Generated JSON and the Postman guide remain reproducible; no behavior or fixture was modified afterward.

## Limits and next work

JSON Schema cannot encode every Zod refinement or database invariant. Confirmation equality, normalized identities, cursor decoding/sort consistency and transactional business limits remain runtime-authoritative and are explained in descriptions. Serializer types check shape at compile time; there is no new blanket runtime response validator. The detailed [API contract](api-contract.md), domain tests and generated schemas must remain aligned.

Synthetic accounts/SKUs/orders are examples and are not provisioned. A valid local token/ADMIN must be obtained through the existing auth/operator workflow. Mutation requests require deliberate selection of local IDs; bulk-running the collection can change user data. A pattern/value scan cannot prove absence of every encoded secret. Future inputs must remain synthetic or reviewed. P10/P11 CI/security work and P12 frontend envelope/DTO integration remain separate phases.

## Changed files and repository state

- New contracts: `src/contracts/{api,responses,examples}.ts`.
- New documentation runtime/generators: `src/documentation/{openapi,postman,routes}.ts`, `scripts/{generate-docs,docs-validation,docs-safety}.ts`.
- Router/mount/type integration: `src/app.ts`, all active module route files, auth/cart/order/product schema or serializer/type adapters.
- Generated outputs: raw spec, sanitized collection and import guide.
- Validation: `tests/docs.test.ts`, public schema and provenance under `tools/schemas`.
- Tooling/docs: package.json/lockfile, .gitignore, README, API/architecture/development docs, maintenance guide and this record.

All P09 work remains local and uncommitted on main. No commit, push, PR, publication or deployment was performed.

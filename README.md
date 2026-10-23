# CLU Store API

P11 packages the Express 5 / strict TypeScript / ESM API foundation for Node 24 LTS, with Prisma 7, local PostgreSQL 18 and a provenance-backed response-sample and supplemental frontend demo seed. Public catalog/category/support reads, registration/login, JWT guards, persistent user-owned carts, atomic checkout, scoped order reads, ADMIN decisions and generated OpenAPI/Postman documentation are implemented.

## Local development

Use Node 24 and npm 11. First inspect existing Docker projects and ports as described in [local development](docs/local-development.md), then run:

```sh
npm ci
npm run env:local
docker compose up -d --wait postgres
npm run db:generate
npm run db:migrate:dev
npm run db:seed
npm run dev
```

The default bind address is `127.0.0.1:3000`. Compose sets container `HOST=0.0.0.0`; published API access defaults to loopback. `env:local` generates private credentials into a new ignored `.env` and refuses to overwrite existing settings. See `.env.example` for validated configuration; `CORS_ORIGINS` accepts comma-separated exact HTTP(S) origins, and an empty value permits no browser cross-origin access. Requests without an Origin header are accepted.

```sh
npm run db:migrate:test
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

`src/app.ts` exports `createApp(config)` without binding a port. `src/server.ts` loads validated environment configuration, listens, and drains HTTP connections on SIGINT/SIGTERM with a bounded shutdown deadline. Development and start scripts load an optional `.env` using Node's native loader.

## Implemented operational endpoints

- `GET /health`: `200` with `{success:true,data:{status:"ok"},meta:null}`; process liveness only.
- `GET /ready`: bounded real PostgreSQL check; `200` when reachable, `503 SERVICE_NOT_READY` on failure/timeout or missing database configuration.

Unknown routes return an error envelope with `404 NOT_FOUND`. The seven public read routes below are also implemented. Responses include a generated `X-Request-Id`; logs record request ID/method/status/duration without request bodies, headers or raw URLs. Helmet, allowlisted CORS, a JSON size cap and an in-memory generic rate limiter are enabled. Proxy trust is disabled; configure it deliberately before any reverse proxy or multi-process deployment.

Reusable Zod validation accepts an object with `params`, `query` and/or `body` schemas. Parsed values and transforms are stored in `res.locals.validated`, preserving Express 5 request getters. The success helper is `res.locals.success(data, status?, meta?)`; error handling emits stable codes without exposing internal error messages.

## Documentation and planning

Current V1 decisions and compatibility constraints live in [docs/architecture.md](docs/architecture.md) and [docs/api-contract.md](docs/api-contract.md). See [docs/local-development.md](docs/local-development.md) for database roles, migrations, host/container URLs and guarded test workflows and [docs/fixture-provenance.md](docs/fixture-provenance.md) for source evidence, demo transformations and missing response samples.

The original planning package remains under `documents/`: source audit, architecture/API proposal, implementation roadmap and phase prompts. It describes historical sources and future work; it is not evidence that those features are implemented. Original Postman material contains sensitive bearer-like values and must not be committed.

Database verification uses `npm run db:migrate:test` and `npm run db:smoke` against a separately guarded test database. No reset is automated. The initial schema, including order snapshots and monetary Decimal fields, is in `prisma/schema.prisma`; P02 results are recorded in [docs/p02-verification.md](docs/p02-verification.md).

P03 now reconciles all six supplied response samples: 7 complete sample products, 10 unavailable summary-only products and 8 supplemental frontend demo products. Source product IDs 2, 6, 7, 15, 22, 31 and 42 and their model/memory IDs are preserved. Earlier fallback records are reconciled using guarded ID corrections; inactive compatibility options are retained. All media uses an original local placeholder; support text is original and escaped. Historical offers remain inactive. See [sample reconciliation](docs/p03-sample-reconciliation.md) and [fixture provenance](docs/fixture-provenance.md).

## Public read API (P04)

- `GET /api/products/offers`, `GET /api/products/newarrivals`
- `GET /api/products` with keyword/category/page/pageSize/sort filters
- `GET /api/products/:id`
- `GET /api/categories`, `GET /api/categories/:title` (title or slug)
- `GET /api/information/support`

All JSON responses use the documented envelope. Monetary DTO values are two-decimal strings; memory option price is an increment over the full model base price. Support is sanitized on read. Historical offers remain inactive, and unavailable summary-only products have no active configurations. The reviewed placeholder is served at `/media/demo-placeholder.svg`.

`npm test` runs both database-independent regressions and the real PostgreSQL suites. Apply test migrations first. `npm run test:unit` is the fast database-independent subset; `npm run test:integration` selects only PostgreSQL tests. Integration runs use guarded targets, rollback-only catalog fixtures and exact-ID cleanup for authentication/cart/order fixtures. Missing infrastructure fails the gate rather than silently skipping tests. See [P04 verification](docs/p04-verification.md) and [the read contract](docs/api-contract.md#p04-public-read-details).


## Authentication (P05)

`POST /api/auth/register` requires `{username,email,password,confirmPassword}` and returns a safe USER record. `POST /api/auth/login` accepts `{identifier,password}` (username or email) and returns `{user,token,tokenType,expiresIn,expiresAt}` inside `data`. The legacy `ConfirmPassword` registration field and login `username` alias remain accepted with deprecation metadata. Neither route returns a password hash.

Configure `JWT_SECRET` as 32 cryptographically random bytes encoded as 64 hex characters, plus `JWT_ISSUER`, `JWT_AUDIENCE` and `JWT_TTL_SECONDS` (default 900). `env:local` supplies a random key for **new** `.env` files; existing files are preserved and need the new key added explicitly. Missing secret disables authentication with 503 in development/test and rejects production startup. Invalid supplied secrets always reject startup.

Argon2id hashes use 64 MiB, three passes and one lane. Auth limits apply per IP before JSON parsing and per normalized identifier; passwords, hashes, bodies and headers are excluded/redacted in logs. Reusable `requireAuth` loads the current database user/role on every protected request, and `requireRole('ADMIN')` checks that role. Private cart/order routes use authentication; ADMIN decisions also recheck and share-lock the operator's role inside their transaction.

Provision an administrator explicitly with `npm run admin:create`, operator-provided JSON credentials on stdin and `ADMIN_DATABASE_NAME` matching the chosen database. This CLI only creates accounts and never overwrites or promotes an existing user. See [auth contract](docs/api-contract.md#p05-authentication), [local setup and CLI](docs/local-development.md#p05-authentication-setup), and [verification/security limits](docs/p05-verification.md).


## Persistent carts (P06)

One case-sensitive router serves both canonical `/api/shopping-cart` and legacy `/api/ShoppingCart`. It implements public `GET /fake-shopping-cart`, private `GET /`, `POST /items`, `DELETE /items/:id` and `DELETE /items`. Only the demo is public; it is original synthetic content with null catalog IDs and no database/user dependency.

Add `{productId,modelId,memorySizeId,color,qty}` using a bearer token. The server validates configuration ownership and all availability flags, computes Decimal full-model price plus memory increment, and merges only an identical complete configuration. It ignores accepted legacy names/images/prices. All money is a two-decimal string in CNY. Limits are 99 units per line, 50 distinct lines and 500 units total. New lines return 201, merges 200, deletes/clear 204.

Owner row locks serialize mutations and cap checks; GET uses a consistent database snapshot and displays current catalog prices. Stored unit prices are add-time caches, not checkout authority. See [cart contract](docs/api-contract.md#p06-carts) and [P06 verification](docs/p06-verification.md).

The local frontend still uses its reducer/localStorage cart. Its API integration remains P12 work; no mock bridge or frontend changes were made.

## Atomic checkout (P07)

`POST /api/orders/place` with a bearer token and JSON `{}` purchases the current user's persisted cart. Send a new `Idempotency-Key` for each purchase intent (optional, 1–128 ASCII characters matching `[A-Za-z0-9][A-Za-z0-9._:-]*`). A first creation returns 201; an identical keyed retry returns the saved creation receipt with 200, even after cart consumption. Conflicting key reuse returns 409. Direct `{productId,modelId,memorySizeId,color,qty}` checkout is also supported and leaves the cart unchanged.

One PostgreSQL Read Committed transaction locks the owner and selected rows, checks a replay before the cart, validates live options/stock, calculates Decimal model-plus-memory prices, saves pending order/item/history snapshots and consumes purchased cart lines. The existing per-user key constraint prevents duplicates; recognized serialization/deadlock conflicts retry the entire transaction at most three times. This is explicit row locking, not database-wide Serializable isolation. No inventory reservation or payment processing is implied.

See [checkout contract](docs/api-contract.md#p07-checkout), [transaction design](docs/architecture.md#p07-checkout-boundary) and [actual PostgreSQL verification](docs/p07-verification.md). P07 required no schema or dependency changes. P08 preserves its snapshots and saved replay metadata.

## Order reads and decisions (P08)

- `GET /api/orders/:id`: owner or ADMIN; other users receive the same 404 as a missing order.
- `GET /api/orders`: only the caller's orders, including when the caller is ADMIN.
- `GET /api/admin/orders`: ADMIN-only list across owners.
- `POST /api/orders/:id/approve` and `/reject`: ADMIN-only, pending orders only. Repeated or competing terminal decisions return 409.

Lists accept `pageSize` (default 20, max 100), `sort` (`newest`/`oldest`) and an opaque `cursor`. They use indexed `(createdAt,id)` keyset pagination and return `meta:{pageSize,sort,hasMore,nextCursor}`. Order DTOs contain stored item snapshots and ordered status history, with Decimal money strings; no account records, password hashes, JWT claims or internal checkout metadata are exposed.

Decision bodies may be omitted or `{}`; optional canonical metadata is `{metadata:{note:"Reviewed"}}`. A bounded legacy string becomes a plain note and is marked deprecated. Status update and history insert commit in one PostgreSQL transaction. No payments, payment URI or reverse transitions are implemented.

P08 adds one reviewed pagination index migration. Apply it locally with `npm run db:migrate:dev`; never accept a reset. See [P08 contract](docs/api-contract.md#p08-order-reads-and-decisions) and [verification](docs/p08-verification.md).

## API documentation and Postman (P09)

Open `GET /docs` for Swagger UI and `GET /docs/openapi.json` for raw OpenAPI 3.1 JSON. UI assets are served locally, external validation is disabled and authorization is not persisted. The raw spec, HTML and supporting static assets use their declared content types outside the application envelope.

The [generated spec](docs/openapi.json) and [sanitized Postman collection](postman/CLU_Store_API.sanitized.postman_collection.json) cover all 17 historical method/path shapes plus current aliases and endpoints: 30 unique operations. Historical paths are functional; new payloads require the frontend adapter for `{success,data,meta}`. See the [Postman import/run guide](postman/README.md) before sending requests. Exported `baseUrl` and `accessToken` are empty and must be set privately. Synthetic example accounts/SKUs/orders are not provisioned.

```sh
npm run docs:generate
npm run docs:check
npm run test:docs
```

Routers take their methods/paths from `src/contracts/api.ts`, referencing the existing runtime Zod request schemas. Response serializers use types inferred from shared Zod DTOs. Both artifacts are generated from that catalog with Zod's native JSON Schema conversion; do not edit generated JSON. [Maintenance and validation](docs/openapi-maintenance.md) explains the source boundary, schema limitations and sensitive-source scan. [P09 verification](docs/p09-verification.md) records actual results. The original Postman collection stays external and is never a generation template.

## Quality gate (P10)

Run `npm run lint`, `npm run typecheck`, `npm test`, then `npm run build` with the local test database available. The default test command includes real transaction/concurrency checks, all historical paths and both cart aliases. A separate contract test inspects actual Express registrations against the checked-in OpenAPI spec.

[Quality-gate coverage and verification](docs/p10-verification.md) maps the roadmap requirements to executable tests and records results. [Test setup and CI](docs/testing.md) explains isolation, targeted commands and the GitHub Actions workflow. No production container/deployment is added by P10.

## Containers and self-hosting (P11)

The multi-stage Node 24 image generates the pinned Prisma 7 client, compiles TypeScript and runs as a non-root user with production dependencies. Compose supports `api` and `postgres`, persistent storage, readiness healthchecks and an explicit migration tools profile.

```sh
# Host Node development: start only the database.
docker compose up -d --wait postgres
# All containers: reviewed migrations are an explicit operator step.
docker compose build
docker compose --profile tools run --rm migrate
docker compose up --build -d --wait
```

A strong private JWT secret is required for the production-mode API. See [container operations](docs/operations.md) for environment/URL differences, admin CLI, logs, updates, backup/restore, security assumptions and troubleshooting. [P11 verification](docs/p11-verification.md) records actual local checks. The workflow runs PostgreSQL tests and container smoke checks without publishing images. Public TLS/DNS and cloud deployment remain future work.

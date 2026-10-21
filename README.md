# CLU Store API

P05 provides an Express 5 / strict TypeScript / ESM API foundation for Node 24 LTS, with Prisma 7, local PostgreSQL 18 and a provenance-backed response-sample and supplemental frontend demo seed. Public catalog/category/support reads are implemented. Registration, login, JWT authentication and role guards are implemented. Carts and orders arrive in later phases.

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

The default bind address is `127.0.0.1:3000`. Configure `HOST` explicitly for container access later. `env:local` generates private credentials into a new ignored `.env` and refuses to overwrite existing settings. See `.env.example` for validated configuration; `CORS_ORIGINS` accepts comma-separated exact HTTP(S) origins, and an empty value permits no browser cross-origin access. Requests without an Origin header are accepted.

```sh
npm run lint
npm run typecheck
npm test
npm run db:migrate:test
npm run test:integration
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

`npm test` runs database-independent regressions. `npm run test:integration` requires the guarded local test database and uses real PostgreSQL with rollback-only catalog fixtures and narrowly cleaned-up authentication identities; it fails rather than silently skipping when configuration/access is unavailable. See [P04 verification](docs/p04-verification.md) and [the read contract](docs/api-contract.md#p04-public-read-details).


## Authentication (P05)

`POST /api/auth/register` requires `{username,email,password,confirmPassword}` and returns a safe USER record. `POST /api/auth/login` accepts `{identifier,password}` (username or email) and returns `{user,token,tokenType,expiresIn,expiresAt}` inside `data`. The legacy `ConfirmPassword` registration field and login `username` alias remain accepted with deprecation metadata. Neither route returns a password hash.

Configure `JWT_SECRET` as 32 cryptographically random bytes encoded as 64 hex characters, plus `JWT_ISSUER`, `JWT_AUDIENCE` and `JWT_TTL_SECONDS` (default 900). `env:local` supplies a random key for **new** `.env` files; existing files are preserved and need the new key added explicitly. Missing secret disables authentication with 503 in development/test and rejects production startup. Invalid supplied secrets always reject startup.

Argon2id hashes use 64 MiB, three passes and one lane. Auth limits apply per IP before JSON parsing and per normalized identifier; passwords, hashes, bodies and headers are excluded/redacted in logs. Reusable `requireAuth` loads the current database user/role on every protected request, and `requireRole('ADMIN')` checks that role. P05 adds no cart/order routes.

Provision an administrator explicitly with `npm run admin:create`, operator-provided JSON credentials on stdin and `ADMIN_DATABASE_NAME` matching the chosen database. This CLI only creates accounts and never overwrites or promotes an existing user. See [auth contract](docs/api-contract.md#p05-authentication), [local setup and CLI](docs/local-development.md#p05-authentication-setup), and [verification/security limits](docs/p05-verification.md).

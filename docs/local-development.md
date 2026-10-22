# Local development

Local development uses the installed Docker engine with a dedicated PostgreSQL 18 Compose project. P04–P08 provide public reads, auth, carts, transactional checkout, scoped order reads and ADMIN decisions. Node 24 and npm 11 are required.

## First setup

Inspect `docker ps`, `docker compose ls`, `docker volume ls`, and occupied host ports before starting. The P02 inspection found port 5433 available and no collision with project `clu-store-api-local` or volume `clu-store-api-local_postgres_data`. Existing unrelated stopped containers and volumes were preserved.

```sh
npm ci
npm run env:local
# Review the chosen port; if changed, update all three port/URL settings in .env.
docker compose up -d --wait postgres
npm run db:generate
npm run db:migrate:dev
npm run db:migrate:test
npm run db:smoke
npm run db:seed
npm run dev
```

`npm ci` runs the `prepare` script to generate the Prisma client. `env:local` creates a new ignored `.env` with mode 0600 and random, separate bootstrap/development/test passwords. It refuses to overwrite an existing `.env`; merge missing settings manually if needed. `.env.example` contains placeholders, never usable secrets. Do not regenerate passwords for an existing volume without explicitly changing its database roles too.

## Connections and persistence

| Caller | URL pattern (placeholders only) |
|---|---|
| Host development process | `postgresql://clu_dev:<development-password>@localhost:5433/clu_store_dev` |
| Future API container on the Compose network | `postgresql://clu_dev:<development-password>@postgres:5432/clu_store_dev` |
| Host test tooling (`TEST_DATABASE_URL`) | `postgresql://clu_test:<test-password>@localhost:5433/clu_store_test` |
| Future test container on the Compose network | `postgresql://clu_test:<test-password>@postgres:5432/clu_store_test` |

Only `127.0.0.1:5433` is published. PostgreSQL listens internally on `5432`. The named volume is mounted at `/var/lib/postgresql`, the parent layout used by the [official PostgreSQL 18 image](https://hub.docker.com/_/postgres). Compose currently has only a `postgres` service; the API container is later work. Health requires successful queries to both databases.

On a fresh volume, `docker/postgres/init-databases.sql` creates both roles/databases. SQL reads passwords from environment variables with psql `\getenv` and quotes them as SQL literals. Existing volumes skip initialization. Stop with `docker compose stop postgres`; restart with `docker compose up -d --wait postgres`. Neither command deletes data. Do not use `down -v`, prune, or reset to fix migration/initialization failures.

## Test database protections

The development and test roles are separate non-superusers. The development role has CREATEDB solely for Prisma's temporary shadow database during `migrate dev`. The test role cannot create roles or databases. PUBLIC CONNECT is revoked on both application databases; each role can connect only to its own application database.

`db:migrate:test` and `db:smoke` validate `TEST_DATABASE_URL` before connecting: local hostname only, exact database `clu_store_test`, exact role `clu_test`, no query/hash options, and a database name different from `DATABASE_URL` even through host aliases. After connection, they check the actual database and role privileges. Test migration uses only `migrate deploy`, never `migrate dev` or reset. The smoke script proves that test credentials cannot connect to `clu_store_dev`.

`db:smoke` inserts synthetic integrity probes inside a transaction and always rolls them back. It does not seed or delete existing data and provides no reset command. PostgreSQL sequence counters may advance despite rollback; IDs are opaque and need not be contiguous. Unit/HTTP tests (`npm test`) do not load `.env` or connect to a database. Future integration suites must reuse these guards before any test data mutation.

## Migration workflow

Prisma CLI, client and PostgreSQL adapter are pinned together at 7.10.1. `prisma.config.ts` explicitly loads local environment configuration and supplies the datasource URL; `schema.prisma` uses the ESM `prisma-client` generator. Runtime uses `@prisma/adapter-pg`. See the [Prisma 7 upgrade guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7).

For a schema change, use `npm run db:migrate:dev -- --name <name> --create-only`, inspect generated SQL and manually reviewed checks, then apply with `npm run db:migrate:dev`. If drift/reset is requested, stop and investigate; never automatically accept a reset of a nonempty database. `npm run db:migrate:deploy` applies reviewed migrations to an explicitly selected durable environment. No `db push` workflow is provided. Initial migration review and actual command results are in [p02-verification.md](p02-verification.md).

## Readiness and shutdown

The server creates the Prisma client and pool from `DATABASE_URL`. `/ready` executes `SELECT 1`; success returns 200, while failure or timeout returns a sanitized 503. Missing configuration still returns 503, never false success. `DB_CHECK_TIMEOUT_MS` defaults to 2000 and bounds HTTP probe time as well as pool acquisition/SQL timeouts. Concurrent readiness probes share one in-flight database operation. `/health` remains process-only liveness. Readiness proves connectivity, not catalog availability or migration currency.

SIGINT/SIGTERM first drains HTTP requests, then disconnects Prisma and its pool within the configured shutdown deadline. Proxy trust remains disabled, and the generic limiter remains process-local.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start
# With PostgreSQL running:
npm run db:readiness:smoke -- 200
```

## P03 demo seed

`npm run db:seed` applies curated upserts only to local `clu_store_dev` using non-superuser `clu_dev`. It refuses production mode, test/remote database URLs, conflicting IDs and differing existing support content. It never creates users or prunes/reset data. `npx prisma db seed` is also configured, but the same guards apply. No schema migration was needed for P03.

All six response JSON files are now reconciled. This is labeled sample/demo data; ten summary-only products have no active sellable configuration. See [fixture-provenance.md](fixture-provenance.md) before changing or publishing catalog data. `/media/demo-placeholder.svg` is a local asset for P04 to serve; no static/business route is added here.

`npm run db:seed:verify -- before`, `-- after-first`, and `-- after-second` query actual database data and write exclusive snapshots under ignored `local-data/p03-seed-verification/`. The two post-seed snapshots must match in counts, IDs, values, relationships and sequence positions (automatic timestamps excluded). They also check unchanged user/cart/order counts. Existing verification files are preserved; archive them yourself before starting a new verification cycle. Set a distinct `SEED_VERIFY_RUN` such as `response-samples-v1` for a new run directory; earlier snapshots are preserved. Current results are in [p03-sample-reconciliation.md](p03-sample-reconciliation.md).

## P04 public read verification

Run `npm run db:migrate:test` followed by `npm run test:integration` after the database is healthy. This suite requires both database URLs, validates the actual test role/database, creates synthetic catalog/content fixtures inside individual Repeatable Read transactions and intentionally rolls each one back. A final count check confirms that category/product/configuration/marketing/support counts are unchanged. No test resets or seeds the development database. Default `npm test` excludes the integration directory explicitly; both suites are required for a full P04 check.

The runtime injects one Prisma client through the catalog read adapter. Product count/page/configuration reads share a snapshot; controllers have no direct database calls. `/media/demo-placeholder.svg` now serves the existing reviewed asset. See [p04-verification.md](p04-verification.md).


## P05 authentication setup

New `npm run env:local` files include a random 256-bit `JWT_SECRET`. Existing `.env` files are never replaced. Add a securely generated 64-hex key to an existing ignored `.env` or inject it from your secret manager, then restart the server. Do not copy `.env.example`'s placeholder as a real key. `JWT_ISSUER=clu-store-api`, `JWT_AUDIENCE=clu-store-client` and `JWT_TTL_SECONDS=900` are the defaults; keep issuer/audience consistent with the intended client.

With no `JWT_SECRET`, development/test can still serve catalog/liveness, while registration/login return 503 and startup logs that authentication is disabled. Production requires the key. Any supplied invalid key fails environment validation without logging its value. `/ready` continues to report database connectivity only; it is not an authentication-configuration probe.

The admin CLI reads at most 4096 bytes of JSON from stdin, using canonical `{username,email,password,confirmPassword}` only. Supply your own long password, preferably through a password manager's pipe. For a private input file kept in the ignored `local-input/` directory with owner-only permissions:

```sh
ADMIN_DATABASE_NAME=clu_store_dev npm run admin:create < local-input/admin-credentials.json
```

This is an explicit command, not a startup/seed hook. It checks the configured URL database and actual connected database against `ADMIN_DATABASE_NAME`, hashes the password and creates a new ADMIN. The CLI does not accept a password argument or password environment variable, never prints credentials/hashes, and never overwrites a duplicate user or promotes an existing account. It prints only safe account fields. Remove private input material when no longer needed. No development admin was provisioned during implementation.

Authentication integration tests require the same guarded `clu_store_test`/`clu_test` target as P04:

```sh
npm run db:migrate:test
npm run test:integration -- tests/integration/auth.test.ts tests/integration/public-reads.test.ts
npm test
npm run lint
npm run typecheck
npm run build
```

The auth suite generates a fresh signing key/password per run, creates uniquely named test users and performs real concurrent inserts. Its finalizer deletes only the exact usernames allocated by that run and asserts the user count equals the initial count. CLI verification creates an admin only in the test database and removes it afterward. It never resets/truncates the database or touches development accounts. Catalog fixtures still roll back. A force-killed test process can leave its prefixed test users; inspect those identities explicitly rather than resetting shared data.

`npm test` includes configuration, Pino redaction, malformed-JSON rate limiting and bounded-password-work checks without a database. Supertest still needs permission to bind localhost. See [P05 verification](p05-verification.md) for actual command outcomes and [the auth contract](api-contract.md#p05-authentication) for token/lifecycle limitations.


## P06 cart verification and integration

P06 uses the existing database/schema and JWT configuration; no dependency installation, migration, seed update or development account creation is required. Both `/api/shopping-cart` and `/api/ShoppingCart` expose the same router. Private operations need a valid P05 token and configured database; the synthetic demo is independently available without either dependency.

```sh
npm run db:migrate:test
npm run test:integration -- tests/integration/cart.test.ts
npm run lint
npm run typecheck
npm run build
```

The cart suite validates the guarded test database/role, creates users and catalog options with generated identities, then exercises actual committed transactions and concurrent requests. Per-test cleanup deletes only those exact users/products and their dependent test records. Final counts for User, Cart, CartItem, Product, ProductModel, ProductMemorySize and ProductColor must match the initial counts. No reset/truncate is used and development data is untouched. A killed test process may leave its own generated fixtures; inspect them explicitly rather than resetting shared data.

The full integration suite also covers auth/catalog behavior after shared app wiring changes. See [P06 verification](p06-verification.md). The sibling frontend was inspected read-only: its cart uses a reducer and localStorage. Frontend API integration remains P12 work.

## P07 checkout verification

P07 reuses the existing Prisma schema, initial migration, JWT settings and local PostgreSQL service. There are no dependency installations, schema changes or development seeds. Ensure the existing database is healthy and use the guarded test target:

```sh
npm run db:migrate:test
npm run test:integration -- tests/integration/orders-place.test.ts
npm run test:integration
npm test
npm run typecheck
npm run lint
npm run build
```

Checkout tests use real committed PostgreSQL transactions and Promise.all HTTP requests. They generate test identities/options, observe lock waits through `pg_stat_activity`, test simultaneous keys/cart writes/catalog updates and assert exact snapshot totals/replays. Fault tests create narrowly scoped, randomly named test-only triggers/functions/sequences that fail history insertion or cart deletion **after partial order writes exist**. SQLSTATE 23514 checks rollback without retry; 40001/40P01 exercise the actual Prisma adapter/retry path. These faults are injected database exceptions, not claims that PostgreSQL naturally selected a deadlock victim in that case. No production fault hook or database mock is used.

The test URL and connected role/database guards run before DDL or data mutation. Fault objects are removed in finally; test cleanup deletes only exact allocated order/history/item/user/catalog IDs. Counts of ten affected tables must match their pre-suite values afterward. No reset, truncate, development mutation or unrelated container/volume deletion is performed. A force-killed run may leave its own `p07_fault_*` objects or test fixtures; inspect exact ownership before manual removal, never reset shared data. Sequence counters may advance after rollback. See [P07 verification](p07-verification.md) for actual commands/results and the [checkout contract](api-contract.md#p07-checkout) for client retries.

## P08 order management verification

P08 adds one reviewed B-tree index migration for global order pagination. It is additive and preserves the initial migration's custom constraints. Apply it to the selected local development database with `npm run db:migrate:dev`; stop if drift/reset is requested. The guarded `db:migrate:test` applies it separately to the test database. No new environment settings, dependencies, seed data or development administrator are required.

```sh
npm run db:generate
npm run db:migrate:dev
npm run db:migrate:test
npm run test:integration -- tests/integration/orders-management.test.ts
npm run test:integration
npm test
npm run typecheck
npm run lint
npm run build
```

The P08 suite creates two ordinary users, one ADMIN and orders through real P07 checkout using generated credentials in the guarded test database. It verifies scoped snapshot/history reads, both list sorts and cursor boundaries, metadata normalization, all authorization/state errors and opposite decisions launched with Promise.all. A separate connection holds the order lock until both UPDATE waiters are observed in PostgreSQL. The assertions re-query stored status/history/operator after the race.

A narrowly scoped random `p08_fault_*` trigger/function/sequence injects a history failure after the conditional state update; cleanup removes those objects in finally. A separate concurrent demotion test holds the operator row and proves transaction-time role validation rejects a stale request-start ADMIN role. Test fixtures are deleted by exact IDs, and ten table counts must match their initial values. No reset/truncate, development test rows or unrelated Docker changes are used. See [P08 verification](p08-verification.md) for actual outputs.

For manual development ADMIN access, use the existing explicit `admin:create` CLI with operator-provided credentials. P08 never seeds or silently creates a local administrator. JWT/database setup requirements from P05 still apply.

# Local development

P03 uses the installed Docker engine with a dedicated PostgreSQL 18 Compose project. Application/business endpoints remain later work. Node 24 and npm 11 are required.

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

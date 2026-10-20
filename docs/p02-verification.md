# P02 verification record

Verified locally on 2026-10-20 (America/Los_Angeles). Initial branch: `main`; initial `git status --short` was empty. No AGENTS.md was present in the repository or inspected parent locations. No existing user changes were overwritten. No commit, push, PR, remote database or deployment was performed.

## Isolation and migration review

The installed Docker Desktop engine was reused. Initial `docker ps` and `docker compose ls` showed no running containers/projects. Occupied host ports did not include 5433. A separate stopped-container/volume inventory identified unrelated resources, all preserved.

Selected project: `clu-store-api-local`; volume: `clu-store-api-local_postgres_data`; host binding: `127.0.0.1:5433`; container port: `5432`. PostgreSQL 18 runs with separate `clu_store_dev` / `clu_store_test` databases and `clu_dev` / `clu_test` roles. Private random credentials live only in ignored `.env`.

Migration `20261020225536_initial` was generated with `--create-only`, inspected before application, and supplemented with SQL-only identity, amount, idempotency and history checks. Review confirmed 14 models, integer catalog/order IDs, UUID users, Decimal(12,2) amounts, explicit foreign-key delete behavior, product-owned SKU constraints, nullable editorial links, one reusable active cart per user, nullable per-user idempotency uniqueness, and required indexes. No destructive SQL or fixture imports were included. Runtime authorization and transactional checkout remain later phases.

## Commands and exits

Commands were run from the repository root. Credentials were not printed. Chained commands below proceeded only when preceding steps succeeded except the outage probe, where restart was attempted even if the probe failed.

| Exact command | Exit / observation |
|---|---|
| `git status --short` | 0; initially clean |
| `git branch --show-current` | 0; `main` |
| `docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}'` | 1 inside sandbox (socket access denied); 0 with approved local engine access |
| `docker compose ls` | 0; no active projects initially |
| `lsof -nP -iTCP -sTCP:LISTEN` | 0; port 5433 unused |
| `docker ps -a --format '{{.Names}}\t{{.Status}}'` | 0; unrelated stopped containers identified |
| `docker volume ls --format '{{.Name}}'` | 0; new project volume name unused |
| `docker context show` | 0; `desktop-linux` |
| `npm view prisma@7 version` | 0; selected stable 7.10.1 |
| `npm view @prisma/adapter-pg@7 version` | 0; matching 7.10.1 available |
| `npm install --save-exact @prisma/client@7.10.1 @prisma/adapter-pg@7.10.1 pg@8` | 0; exact versions saved; audit reported 0 vulnerabilities |
| `npm install --save-dev --save-exact prisma@7.10.1 @types/pg@8` | 0; matching CLI; audit reported 0 vulnerabilities |
| `npm run env:local` | 0; exclusively created private ignored `.env` |
| `npm run db:validate` | 0; schema valid |
| `npm run db:generate` | 0; Prisma Client 7.10.1 generated |
| `docker compose up -d --wait postgres` | 0 initially, but initial healthcheck was insufficient; see repaired initialization below. Final corrected service is healthy. |
| `npm run db:migrate:dev -- --name initial --create-only` | 1 before initialization repair; 0 after repair; generated unapplied initial migration |
| `npm run db:migrate:dev` | 0; reviewed initial migration applied to development; schema in sync |
| `npm run db:migrate:test` | 0; guard verified test target/role; `migrate deploy` applied initial migration to test |
| `npm run db:smoke` | 1 on incorrect expected RESTRICT SQLSTATE; 0 after assertion correction; 28 checks passed, synthetic rows rolled back |
| `docker compose stop postgres` | 0; only this project's service stopped for outage verification |
| `npm run db:readiness:smoke -- 503` | 0; real unavailable DB returned 503; liveness remained 200 |
| `docker compose up -d --wait postgres` | 0; restored project service |
| `npm run db:readiness:smoke -- 200` | 0; real DB returned 200 after restart; liveness 200 |
| `./node_modules/.bin/prisma format` | 0; formatted schema |
| `./node_modules/.bin/prisma migrate status` | 0; one migration, database up to date |
| `npm run lint` | Initial 1 for caught-error cause preservation; final 0 after correction |
| `npm run typecheck` | 0; source, scripts and tests checked |
| `npm test` | 0; 28 tests in 2 files passed with local socket access |
| `npm run build` | 0; strict TypeScript/ESM build succeeded |
| `docker compose ps` | 0; project PostgreSQL healthy on loopback 5433 |
| `git diff --check` | 0; no tracked diff whitespace errors |

After smoke execution, both databases returned zero User rows and zero Product rows using these read-only commands (all exit 0):

```sh
docker compose exec -T postgres psql -U clu_bootstrap -d clu_store_dev -c 'SELECT count(*) AS users FROM "User";' -c 'SELECT count(*) AS products FROM "Product";'
docker compose exec -T postgres psql -U clu_bootstrap -d clu_store_test -c 'SELECT count(*) AS users FROM "User";' -c 'SELECT count(*) AS products FROM "Product";'
```

## Repaired verification failures

The initial shell initializer could not execute from the Docker Desktop bind mount (`bad interpreter: Permission denied`). PostgreSQL itself started, and its original availability-only healthcheck was misleading. Inspection proved that only the bootstrap role and standard databases existed. The initializer was changed to plain SQL, and health now queries both application databases. The same project volume was retained. The following commands repaired this specific verified-new volume, all exit 0:

```sh
docker compose up -d postgres
docker compose exec -T postgres psql -U clu_bootstrap -d postgres -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/10-clu-databases.sql
docker compose up -d --wait postgres
```

The manual initializer is not a general recovery/reset command; it is not idempotent. New volumes use the SQL entrypoint automatically. Existing data was never reset or removed.

The first constraint smoke expected foreign-key SQLSTATE `23503` for a RESTRICT deletion. PostgreSQL correctly returned `23001`; only the assertion was corrected. The failed smoke transaction rolled back in `finally`.

## Scope of evidence

Smoke checks cover migrations, PostgreSQL 18, test-role isolation, normalized identity uniqueness, full-SKU uniqueness, cross-product option rejection, positive quantities/nonnegative money, per-user/null idempotency keys, fingerprint checks, CNY, snapshot line arithmetic, historical RESTRICT, editorial SetNull, cart cascade, Decimal serialization, and real readiness. Unit/HTTP tests cover readiness failure/timeout/coalescing/recovery and test URL guard negatives alongside P01 behavior.

Readiness checks database connectivity only. No business API, seed catalog, payment, order transition service, or checkout transaction is implemented in P02. Future tests must reuse the guarded test database workflow. PostgreSQL is left running for development; no unrelated container or volume was changed.

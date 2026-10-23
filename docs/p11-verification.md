# P11 packaging verification — 2026-10-22

## Baseline and changes

Started clean on `main` at `4110391` (P10). Inspected Compose, Prisma schema/config/migrations, package/lockfile, application/database/server source, current docs and CI. No applicable AGENTS.md was found. Existing graceful SIGTERM/SIGINT shutdown was retained and verified in the real container; no business code or dependency version changed.

Added `Dockerfile`, `.dockerignore`, and [operations documentation](operations.md). Updated Compose with API and an explicit tools-profile migration job, `.env.example` with API mapping settings, README/local-development instructions, and the existing GitHub Actions workflow with container build/migration/readiness probes. Node 24 Debian/glibc is shared between build/runtime for native compatibility. Prisma generation uses the pinned 7.10.1 packages. Production installation omits dev/peer/optional packages; required Linux Argon2 prebuilds are included in its package and verified directly.

The final runtime image is **513,232,906 bytes** uncompressed (Docker's reported size), runs as UID 1000 (`node`), and contains no Prisma CLI, source directory or private `.env`. It includes only production dependencies, compiled output and public assets. The tools target retains source/CLI for operator jobs. Base major tags are mutable; this build resolved Node **24.22.1**, npm 11.19.1. No image was published. Architecture is the local Docker engine's architecture; another architecture was not tested.

## Isolation

Read-only inspection found the existing healthy `clu-store-api-local` PostgreSQL service at loopback 5433 and unrelated `delivery-geo-intelligence` MongoDB at 27017. Neither was changed. Other volumes were preserved.

All packaging execution used:

```sh
docker compose --env-file local-data/p11/compose.env -p clu-store-p11 ...
```

That ignored owner-only environment file contains freshly generated private credentials, with DB port **5544** and API port **3101**. The project owns `clu-store-p11_postgres_data`; no existing volume was removed. Host DB URLs use localhost:5544; Compose injects postgres:5432. Private credentials were never used as build args or copied into build context/images. Raw logs are in ignored `logs/p11/`; backup/environment material stays under protected ignored `local-data/p11/`.

## Executed checks

Every successful command below exited 0, except the intentional production seed refusal (expected exit 1, asserted by the caller).

| Command/check (with isolated Compose prefix above) | Actual result |
|---|---|
| `config --quiet` | Configuration valid without printing resolved secrets. |
| `build` | Multi-stage runtime built; explicit Prisma generation, TypeScript compilation and native Argon2 probe passed. |
| `up -d --wait postgres` | Fresh PostgreSQL 18 initialized with separate dev/test roles/databases and private volume. |
| `--profile tools run --rm migrate` twice | Both checked-in migrations applied on first run; second reported no pending migrations. No reset/db push. |
| `up --build -d --wait` | API and PostgreSQL both healthy. Repeated after runtime image reduction. |
| `curl --fail http://127.0.0.1:3101/health` | 200; liveness success envelope. |
| `curl --fail http://127.0.0.1:3101/ready` | 200; database up envelope using real adapter connection. |
| `curl --fail 'http://127.0.0.1:3101/api/products?pageSize=1'` | 200 from the seeded database through the runtime image. |
| Runtime Node/Argon2 probe | UID 1000; native hash/verify passed; CLI/source/private environment absent. |
| `stop api` / `kill -s SIGINT api` | Both exited 0; logs record each signal, HTTP stop and database pool stopped. API restarted healthy afterward. |
| Explicit guarded seed twice in one tools container | Full before/after snapshots compared; both post-seed hashes identical. |
| Seed in default production-mode tools job | Refused with expected exit 1; no seed transaction committed. |
| `pg_dump -Fc`, new restore DB, `pg_restore --exit-on-error --no-owner --role=clu_dev` | Synthetic backup restored successfully into new `clu_restore_check`; 25 products verified. No live DB overwrite. |
| Isolated guarded `scripts/migrate-test.ts` | Reviewed migrations applied to clu_store_test as restricted clu_test. |
| `npm run lint` | Passed. |
| `npm run typecheck` | Passed. |
| `npm test` with isolated environment | **318 passed, 0 failed, 0 skipped**, 12 files, 13.75 seconds. Real PostgreSQL rollback/concurrency/auth/cart/order tests included. |
| `npm run build` | Passed. |
| Workflow YAML parse and `git diff --check` | Passed. |

Seed verification used one disposable tools container so its three snapshot files shared a lifetime:

```sh
# Prefix: docker compose --env-file local-data/p11/compose.env -p clu-store-p11
# --profile tools run --rm -e NODE_ENV=development -e SEED_VERIFY_RUN=p11 migrate
sh -c 'node --import tsx scripts/seed-verify.ts before && npm run db:seed && node --import tsx scripts/seed-verify.ts after-first && npm run db:seed && node --import tsx scripts/seed-verify.ts after-second'
```

Both snapshots had 3 categories, 25 products, 37 models, 62 memories, 63 colors, 6 inactive offers, 8 arrivals and 1 support record. Users/carts/orders/history remained zero. Snapshot hash: `eefcbaad2f99caaab417c0b00e4a429cfc18387a088d6b87468454c78d688ce8`. Original numeric IDs and fixture relationships passed the existing verifier. The restore drill affected only the new check DB in this isolated instance.

## Repairs and limits

The initial seed-verification helper failed to create its snapshot directory as the non-root tools user. The tools stage now creates an owned `local-data` directory. No seed ran before that failure. A subsequent complete seed comparison passed.

The first runtime dependency install still included Prisma's optional CLI/TypeScript peers despite `--omit=dev`; omitting peer **and optional** packages removed them. Native hash verification, health/readiness and a catalog DB query passed on the final reduced image. Only affected image/probe checks were repeated after those packaging changes; application source remained unchanged after the 318-test run.

The existing shutdown handlers were observed under idle/probe traffic; this is not a long-running production load/drain benchmark. `/ready` checks connectivity only. The supplied role retains host-development CREATEDB privileges, and public TLS/proxy/shared-limiter/token lifecycle hardening remains operator work, as documented. Startup performs no implicit schema migration or seed.

CI now runs npm ci, quality checks with real PostgreSQL, image build, explicit migration and container probes using fresh random credentials and a run-specific Compose project. **Remote GitHub Actions has not been executed**; local YAML validity and equivalent local execution do not establish a remote PASS. No clean host npm ci was repeated because dependencies/lockfile were unchanged; Docker builds did execute clean lockfile installs.

Final isolated services are left healthy on localhost:3101/5544, with their private volume and restored check DB retained for inspection. To stop them without removing data, use the same prefix with `stop`. No blocker remains for the performed local checks. Changes remain uncommitted; no push, PR, image publication or remote deployment occurred.

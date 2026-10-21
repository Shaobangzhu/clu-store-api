# P07 checkout verification

Verified locally on 2026-10-21. The initial working tree was clean on `main` at `976d768 feat(cart): persist user carts with trusted sku pricing`. README, API/data/architecture/development docs, auth/cart/database/middleware source, Prisma schema and the reviewed initial migration were inspected before edits. No applicable AGENTS.md was found in the repository or ancestor directories. Existing code, the private `.env`, development data and unrelated Docker resources were preserved.

## Implemented behavior

Authenticated `POST /api/orders/place` accepts explicit JSON `{}` for the current user's persisted cart, or a validated single SKU for direct checkout. Direct checkout leaves the cart unchanged. Bounded legacy display/price fields are discarded; unknown owner/total/shipping/payment/status/metadata properties are rejected. Every amount comes from live Decimal full-model price plus memory increment; startingPrice and cached cart prices are ignored.

The optional key policy follows the P07 request and amends the previous mandatory-key plan. Keys are 1–128 ASCII characters matching `[A-Za-z0-9][A-Za-z0-9._:-]*`; duplicate wire headers are rejected. A versioned SHA-256 fingerprint includes mode and canonical direct-SKU fields. Cart fingerprints represent the intent, so replay remains valid after consumption or subsequent cart edits. The creation receipt is persisted in server-owned order metadata, enabling an exact response-body replay even after catalog or future order-status changes. Creation returns 201; replay returns 200; conflicting mode/direct payload returns 409.

The existing schema is sufficient. No dependencies, schema objects in development, migrations, fixture imports, seeds, frontend changes or admin credentials were added. P08 order reads and ADMIN transitions remain separate work. [The contract](api-contract.md#p07-checkout) lists the precise request, receipt, errors and compatibility limits.

## Transaction and concurrency design

One Prisma interactive transaction runs at PostgreSQL **Read Committed**. It acquires the same owner User `FOR UPDATE` lock as every P06 cart mutation. After acquisition, it checks the persisted key before any cart validation, locks owned cart lines, joins and share-locks all selected product/model/memory/color rows, revalidates stock/ownership/quantity/monetary bounds, inserts the pending order and immutable item descriptions/prices, records null-to-pending history, saves the receipt, and deletes exactly the purchased cart lines. All writes commit or roll back together. The cart row is reused.

The initial migration's unique `Order_userId_idempotencyKey_key` remains the final protection for `(userId,idempotencyKey)`. Both key/fingerprint are null on unkeyed orders; different users can use the same key. The cart owner/full-SKU unique indexes and composite option foreign keys are preserved. Extracting the shared owner lock changes no P06 mutation behavior.

Recognized Prisma P2034 conflicts retry the entire transaction at most three times, after 20/40 ms delays. The pinned pg adapter maps PostgreSQL SQLSTATE 40001 (serialization failure) and 40P01 (deadlock) to P2034. Exhaustion returns 503 CHECKOUT_BUSY. Constraint errors, validation failures, timeouts and unknown commit outcomes are not retried. Acquisition is bounded at 5 seconds and transaction execution at 10 seconds, additionally subject to the configured pool/statement/query timeouts.

This is a cooperating row-lock protocol at Read Committed. The implementation does **not** enable PostgreSQL Serializable isolation or claim a global serializability proof. The design follows [PostgreSQL 18 transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html) and [row-lock behavior](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS); tests provide observations of the specified interleavings.

## Actual commands and results

| Command | Exit/result |
|---|---|
| `git status --short` | 0; initially empty |
| `git branch --show-current` | 0; `main` |
| `git log -5 --oneline` | 0; existing P06 at HEAD |
| `docker ps --format '{{.Names}} {{.Ports}} {{.Status}}'` | 0; reused healthy local PostgreSQL on `127.0.0.1:5433` |
| `docker compose ls` | 0; existing `clu-store-api-local` project |
| `npm run db:migrate:test` | 0; guarded `clu_store_test`, one migration, no pending migrations |
| `npm run test:integration -- tests/integration/orders-place.test.ts` (first) | 0; **45 passed**, 1.83 s |
| Same focused command after JSON/catalog-wait coverage | 0; **48 passed**, 1.95 s |
| `npm run test:integration` | 0; **172 passed**, four files, 7.95 s |
| `npm test` | 0; **51 passed**, four files, 303 ms |
| `npm run typecheck` | 0; app plus tests/scripts/config |
| `npm run lint` | 0 |
| `npm run build` | 0 |
| Same focused command after strengthening the fault counter | 0; **48 passed**, 2.25 s |
| `npm run typecheck && npm run lint` after that test-only change | 0 |
| Guarded read-only test database cleanup inspection | 0; zero P07 triggers/functions/sequences remaining |
| `git diff --check` | 0 |

Two initial typecheck runs exited 2 during implementation: the cart/direct line union needed an explicit shared type, and Supertest's typed single-header overload did not accept an array. Both were repaired before database tests. Duplicate headers now use its header-object API. All database runs passed. Final production code was unchanged after the 172-test full run and build; the later test-only change ensures a sequence with `is_called=false` reports zero injected failures, followed by a focused rerun and typecheck/lint. Subsequent edits were documentation only.

Recorded final console summaries:

```text
Test Files  4 passed (4)
     Tests  172 passed (172)
  Duration  7.95s

Test Files  4 passed (4)
     Tests  51 passed (51)
  Duration  303ms

Test Files  1 passed (1)
     Tests  48 passed (48)
  Duration  2.25s

{"testDatabaseGuard":"passed","remainingP07FaultObjects":{"triggers":0,"functions":0,"sequences":0}}
```

The read-only cleanup command used `node --env-file=.env --import tsx --input-type=module` with `testDatabaseUrl` and `assertTestConnection`, then counted `p07_fault_%` entries in `pg_trigger`, `pg_proc` and sequence entries in `pg_class`. It printed only the guard result and counts, never credentials or connection strings.

## Observed PostgreSQL behavior

- Three same-key HTTP requests ran through Promise.all while a separate PostgreSQL connection held the owner's row lock. The test observed at least three lock waiters in `pg_stat_activity`, released the lock, and received one 201 plus two 200 responses with identical bodies, one order and one initial history entry.
- Different users concurrently using one key created separate owned orders. Different keys competing for one cart produced one creation and one EMPTY_CART, without a duplicate purchase. Concurrent cart add/checkout preserved the sum of purchased and remaining quantities.
- A concurrent catalog writer held a model row while checkout attempted its live SKU query. The test observed the lock wait, committed the writer, and verified either the new 12.10 unit total or PRODUCT_UNAVAILABLE with the cart preserved.
- Live pricing, two distinct configurations and quantities produced 83.70 exactly from 22.20 + 61.50. Cart caches had been set to 0.01 and startingPrice was 999.99, demonstrating that neither influenced checkout. Later product/model/memory descriptions and price changes left stored snapshots and replay unchanged.
- Empty carts, invalid/cross-product configurations, all four stock flags, excessive persisted quantity and unit/line/subtotal Decimal overflow returned stable 422 errors without consuming the cart. Unknown fields, missing/unparsed bodies, invalid headers/queries and token failures were rejected.
- Direct checkout ignored tampered names/images/prices, preserved the cart, replayed across changes to ignored fields and conflicted on changed quantity/configuration/mode. Keyless direct requests created separate orders as documented. The database unique constraint independently rejected a duplicate keyed insert with P2002.
- Test-only PostgreSQL triggers raised 23514 during history insertion or after cart deletion, after asserting partial order/item writes existed. The service returned a nonleaky 500, made one attempt, and left no order/item/history while preserving the original cart. Removing the scoped fault let the same key succeed.
- PostgreSQL triggers raised 40001/40P01 during deletion. The actual Prisma adapter produced the recognized conflict path: one rollback plus one retry created only one order/history. Repeated 40001 produced exactly three attempts, CHECKOUT_BUSY and an intact cart; retry succeeded after removing the fault. These are real database-injected errors testing rollback/driver mapping, not claims that the test naturally generated a serialization anomaly or deadlock cycle.

## Data preservation and residual risks

The local test URL and actual role/database guards run before any writes/DDL. Each case generates its own identities/catalog rows and cleanup addresses only those exact IDs. Fault triggers/functions/sequences use random names, target only the allocated user/cart and are removed in finally. Ten affected table counts match pre-suite counts; the separate read-only inspection also found no remaining fault objects. No reset/truncate or unrelated container/volume deletion was performed. Sequence counters can advance despite rollback.

Availability remains boolean: there is no inventory count/reservation, payment, shipping or tax operation. Direct SQL writers can bypass owner locks and mutate snapshots/metadata; future writers must preserve these application invariants. Metadata has a reserved versioned creation receipt; P08 transitions must retain it. Corrupt or pre-P07 keyed rows lacking a supported receipt fail safely and are not automatically rewritten. There is no idempotency expiry or purge mechanism. Optional keyless requests cannot recover an uncertain commit safely, so clients should retain keys and retry with the same body. Timeouts and resource contention still require operational monitoring; these tests are not a load benchmark.

P08 prerequisites: owner/ADMIN order reads, conditional pending-to-approved/rejected transitions with atomic history, preservation of snapshots and replay metadata, and fresh status DTOs distinct from the creation receipt. P12 still owns frontend adapter/cart/checkout integration.

## Files and repository state

- New checkout domain: `src/modules/orders/{routes,schemas,repository,service,serializer,retry}.ts`.
- Shared locking: new `src/modules/cart/locking.ts`, reused by `src/modules/cart/repository.ts`.
- Wiring/error codes: `src/app.ts`, `src/server.ts`, `src/lib/errors.ts`.
- Tests: `tests/integration/orders-place.test.ts`, `tests/helpers/checkout-fault.ts`.
- Documentation: `README.md`, `docs/api-contract.md`, `docs/architecture.md`, `docs/data-model.md`, `docs/local-development.md`, this verification record.

All changes remain local and uncommitted on `main`. No push, pull request, publication or deployment was performed.

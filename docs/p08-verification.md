# P08 order management verification

Implementation and executable checks ran locally on 2026-10-21; documentation and final working-tree review completed on 2026-10-22. The initial working tree was clean on `main` at `f523e13 feat(orders): implement transactional checkout and idempotency`. README, repository contract/architecture/data/development docs, current order/auth/cart infrastructure, Prisma schema and migrations were inspected. No applicable AGENTS.md was found in the repository or ancestor directories. Existing P07 work and private configuration were preserved.

## Implemented scope

- `GET /api/orders/:id`: owner or ADMIN, with identical 404 responses for a foreign USER order and a missing order.
- `GET /api/orders`: caller's orders only, including when the caller is ADMIN.
- `GET /api/admin/orders`: ADMIN-only all-owner list.
- `POST /api/orders/:id/approve` and `/reject`: authenticated ADMIN, pending-to-terminal only, with one atomic state/history transaction.

Lists use bounded keyset pagination: pageSize defaults to 20 and is capped at 100; newest/oldest sort by createdAt and ID in the same direction. Strict versioned cursors carry the position and sort, never authorization. Each read uses a Repeatable Read snapshot with sequential batched item/history loading. DTOs explicitly expose stored item snapshots and current history, with Decimal strings, without account relations, credentials, JWT claims or internal checkout metadata.

Canonical decision metadata is a bounded `{note:string}`. A legacy string becomes a plain note and is marked deprecated. It is never parsed as JSON or trusted for operator/status/payment data. The receipt in Order.metadata, item snapshots, prices and currency are preserved. P07 replay still returns its original creation response; current-state GETs report the terminal status.

See [the full P08 contract](api-contract.md#p08-order-reads-and-decisions) for fields, caps, error codes and pagination behavior.

## Atomic state decisions

HTTP routes require both requireAuth and requireRole('ADMIN'). Inside one real PostgreSQL Read Committed transaction, the repository share-locks the operator User row and rechecks its role. This prevents a role demotion/deletion from crossing the authorized mutation while allowing two decisions by the same ADMIN to compete at the order row.

The state change is a parameterized conditional UPDATE with `WHERE id = :id AND status = 'pending' RETURNING updatedAt`. Only the winner inserts a terminal history entry. Its operator comes from authentication, fromStatus is pending, target comes from the route, and createdAt equals the returned database updatedAt. Missing orders return 404; existing terminal orders return 409. A history failure rolls back status and updatedAt. No reverse transition, external side effect, payment gateway or fake paymentUri is implemented.

The update predicate is re-evaluated after a competing PostgreSQL updater commits, according to [PostgreSQL Read Committed behavior](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-READ-COMMITTED). The operator protection uses [PostgreSQL row locking](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS). This is not a claim of database-wide Serializable isolation. Decision errors are not automatically retried; clients can read status/history after an uncertain network outcome.

## Reviewed migration

`20261021000000_order_list_index` adds only `Order_createdAt_id_idx` on `(createdAt,id)`. The existing `(userId,createdAt,id)` index supports owned lists. No old indexes, custom checks, columns or data are removed. The migration was applied separately to guarded local `clu_store_test` and verified local `clu_store_dev`. Development migrate status confirmed two migrations and an up-to-date schema. No reset or db push was used.

The test proves both index definitions exist; it is not a production query-plan or load benchmark. The SQL uses tuple keyset comparisons without offset scans or mandatory full-table counts.

## Actual commands and results

| Command | Exit/result |
|---|---|
| `git status --short` | 0; initially empty; final changes are scoped P08 work |
| `git branch --show-current` | 0; main |
| `git log -2 --oneline` | 0; P07 at HEAD |
| `npm run db:generate` | 0; Prisma 7.10.1 client generated |
| `docker compose ps` | 0; existing PostgreSQL healthy on 127.0.0.1:5433 |
| `npm run db:migrate:test` | 0; applied the additive index to guarded clu_store_test |
| `npm run test:integration -- tests/integration/orders-management.test.ts` | 0; **54 passed**, 2.22 s |
| `npm run test:integration` | 0; **226 passed**, five files, 9.03 s |
| `npm test` | 0; **51 passed**, four files, 310 ms |
| `npm run typecheck` (final) | 0; application, tests, scripts and configuration |
| `npm run lint` (final) | 0 |
| `npm run build` | 0 |
| Local development URL/actual-role guard, then `npm run db:migrate:dev` | 0; applied the reviewed index; schema in sync, no reset requested |
| Guarded read-only test fault-object inspection | 0; zero remaining P08 triggers/functions/sequences |
| `./node_modules/.bin/prisma migrate status` | 0; two migrations; local development schema up to date |
| `git diff --check` | 0 |

An initial lint run exited 1 for two unused initial assignments in test lock-wait variables and one multiline test invocation. These test-only issues were repaired before the full integration/regression run and final typecheck/lint/build. The first focused PostgreSQL run already passed all 54 cases. Production code did not change after the full checks; subsequent work applied the same reviewed index locally and updated documentation. Prisma's status command printed a newer release-candidate notice; dependencies were not upgraded.

Actual console summaries:

```text
Test Files  1 passed (1)
     Tests  54 passed (54)
  Duration  2.22s

Test Files  5 passed (5)
     Tests  226 passed (226)
  Duration  9.03s

Test Files  4 passed (4)
     Tests  51 passed (51)
  Duration  310ms

Your database is now in sync with your schema.
Database schema is up to date!

{"testDatabaseGuard":"passed","remainingP08FaultObjects":{"triggers":0,"functions":0,"sequences":0}}
```

## Observed integration behavior

The P08 suite uses two USER accounts and one ADMIN, with randomly generated credentials and real orders created through P07 checkout. Cases cover:

- Own detail/history, ADMIN detail across owners, foreign/missing 404 equivalence, own-only lists even for ADMIN, and ADMIN global lists.
- Both sorting directions, timestamp ties, bounded cursors, sort mismatches, empty/beyond-end pages and a foreign cursor that never bypasses ownership.
- Safe stored snapshots after live catalog edits, nullable historical product references, and suppression of unsupported history metadata.
- Successful approval and rejection on separate orders, exact operator/from/to/timestamp history, unchanged receipt/items/totals, repeated and cross-terminal 409 responses, and P07 exact replay after approval.
- Normalized legacy strings, bounded structured notes, absent metadata/body, invalid metadata/IDs/queries, rejected unparsed payloads, missing/invalid authentication, USER transition denial, missing ADMIN targets and no unapprove route.
- Simultaneous approve/reject through Promise.all: an independent connection held the order lock until **two UPDATE lock waiters** were observed in pg_stat_activity. Releasing the lock produced **one 200 and one 409**. Re-querying PostgreSQL found exactly two history rows: initial pending plus one terminal entry with the authenticated ADMIN and the winner's status/timestamp.
- A scoped database trigger failed history insertion after asserting that the conditional status update had happened. The response was a nonleaky 500; a nontransactional test sequence confirmed the fault fired. The complete Order row, including status/updatedAt/receipt, rolled back, and history retained only its initial entry. Removing the fault allowed a later rejection to succeed.
- A concurrent demotion held the ADMIN User row while middleware still saw the previous committed role. The test observed the transaction's role-read lock wait, committed the demotion, and received 403 with unchanged order/history. The existing token was then denied the ADMIN list.

These are actual PostgreSQL concurrency/rollback observations, not mocked repository results. The broader suite also verified that P04 catalog, P05 auth, P06 cart and P07 checkout behavior still passes.

## Preservation and remaining limits

The test URL and actual database/role guards run before test writes. Cleanup targets only generated IDs, deleting dependent histories/items before orders and users. Counts of ten affected tables match their initial values. Randomly named `p08_fault_*` triggers/functions/sequences target one allocated order and are removed in finally; a separate guarded read-only inspection confirmed no leftovers. No reset/truncate, development test accounts, seeded ADMIN, unrelated container deletion or credential changes occurred. The development database changed only through the additive index migration. Sequence gaps from test rollback remain normal.

Reads use the authenticated role fetched at request start; decision transactions additionally lock and recheck it. Pages are separate snapshots and do not freeze a whole traversal. Notes are owner-visible plain text. Out-of-band SQL writers can bypass application lifecycle rules, and a killed test process may require inspection of its exact owned objects. Timeouts/connection failures remain sanitized failures; this phase adds no decision retry or payment workflow.

P09 can document these routes in OpenAPI, distinguishing creation receipts from current-state order DTOs and cursor order pagination from product page-number pagination. Frontend integration remains P12 work.

## Changed files and final repository state

- Order management: new `src/modules/orders/management-{schemas,repository,service}.ts`; extended `routes.ts` and `serializer.ts`.
- Wiring/errors: `src/app.ts`, `src/lib/errors.ts`.
- Database: `prisma/schema.prisma`, `prisma/migrations/20261021000000_order_list_index/migration.sql`.
- Tests: `tests/integration/orders-management.test.ts`, `tests/helpers/order-decision-fault.ts`.
- Docs: README and API/architecture/data/local-development documents, plus this record.

All P08 changes remain local and uncommitted on main. No push, pull request, publication or deployment was performed.

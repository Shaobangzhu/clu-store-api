# P06 cart verification

Verified locally on 2026-10-21. Initial working tree was clean on `main`, with P05 committed at `b49cc8f`. README, architecture/API/data/development docs, current auth/catalog/database/middleware code and the initial schema/migration were inspected. No applicable AGENTS.md was found in the repository or ancestor directories. Existing P05 work and the private environment file were preserved.

## Implemented scope

One router instance is explicitly mounted at canonical `/api/shopping-cart` and legacy `/api/ShoppingCart`, with intentional case-sensitive prefixes and child paths. It supplies the public synthetic demo and authenticated read/add/remove/clear operations. No auth/cart mock bridge, checkout, order endpoints, dependency upgrades, schema changes or frontend edits were introduced.

The domain validates product/model/memory/color membership and availability, calculates Prisma Decimal full-model base plus memory increment, stores CNY and the add-time unit price, and returns explicit structured DTOs with fixed decimal strings. Legacy display/price fields are bounded, discarded before the service and marked deprecated in success metadata. Owner identity comes only from authenticated locals.

Caps are 99 units per line, 50 distinct configurations and 500 aggregate units. All mutations lock the owner User row first, even before the cart exists. Selected catalog rows are share-locked for adds; full-SKU upserts and existing database uniqueness/FKs remain authoritative. Concurrent tests verify first-cart creation, merges and all three caps. GET uses a Repeatable Read snapshot, loads relations sequentially, and recalculates display prices without changing cached prices. Unavailable lines remain visible/removable. P07 must acquire the same owner lock and revalidate/reprice within checkout.

The original public demo has no database/auth dependency, null entity IDs, `isDemo:true` and `available:false`. Its two units of base 100.00 plus increment 20.00 total CNY 240.00. No real catalog/user data is returned or seeded through that route. Provenance is documented in [fixture-provenance.md](fixture-provenance.md#p06-public-cart-demo).

## Actual commands and results

| Command | Exit/result |
|---|---|
| `git status --short` | 0; initially empty |
| `git branch --show-current` | 0; `main` |
| `git log -3 --oneline` | 0; P05 at HEAD |
| `docker ps --format '{{.Names}} {{.Ports}} {{.Status}}'` | 0; existing `clu-store-api-local-postgres-1` healthy at `127.0.0.1:5433->5432` |
| `docker compose ls` | 0; reused existing `clu-store-api-local` project |
| `npm run db:migrate:test` | 0; guarded `clu_store_test`, one reviewed migration, no pending migration/reset |
| `npm run test:integration -- tests/integration/cart.test.ts` | 0; **41 passed**, 1.48 s; exposed a pg concurrent-query deprecation warning |
| `NODE_OPTIONS=--trace-deprecation npm run test:integration -- tests/integration/cart.test.ts -t 'adds with exact Decimal'` | 0; **1 passed, 40 intentionally unselected**; traced the warning to Prisma relation fan-out on a transaction connection |
| `npm run test:integration` (final) | 0; **124 passed**, three files, 5.88 s; no transaction-query warning |
| `npm test` (final) | 0; **51 passed**, four files, 306 ms |
| `npm run lint` (final) | 0 |
| `npm run typecheck` (final) | 0; application plus tests/scripts/config |
| `npm run build` (final) | 0 |
| `git diff --check` | 0 |

Initial typecheck/lint/build checks also passed. The first focused run was functionally successful; the observed driver warning motivated the only subsequent code repair: sequential relation loading in the same transaction snapshot. One attempted final run was not executed because automatic approval review could not complete its workspace-credit check. After the user's continuation request, the authorized retry ran successfully. No approval bypass was used. Final checks preceded documentation-only edits.

## Test coverage and data preservation

The 41 focused cases cover both route aliases, exact casing, missing/invalid tokens on all private methods, deterministic public demo without dependencies, empty cart without writes, exact Decimal pricing without startingPrice double addition, full-SKU merges, different model/memory IDs and colors, tampered names/media/prices, private isolation, foreign-line 404 equivalence, own deletion, idempotent clearing, reusable cart identity, cross-product/unknown options, missing product, exact color matching, all four availability flags, current-price reads/cache refresh, concurrent first adds, concurrent quantity/line/aggregate limits, Decimal storage overflow and invalid payload/path/query/owner fields.

The suite checks the local test URL/database/role and actual connection privileges before writes. Each case creates uniquely identified users/products/options, uses real committed transactions and performs cleanup only by exact generated IDs. User deletion cascades only their test carts/lines; product options are removed before their test products. Final counts for User, Cart, CartItem, Product, ProductModel, ProductMemorySize and ProductColor equal the initial counts. Existing auth/catalog integration tests and their cleanup assertions also passed. No development rows were changed, no tables reset/truncated and no unrelated container/volume removed. Test-generated sequence counters may advance.

The existing sibling frontend was inspected read-only in `src/contexts/shoppingCart/shoppingCartProvider.tsx`, `src/hooks/useShoppingCartAction.ts` and `src/hooks/usePersistedReducer.ts`. It uses a reducer persisted to localStorage. P12 still owns frontend authentication/cart API integration and the envelope/DTO adapter.

## Files changed and remaining boundaries

- New domain files: `src/modules/cart/{routes,schemas,repository,service,serializer,demo}.ts`.
- Application wiring/error codes: `src/app.ts`, `src/server.ts`, `src/lib/errors.ts`.
- New tests: `tests/helpers/cart-fixture.ts`, `tests/integration/cart.test.ts`.
- Documentation: `README.md`, `docs/api-contract.md`, `docs/architecture.md`, `docs/data-model.md`, `docs/fixture-provenance.md`, `docs/local-development.md`, this verification record.

The exact public contract is in [api-contract.md](api-contract.md#p06-carts). Display totals are estimates, include unavailable lines and do not reserve inventory. The stored unit price is a cache. P07 must coordinate with the owner-lock protocol, revalidate stock/configuration/Decimal order limits, persist snapshots and clear the cart atomically with idempotency. Direct database writers must honor application cap/locking rules. Private routes still require the P05 JWT/database environment configuration. No new development credentials or administrator were created.

No commit, push, pull request or deployment was performed.

Primary references checked for the chosen transaction behavior: [PostgreSQL 18 row locking](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS) and [PostgreSQL 18 transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html). Concrete limits and DTOs are documented V1 choices, not inferred historical fixture facts.

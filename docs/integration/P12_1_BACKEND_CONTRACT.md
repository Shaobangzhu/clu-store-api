# P12.1 — Backend Contract Completion

Date: 2026-11-16 UTC.

## Preconditions and scope

Confirmed exact branch `feat/p12-backend-contract-extensions` and clean working
tree before edits. Read `P12_UBUNTU_PREFLIGHT.md` in full. Both requested endpoints
were absent. Used installed Node 24.19.0/npm 11.17.0.
No Git write operations were performed; all source/documentation changes remain
unstaged. No client, infrastructure, migrations or Compose stack was changed.

## Contracts

- GET /api/auth/me: valid Bearer JWT, existing authentication middleware and safe
  serializer; current id/username/email/role/createdAt in data, meta null.
  Invalid/expired tokens or deleted accounts return generic 401. No-store.
  Login/register retain pre-parser IP and normalized account rate limits;
  session recovery uses only the ordinary global request limit.
- PATCH /api/shopping-cart/items/:id and /api/ShoppingCart/items/:id:
  strict {qty: positive integer}, absolute replacement. Returns the existing
  cart-item DTO with live Decimal unitPrice/lineTotal; GET cart computes totals.
  Foreign/missing lines return the same 404. Structural invalidity is 400;
  business caps, invalid cart/SKU and unavailable selected stock are 422.
  Retains full SKU and line ID, existing owner lock, transaction and catalog
  share locks. Limits remain 99 units/line, 50 lines and 500 units/cart.
  Failed mutations roll back; zero requires DELETE instead.

Existing safe-user and cart-item response DTOs are reused without shape changes.
New request schemas and typed PATCH input feed the route registry and generated
OpenAPI/Postman contracts. All 17 historical routes remain documented.

## Verification

| Check | Actual result |
| --- | --- |
| npm run lint | PASS |
| npm run typecheck | PASS, source and test configurations |
| npm run test:unit | PASS: 8 files, 84 tests |
| npm run test:docs | PASS: 2 files, 25 tests (subset of unit suite) |
| npm run docs:check | PASS: 33 routes/requests, 294 response examples; security, monetary strings, Postman and sensitive scans pass |
| npm run build | PASS |
| npm run test:integration | PASS: 6 files, 256 tests |
| git diff --check | PASS |

Initial sandbox unit execution failed on local socket EPERM (27 tests), not
application assertions. Approved execution outside the sandbox passed.
Read-only isolation verification initially lacked sandbox network access; its
approved retry verified loopback 127.0.0.1:55438, actual clu_store_test database,
clu_test identity, nonprivileged role and denied CONNECT to clu_store_dev.
Only then was the guarded state-mutating integration suite run. Existing global
setup guards and advisory run lock remained effective; suite cleanup/count checks
passed. No database reset, deletion, reinitialization, migration or seed ran.

New tests exercise safe session fields, role refresh/deletion, expired/bad-signature
JWTs, missing dependencies, credential-budget separation, strict quantity inputs,
real DB session recovery, PATCH aliases, ownership hiding, repricing, invalid state,
rollback, per-line/aggregate limits, simultaneous absolute updates and races with
add/delete/clear. Existing checkout concurrency/security suites also passed.

## Risks and acceptance

GO for P12.1 backend contract completion. No known blocking security or concurrency
issue remains in the tested scope. Authentication still depends on configured JWT
secrets and PostgreSQL. Absolute updates intentionally use last-serialized-write
wins; there is no version/If-Match conflict detection, so clients should serialize
edits and reconcile server responses. Cart prices are estimates until checkout;
PATCH returns a line, and GET cart provides complete aggregate reconciliation.
No inventory reservation or token refresh was introduced.

End-to-end React/browser acceptance remains unverified and outside this milestone;
the P12.0 client contract mismatches still require client work.

## Changed files

- src/contracts/api.ts
- src/documentation/openapi.ts
- src/modules/auth/routes.ts
- src/modules/auth/schemas.ts
- src/modules/cart/routes.ts
- src/modules/cart/schemas.ts
- src/modules/cart/service.ts
- src/modules/cart/serializer.ts (cache comment)
- tests/session.test.ts
- tests/integration/auth.test.ts
- tests/integration/cart.test.ts
- tests/docs.test.ts
- tests/mounted-routes.test.ts
- docs/api-contract.md
- docs/openapi.json
- docs/testing.md
- docs/integration/P12_1_BACKEND_CONTRACT.md
- postman/CLU_Store_API.sanitized.postman_collection.json

Suggested commit: `feat(api): add auth session and cart quantity endpoints`.
Suggested PR title: `feat(api): complete authentication and cart contracts`.
The operator owns all Git writes and PR creation.

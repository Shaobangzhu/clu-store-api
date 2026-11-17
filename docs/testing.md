# P10 test execution and isolation

Use Node 24, npm 11 and the existing local PostgreSQL 18 Compose service. A fresh checkout uses `npm ci` (including Prisma generation), `npm run env:local` to create a new private `.env`, then `docker compose up -d --wait postgres`. Inspect existing projects/ports first as described in [local development](local-development.md). Never replace an existing `.env` or remove an existing volume to make tests pass.

```sh
npm run db:migrate:test
npm run lint
npm run typecheck
npm test
npm run build
```

`npm test` now runs the unit and PostgreSQL Vitest projects. Database configuration or connection failure fails the run; there is no automatic skip or mock fallback. Apply reviewed migrations explicitly with `db:migrate:test`; tests do not reset, push a schema, or migrate development. No catalog seed command is needed for tests.

For smaller development feedback loops:

```sh
npm run test:unit
npm run test:docs
npm run test:integration -- tests/integration/cart.test.ts
npm run test:integration -- tests/integration/orders-place.test.ts
```

## Safety and fixture lifetime

- Both database URLs are required. `TEST_DATABASE_URL` must select local `clu_store_test` as `clu_test`, with no URL options, and a database name different from `DATABASE_URL`. Production mode is rejected. A real connection checks the database, role and absence of superuser, role/database creation, replication and RLS-bypass privileges.
- Global integration setup loads `.env` only when present; explicit process environment wins. CI can also supply the variables directly. Unit-only commands need no database environment. HTTP tests still need permission to bind loopback sockets.
- One PostgreSQL session advisory lock covers an entire integration run. A second run against the same database fails clearly; run it again after the first finishes. Files run serially. Concurrent HTTP requests **inside** checkout/cart/order tests still run simultaneously against separate real database connections.
- Tests create deterministic synthetic business values: known prices, quantities, option relationships, fixture dates and expected outcomes. Random namespaces/UUIDs and generated database IDs provide collision avoidance; assertions use allocated IDs instead of assuming sequence values. JWT secrets/passwords are generated for tests and never saved as fixtures.
- Public-read fixtures live in rollback-only Repeatable Read transactions. Committed auth/cart/order fixtures are removed by exact allocated IDs in dependency order, with before/after table counts checked. No broad deletion, truncate or reset is used. Sequence counters may advance normally.
- Scoped fault triggers exercise actual PostgreSQL failures after partial checkout or transition work. They are removed in `finally`; startup rejects leftover P07/P08 fault functions from an interrupted run. A hard-killed process can leave run-owned rows/objects. Inspect exact identities before manual cleanup; no automated cleanup guesses ownership.
- The database environment suite checks migration names/checksums, PostgreSQL major version, denied development-DB access, a second-run lock refusal and real SQL constraint/rollback probes. Readiness is exercised with successful SQL and PostgreSQL statement timeout SQLSTATE 57014.

## Contract and error regressions

`tests/mounted-routes.test.ts` observes actual `app.use()` registrations while invoking the original Express method, then inspects real router stacks. It compares every explicit method/path with checked-in OpenAPI, allowing only three named Swagger assets. Negative controls remove a legacy mount and add an undocumented method. This catches wiring drift even when the documentation catalog still looks correct. The helper is specific to the pinned Express 5 stack shape and fails on unsupported nested/array mounts so those cases must be added deliberately. Framework-generated HEAD/OPTIONS behavior is not counted as explicit business routes.

The database suites assert complete 400/401/403/404/409/422/429 envelopes. Existing real database fault tests now assert the exact 500 envelope as well. Legacy client prices remain accepted and discarded according to P06; canonical unsupported `unitPrice`/`totalAmount` fields are rejected. P10 does not change that compatibility behavior.

## GitHub Actions

`.github/workflows/quality.yml` defines the same four-command gate on a fresh hosted Ubuntu runner with Node 24 and `npm ci`. It creates random private credentials using the existing exclusive-create environment script, starts only PostgreSQL under a run-specific Compose project, applies test migrations, then runs lint/typecheck/all tests/build. The runner's test role has the same restrictions as local development. No repository secret, copied private `.env`, provisioned admin or sensitive original Postman collection is required.

Cleanup removes only that hosted job's run-specific Compose project/volume. There is no publish, deployment or remote database step. Workflow YAML can be checked locally; a passing GitHub Actions run requires actual remote execution and is not implied by local results. P11 still owns the API production image and deployment topology.

The original roadmap's clean-install, fresh-schema and curated-seed repeatability evidence belongs to P02/P03 and a fresh CI run; P10 does not rerun a development catalog seed. Frontend integration and final security freeze remain P12/P13. See [the P10 evidence](p10-verification.md) for what was actually executed.

## P12.1 contract extensions

`tests/session.test.ts` covers safe session DTOs, current roles/deletion, malformed,
expired and invalid-signature JWTs, rate-limit separation and strict PATCH inputs.
The guarded auth/cart integration suites exercise actual PostgreSQL session
recovery, both PATCH aliases, ownership, live pricing, rollback, quantity caps and
concurrent PATCH/add/delete/clear operations. Mounted-route and documentation
tests require all 33 operations, including the new canonical and legacy routes.

On Ubuntu use installed Node 24/npm 11 and central PostgreSQL on loopback 55438.
Verify test database identity/isolation before state-mutating tests; the integration
global setup additionally enforces the test URL/role and serializes test runs.
Never start the repository PostgreSQL Compose stack or reset an existing database.
See [P12.1 verification](integration/P12_1_BACKEND_CONTRACT.md) for actual results.

## P12.10A isolated browser-test support

The local `clu-store-client` checkout has commerce pages but no Playwright setup
at implementation time. P12.10B must consume the following runner contract.
No application endpoint or authentication bypass is added.

Use Node 24/npm 11. Supply `DATABASE_URL` (development identity for comparison)
and `TEST_DATABASE_URL` privately, or use the existing private `.env`. The guard
requires the restricted local `clu_test`/`clu_store_test` identity and now rejects
CONNECT permission on any other non-template database. Integration tests, test
migrations and browser runs share one advisory lock. Do not run them concurrently.
Test migrations remain an explicit setup step (`npm run db:migrate:test`), only
on the verified test database. The runner never migrates or seeds development.

```sh
# From the API checkout, after test migrations have been verified:
E2E_CORS_ORIGINS=http://127.0.0.1:5173 npm run test:e2e:run -- \
  node /absolute/path/to/frontend/node_modules/@playwright/test/cli.js test \
  --config=/absolute/path/to/frontend/playwright.config.ts --workers=1
```

The runner owns an ephemeral loopback API listener for the command lifetime;
Ubuntu application services need not be running. It neither starts PostgreSQL
nor touches central infrastructure. The child receives `E2E_API_URL` and
`E2E_FIXTURE_PATH`. Read the latter as JSON in Node-side Playwright setup:
`version`, `baseURL`, `users.customer`, `users.other`, `users.admin` (each has
`id`, `username`, `email`, `password`), `categorySlug`, `productId`, `input`
(product/model/memory/color/qty) and `expectedUnitPrice` (`10.10`). Use allocated
IDs and the category slug, never sequence assumptions or shared catalog rows.
Business values repeat; account names, passwords and IDs are unique per run.
The manifest is temporary and private; never publish it or login tokens as CI
artifacts. Database URLs and the existing JWT secret are removed from child env.

P12.10B must start its own frontend process, wire its API base/proxy to
`E2E_API_URL`, disable reuse of an existing server, and use the matching CORS
origin. Use normal login for each role and isolated browser contexts. All normal
authentication and rate limits stay enabled: reuse authenticated contexts and
budget login requests (default 10/IP/15 minutes), rather than disabling limits.
Create carts and orders through the API/UI so transactional and idempotency
behavior remains under test. Registration scenarios must track and remove their
own exact created accounts; the runner cleans only its three allocated users.
Tests must not act on pre-existing users, products or orders.

On child success/failure or SIGINT/SIGTERM while the child runs, the API closes, allocated order
history/items/orders, users (including cascading carts), product options/products
and category are removed transactionally, then the manifest and lock are released.
Cleanup is repeatable and never uses reset, truncate or unscoped deletion.
Interruption during startup, SIGKILL or machine loss cannot guarantee cleanup: inspect exact allocated IDs
before manual recovery; never use a prefix-based sweep. The runner is a trusted
local test tool, not a remotely reachable fixture/reset API.

CI: use the existing disposable, job-specific PostgreSQL service and test
migration step, run backend checks first, then install frontend dependencies and
Playwright browsers and invoke this wrapper. Do not target shared Ubuntu services.
A second workflow/job needs its own database service. Existing quality CI runs the
new fixture regression automatically through `npm test` and the runner lifecycle
smoke through `npm run test:e2e:smoke`; the actual browser job
belongs to P12.10B. Live browser acceptance remains PENDING.

Fresh CI provisioning also revokes PUBLIC CONNECT on the `postgres` maintenance
database to satisfy the stricter guard. This initialization SQL applies only to
new disposable volumes; it was not executed against Ubuntu infrastructure.
Existing database installations that fail the guard need operator-reviewed
privilege configuration, never an automatic repair or volume replacement.

P12.10A local verification: Node 24.19.0; lint, typecheck, build, documentation
contract validation and all 343 tests (16 files) passed. Two E2E runner smoke
runs passed; a failing child retained exit code 7 and a subsequent guarded run
succeeded. The read-only preflight confirmed the test identity and denied access
to development and maintenance databases before database tests ran. No migrations
or seeds were executed. Fresh hosted CI provisioning and live browser acceptance
have not been executed here.

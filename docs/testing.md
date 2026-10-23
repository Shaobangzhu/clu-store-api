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

# P10 quality gate — 2026-10-22

## Baseline and scope

Started from a clean working tree on `main`, at `a072fe4` (`docs(api): publish openapi and sanitized postman collection`). Read the README, active architecture/API/data/local-development documentation, the detailed acceptance checklist in `documents/03_IMPLEMENTATION_ROADMAP.md`, existing tests/helpers and both migrations. No applicable `AGENTS.md` was present in the repository or its ancestors.

The existing suites already exercised most requested business behavior. P10 adds missing negative assertions, a mounted-route contract check, real database environment checks and a reproducible complete test entry point. No production business source, Prisma schema, migration, fixture catalog or dependency version was changed. Existing user work and private environment values were preserved.

## Roadmap coverage assessment

This is a requirements-to-test map, not a measured line/branch coverage percentage.

| Required behavior | Executable coverage and P10 additions |
|---|---|
| Registration success, duplicate username/email, case normalization, confirmation/email/password rejection | `tests/integration/auth.test.ts`: real Argon2id persistence, normalized duplicates, concurrent registration, mismatched/missing/ambiguous confirmation, invalid email and weak password. |
| Login identifiers, invalid/expired/forged JWT | Auth suite: username/email and deprecated username body; malformed/absent, expired, signature, issuer, audience, algorithm, subject, typ, lifetime and unsigned tokens; role claims cannot grant ADMIN. |
| Product list/keyword/category/page/sort/missing | `tests/integration/public-reads.test.ts`: real PostgreSQL search, wildcard escaping, filters, all five sorts/tie breaks, count/page consistency, bounded invalid input and missing/empty results. |
| Marketing/category/support/SKU DTOs | Public-read suite: active schedule boundaries and inactive 2025 campaigns, nullable editorial arrival, decoded category title/slug, navigation/landing content, sanitized support, full-model plus memory-increment decimal strings. |
| Private carts, full-SKU merge, delete/clear, isolation | `tests/integration/cart.test.ts`: noauth/invalid tokens, owner-only data, same-SKU merge, differing model/memory/color, foreign deletion, clear, caps and concurrent adds. |
| Untrusted prices | Cart/checkout suites preserve server-derived model-plus-memory amounts and discard deprecated client prices/names. P10 additionally rejects unsupported `unitPrice` and `totalAmount` cart fields with 400 and no cart creation. Legacy fields remain accepted-and-discarded as documented. |
| Atomic checkout, totals, empty/invalid cart, immutable snapshots | `tests/integration/orders-place.test.ts`: real transactions, live price/stock validation, no double-added starting price, full line/subtotal arithmetic, cart consumption, direct-mode preservation, later catalog edits and snapshot stability. |
| Rollback and idempotency concurrency | Checkout suite: PostgreSQL fault triggers after partial writes and after deletion, complete rollback, bounded conflict retries, exact same-key replay before empty-cart checks, duplicate headers, cross-user keys, conflicting modes/SKUs, simultaneous same-key requests, different-key checkout and concurrent cart writes. Observed database lock waits are asserted. |
| Owner/ADMIN order reads and legal/illegal transitions | `tests/integration/orders-management.test.ts`: owner/foreign/admin access, cursor pagination, noauth/403, approve/reject, repeated/cross-state 409, missing IDs, operator/time/history, concurrent opposite decisions, role demotion and rollback on history failure. |
| All 17 historical operations and both cart spellings | Public/auth/cart/checkout/order suites exercise all historical methods/paths. Both `/api/ShoppingCart` and `/api/shopping-cart` implement and test all five operations, including exact casing and private-method authentication. |
| Mounted routes match OpenAPI | New `tests/mounted-routes.test.ts` compares real Express registrations with checked-in OpenAPI: 30 documented operations plus exactly three named Swagger assets. Negative controls catch removal of the legacy mount and an undocumented method. P09 schema/security/examples/Postman checks remain in the full gate. |
| Stable 400/401/403/404/409/422/429/500 envelopes | Seven new parameterized checks use mounted routes. Existing real checkout/decision fault tests now assert the exact 500 body, content type and server request ID. No mocked Prisma transaction is used. |
| Readiness, database role and migrations | New `tests/integration/database-environment.test.ts`: actual PostgreSQL 18 identity/privileges, denied connection to development, migration names and SHA-256 checksums, second-run lock refusal, existing real constraint/rollback smoke script, successful readiness and sanitized SQLSTATE 57014 timeout. |
| Runtime security and secret handling | Existing unit/auth/docs tests retain Helmet, CORS, Zod, malformed JSON/body cap, request ID, auth/generic rate limits, Pino redaction, no credential leakage and generated-artifact scans. |

The roadmap also includes later-phase gates. API container startup/shutdown and deployment topology remain P11, frontend integration remains P12, and the final V1 security freeze remains P13. A clean install, a fresh migration and curated seed repeatability are not newly claimed from this run: dependencies were already installed, the test schema was already migrated, and no development seed was run. The new CI workflow applies reviewed migrations to its fresh test database when executed.

## Test reproducibility and data protection

`npm test` now runs both Vitest projects; `npm run test:unit` and `npm run test:integration` remain focused subsets. Integration setup accepts an optional `.env` or explicit process environment, validates `TEST_DATABASE_URL` and the actual connection, and holds a PostgreSQL session advisory lock through test teardown. A second run fails clearly instead of racing global fixture counts or trigger DDL. Files run serially while in-test concurrent requests remain concurrent. `.only` is disallowed.

Production mode, unsafe URL targets and elevated test roles are rejected. The guard now also rejects replication/RLS-bypass privileges. Fixtures use deterministic business values and collision-resistant namespaces, with rollback or exact allocated-ID cleanup and before/after counts. No reset, truncate, development data deletion or production connection was performed. The database smoke checks execute inside rollback-only transactions. Test sequences can advance.

The existing local PostgreSQL service was healthy at loopback port 5433. The unrelated MongoDB service was inspected and left untouched. No Docker service or volume was created/deleted locally during P10. The original sensitive Postman source was not read or copied in this phase.

See [testing.md](testing.md) for commands, interruption recovery and the GitHub Actions setup.

## Actual command results

One complete final test set was executed after focused repairs:

| Command | Exit | Actual result |
|---|---:|---|
| `npm run lint` | 0 | ESLint passed. |
| `npm run typecheck` | 0 | Application and test/script/config TypeScript checks passed. |
| `npm test` | 0 | **318 passed, 0 failed, 0 skipped**, 12 files; 12.33 seconds. Includes 77 unit/contract cases and 241 real PostgreSQL cases. |
| `npm run build` | 0 | TypeScript production build passed. |
| Workflow YAML parse/required-step inspection | 0 | Workflow parsed and contains the full test command. Remote execution not performed. |
| `git diff --check` | 0 | No whitespace errors. |

The full test output was:

```text
Test Files  12 passed (12)
     Tests  318 passed (318)
  Duration  12.33s
```

Local raw command logs are retained in ignored `logs/p10/lint.log`, `typecheck.log`, `test.log` and `build.log`. The build's initial process session became unavailable after a continuation; its exit could not be recovered, so **only build** was rerun to obtain the recorded exit 0. Lint, typecheck and the complete test set were not repeated. No executable changes were made after that final gate; only verification documentation was completed.

Development checks and repairs were recorded separately:

- Initial sandboxed focused unit run: 15 passed, 3 failed because Supertest could not bind loopback (`listen EPERM`). The same focused command with approved local socket access passed all 18 tests.
- Initial Docker inspection hit sandbox permission denial; automatic escalation review initially failed because workspace credits were unavailable. After continuation, the approved read-only inspection succeeded. No approval bypass was used and no infrastructure blocker remained.
- Focused affected PostgreSQL run: 157 passed, 1 failed. The new readiness test incorrectly assumed Prisma could not reconnect after `$disconnect()`. It was corrected to exercise an actual PostgreSQL statement timeout. The six database environment cases then all passed. Passing business behavior was not rewritten.
- Development TypeScript checking found the test-only Express stack assertion needed an explicit `unknown` boundary; repaired and rechecked successfully.
- An initial ad hoc YAML assertion treated a valid empty `pull_request:` trigger as truthy; changing the inspection to check key presence passed, without changing the workflow.

There are no skipped/todo/only test declarations and no environmental failures in the final run. GitHub Actions has **not** run remotely: its workflow is configured and YAML-checked locally, not claimed as a remote PASS. No clean `npm ci` was performed locally because dependencies were unchanged; the workflow includes it.

## Changed files and repository status

- Execution: `package.json`, `vitest.config.ts`, `vitest.integration.config.ts`, new `vitest.unit.config.ts`, new `.github/workflows/quality.yml`.
- Safety: `scripts/test-database-guard.ts`, new `tests/helpers/database-setup.ts`.
- Coverage: new `tests/mounted-routes.test.ts`, `tests/integration/database-environment.test.ts`, `tests/helpers/expect-error.ts`; expanded `tests/database.test.ts`, `tests/integration/cart.test.ts`, `tests/integration/orders-place.test.ts`, `tests/integration/orders-management.test.ts`.
- Documentation: `README.md`, `docs/local-development.md`, new `docs/testing.md` and this report.

Changes remain uncommitted on `main`. No push, PR, remote workflow dispatch or deployment was performed. P11 can extend the existing quality workflow for the production API container; P10 provides no claim about deployment readiness or exhaustive concurrency interleavings.

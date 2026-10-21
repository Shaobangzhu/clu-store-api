# P04 verification record

Completed locally on 2026-10-20 (America/Los_Angeles), branch `main`. The initial working tree was clean. README, API/architecture/data docs, schema, source and existing tests were inspected; no repository/parent AGENTS.md was present. The existing local PostgreSQL Compose service was healthy. No authentication/cart/order implementation, schema changes, reseeding, resets, commits, pushes, PRs or deployment were performed.

## Implemented behavior

All seven public reads now use Prisma-backed repositories/services: product offers, new arrivals, product list/detail, category navigation/landing and support. Route handlers perform validation and envelope formatting, with no database calls in controllers. Product static routes precede numeric detail paths.

The catalog read adapter uses Repeatable Read transactions for coherent product page/count/configuration data. Filters search case-insensitive name/title/category title/slug and escape LIKE wildcards. Sorting is deterministic, with numeric Decimal price order and ascending ID tie breaks. Inputs have documented length/page bounds, and empty/missing results use stable envelopes/codes.

Explicit DTO serialization maps `imageSrc -> image`, `extraPrice -> memorySizes[].price`, and exposes color names. Monetary values have two fractional digits. Full model base and memory increment remain separate, and `startingPrice` is never added to a chosen model. Inactive compatibility options are excluded. Category JSON is validated and maps editorial image keys; null video sources remain null.

Offers require an active flag and inclusive-start/exclusive-end schedule eligibility. Historical 2025 campaigns are not reactivated. Marketing soldOut is independent of product inStock. Arrivals retain deterministic display order and nullable links.

Support is sanitized on every read with pinned `sanitize-html` 2.18.1 and a narrow attribute-free tag allowlist; dangerous elements and links are removed. The [maintainer documentation](https://github.com/apostrophecms/apostrophe/tree/main/packages/sanitize-html) informed the allowlist configuration. Missing support is an explicit 404. Only the reviewed local SVG placeholder is served as media.

## Actual commands and exits

| Command | Exit/result |
|---|---|
| `git status --short` | 0; initially clean |
| `git branch --show-current` | 0; `main` |
| `docker compose ps` | 0; existing local PostgreSQL healthy |
| `npm install --save-exact sanitize-html@2` | 0; pinned 2.18.1; audit reported 0 vulnerabilities |
| `npm install --save-dev --save-exact @types/sanitize-html@2` | 0; pinned 2.16.2; audit reported 0 vulnerabilities |
| `npm run db:migrate:test` | 0; guarded `clu_store_test` / `clu_test`; no pending migrations, no reset |
| `npm run test:integration -- tests/integration/public-reads.test.ts` | 0; **39 tests passed** against real PostgreSQL |
| `npm test` | 0; **45 regression tests passed** in 3 files |
| `npm run typecheck` | 0; application, scripts, seed, tests and Vitest config checked |
| `npm run lint` | Initial 1 for intentional control-character regexes conflicting with ESLint's no-control-regex rule; changed to equivalent Unicode control-character classes. Final 0. |
| `npm run build` | 0; strict TypeScript ESM output generated |
| `git diff --check` | 0 |

## Integration isolation and coverage

The suite requires TEST_DATABASE_URL, validates the local target and actual non-privileged test role using existing P02 guards, and fails on missing configuration/access. Each fixture is inserted into a real PostgreSQL Repeatable Read transaction. Supertest uses repositories against that transaction, then the transaction is deliberately rolled back even after successful assertions. The production snapshot adapter is also exercised against committed test-database data. Final counts for categories/products/configurations/offers/arrivals/support equal their initial counts. No fixture reset/delete or development database mutation is needed.

Coverage includes all seven endpoints; envelope/pagination/count defaults; all five sort choices and ID ties; numeric rather than lexicographic price order; combined name/title/category filtering; literal wildcard and injection-like text; unknown/beyond-last safe results; invalid/repeated/capped query values; nested model/memory Decimal strings and full-base/increment semantics; unavailable/retired configurations; missing/invalid product IDs; schedule boundaries and historical/inactive offers; soldOut/stock independence; nullable ordered arrivals; URL-decoded Chinese category titles and case-insensitive slugs; editorial content; malformed/double encoding; sanitized malicious HTML; missing support; missing database dependency; and local placeholder serving without exposing arbitrary files.

## Files changed

New module files:

- `src/modules/products/{routes,service,repository,serializer,schemas}.ts`
- `src/modules/categories/{routes,service,repository,schemas}.ts`
- `src/modules/information/{routes,service,repository}.ts`
- `src/lib/catalog-database.ts`

Application wiring/errors: `src/app.ts`, `src/server.ts`, `src/lib/errors.ts`, `src/middleware/error-handler.ts`.

Testing/configuration: `tests/integration/public-reads.test.ts`, `tests/helpers/read-fixture.ts`, `tests/app.test.ts`, `vitest.config.ts`, `vitest.integration.config.ts`, `tsconfig.test.json`, `package.json`, `package-lock.json`.

Documentation: `README.md`, `docs/api-contract.md`, `docs/architecture.md`, `docs/local-development.md`, this verification record.

Authentication, persistent carts and checkout/order transitions remain later phases. The separate integration command must be included alongside unit checks in future CI; `npm test` explicitly excludes the integration directory rather than silently attempting database access. Public read data is sourced from the database, with P03 demo/provenance constraints retained.

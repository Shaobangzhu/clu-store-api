# CLU Store API — Ready-to-run Codex Implementation Prompts

**Prepared:** 2026-10-19  
**Status:** No prompt executed yet. Copy and execute **one prompt at a time** from P00 to P13.  
**Important:** These prompts are intended for Codex with the repository **locally opened**. GitHub remote inspection does not reveal the developer's uncommitted edits or running Docker containers.

## How to use

1. Open the local `clu-store-api` repository in Codex. Read the four planning Markdown documents, ideally copied into `docs/planning/`, or provide their absolute locations. The supplied JSON fixture files and original Postman collection must be accessible **locally** for P03/P09; do not put the unsanitized collection in a public repo.
2. Select each prompt's model and Thinking effort. The recommendations are **GPT-6.1 Sol** for routine/intermediate work and **GPT-6 Astra** for high-risk data/auth/concurrency work; `Extra High = xhigh`. If your Codex model picker differs, use its nearest equivalent with the same effort.
3. Run P00, review the diff/test report, then P01, etc. Do not request 'implement all prompts in one go'.
4. Implementations may add scripts and tests, but must never automatically push, create PRs, release, deploy, or expose secrets. Move to the next prompt only after the previous gate is satisfied or a concrete blocker is recorded.

---

## P00 — Baseline reconciliation and repository contract documents

**Model:** GPT-6.1 Sol  
**Thinking:** Medium  
**Repository:** `clu-store-api`  
**Dependencies:** None  
**Commit suggestion:** `docs(api): establish v1 architecture and compatibility contract`

```text
You are the lead developer of the locally opened clu-store-api repository. This is Phase P00: baseline reconciliation and contract documentation only, not API implementation.

First read README.md, AGENTS.md if present, package.json if present, .gitignore, all current source/config files and the planning package: 01_SOURCE_AUDIT.md, 02_ARCHITECTURE_AND_API_CONTRACT.md, and 03_IMPLEMENTATION_ROADMAP.md. Run git status --short, git branch --show-current, and inspect recent commits. Protect and preserve all existing user work. If local code differs from the planning documents, report the differences rather than overwriting the code.

Confirm or amend the V1 decisions: Node 24 LTS; Express 5/TypeScript/ESM; Prisma 7 + PostgreSQL; CNY with Prisma Decimal and monetary JSON strings; original numeric catalog IDs; a new JSON envelope with a frontend adapter; product-model full base price plus memory upgrade; nullable product link for editorial new-arrival cards; ADMIN-only order transitions; real PostgreSQL transaction checkout. Never invent contract information absent from samples.

Produce or update ONLY repository documentation under docs/: architecture.md, api-contract.md, data-model.md, fixture-provenance.md, local-development.md (or a simpler nonredundant structure) from the planning package. Include a 17-route inventory, compatibility/deprecation map, security risk register, order status machine, money semantics, Docker development topology and phased definition of done. If sample materials are outside this local repo, record their names and explicitly request they be placed in a safe local input directory later; do not create bogus fixtures.

Do not generate Express business code, install dependencies, create database objects, start Docker, or perform any network deployment in this phase. Do not commit, push, publish, or create a pull request without explicit permission. At the end, report local repository status, decisions reconciled, documents created, and unresolved questions (only those affecting correctness).
```

**Exit gate:** Baseline and documentation reflect **local** code; only intentional docs changed; 17-route checklist ready.

---

## P01 — Bootstrap Express 5 and cross-cutting HTTP foundations

**Model:** GPT-6.1 Sol  
**Thinking:** Medium  
**Repository:** `clu-store-api`  
**Dependencies:** P00  
**Commit suggestion:** `chore(api): bootstrap express typescript and health endpoints`

```text
Implement Phase P01 of clu-store-api. Before edits, read README.md, AGENTS.md if present, docs/architecture.md, docs/api-contract.md and all current source; run git status --short and preserve existing changes. Do not push/create PR/deploy.

Set up a minimal, production-oriented Express 5 + TypeScript strict + ESM project targeting Node 24 LTS. Use npm with a committed lockfile unless existing conventions require otherwise. Create src/app.ts without listen(), src/server.ts for listen and graceful shutdown, src/config/env.ts with Zod validated environment, src/lib/logger.ts using Pino redaction, middleware for request IDs, response envelope, Zod request validation and stable error codes. Configure Helmet, env-driven allowlisted CORS, JSON body-size limit, generic rate limit, 404 handler and centralized nonleaky error handler. No Prisma DB dependency yet; P02 will add one. Add GET /health (liveness), GET /ready (temporarily clearly reports no DB readiness, not false success), and no other pretend business endpoints.

Add .env.example with placeholders only; .gitignore for secrets, logs, dist and local data; npm scripts for dev, lint, typecheck, test, build. Add clean Vitest/Supertest tests for health, 404, invalid request and envelope. Ensure request validation is possible for path, query, and body. Do not overabstract domain scaffolding or create fake products/orders.

Run npm install (if needed), npm run lint, npm run typecheck, npm test and npm run build exactly once per meaningful final state, repairing failures first. Report changed files, actual commands/results, remaining DB-dependent readiness gap, and next P02 work. No remote writes or deployment.
```

**Exit gate:** App imports independently of `listen`; meaningful middleware tests/build pass; `/ready` does not falsely report DB success.

---

## P02 — Local Docker PostgreSQL + Prisma schema + migrations

**Model:** GPT-6 Astra  
**Thinking:** High  
**Repository:** `clu-store-api`  
**Dependencies:** P01  
**Commit suggestion:** `feat(db): add postgres compose and prisma relational schema`

```text
Implement P02. Read repository docs and current code, AGENTS.md if present, and inspect git status before editing. This developer ALREADY HAS Docker installed; inspect docker ps, docker compose ls and occupied host ports before choosing an isolated project name, named volume and host-mapped database port. Reuse the installed Docker engine, not a remote managed DB. Never delete unrelated containers/volumes. Do not push/deploy/create PR.

Add docker compose service postgres with PostgreSQL 18, a private named volume and healthcheck; use safe environment placeholders, do not hard-code real passwords. Document host development DATABASE_URL pointing to localhost:<published-port> vs in-container DATABASE_URL pointing to postgres:5432. Add a separate TEST_DATABASE_URL/database with explicit protections against test resets hitting the normal development DB.

Install a coherent pinned stable Prisma 7 version and matching packages; use prisma.config.ts and the PostgreSQL driver adapter (@prisma/adapter-pg) required by Prisma 7. Define relational models: User UUID/role; Category plus editorial JSON; Product, ProductModel, ProductMemorySize, ProductColor; Offer; NewArrival with nullable linked product for editorial cards; SupportInformation; Cart and CartItem; Order, OrderItem, OrderStatusHistory. Money fields use Decimal @db.Decimal(12,2), and JSON serialization will use decimal strings. Product/category/configuration IDs are integers preserving sample IDs. Add foreign keys, unique constraints, useful indexes and explicit delete behavior; unique active cart per user; full-SKU cart uniqueness; per-user nullable idempotency key uniqueness and request fingerprint. Add optional order metadata JSON and explicit currency CNY. Document the selected order ID type. No hardcoded admin password, JWT, old host URLs, or imported bearer tokens.

Create a reviewed initial migration; NEVER perform prisma db push as a production substitute and NEVER automatically reset any nonempty DB. Make /ready perform a bounded real DB check, 503 when unavailable. Run local Docker PostgreSQL startup, Prisma generate, migrate dev, and database constraint/migration smoke checks. Capture exact commands/exits. If Docker is unavailable or permission denied, stop at the infra verification blocker instead of claiming it passed. Preserve existing user work.
```

**Exit gate:** Actual PostgreSQL health + initial migration, correct schema relations, `/ready` toggles based on DB reachability.

---

## P03 — Deterministic seed and safely owned media

**Model:** GPT-6.1 Sol  
**Thinking:** Medium  
**Repository:** `clu-store-api`  
**Dependencies:** P02  
**Commit suggestion:** `feat(seed): import curated catalog fixtures and demo content`

```text
Implement P03 against the actual PostgreSQL schema; first inspect local git status, AGENTS.md/docs and existing source. Source fixtures (supplied separately, not necessarily in repo): getProductsSampleResponse.json, getProductsByIdSampleResponse.json, getCategoryByIdSampleResponse.json, getOffersSampleResponse.json, newArrivalsSampleResponse.json and getSupportResponse.json. Also inspect the legal-to-reuse static demo assets in Shaobangzhu/clu-store-client if a local copy is available. Do not download/copy assets from the old server or web-scrape branded media.

Build curated seed data with explicit provenance and stable noncolliding product IDs, category IDs, globally unique model/memory IDs and full names/specifications. Preserve unambiguous observed product IDs 2,6,7,15,22,31,42; the category sample includes 16 summaries but not their complete model configurations, so do NOT fabricate their sellable SKU options without documenting a deliberate demo choice. Either mark these incomplete items non-purchasable or seed transparently synthetic demo options from the local frontend fixture with unique IDs and documented transformations. Normalize missing category for iPhone 16 to the explicit Phones demo category. Translate legacy `image` -> internal `imageSrc`, `memorySizes[].price` -> extraPrice, and inconsistent `spec` -> specification. Correct impossible/duplicate IDs; retain local separate fixture evidence.

Add idempotent upsert-based prisma/seed.ts, npm run db:seed, demo categories/products/models/memories/colors, inactive historical offers, new arrivals (including non-product cards), and a SMALL ORIGINAL sanitized support page rather than copying outdated 2025 legal material verbatim. Use neutral local/reusable media or explicit placeholders only; do not store former-host URLs in DB records or tracked repo. Never create a user with fixed admin password. Check all sample strings for secrets/legacy host URLs before creating tracked fixtures.

Run seed twice against a dedicated development database; query before/after counts and stable IDs to demonstrate idempotency and relationship correctness. Report any necessary exclusions/changes and next P04 endpoint readiness. No push/PR/deploy.
```

**Exit gate:** Real seed reruns stable; complete opt-in SKU fixtures; no old host or unlicensed bundled imagery.

---

## P04 — Public product, category, offer, arrival and support routes

**Model:** GPT-6.1 Sol  
**Thinking:** High  
**Repository:** `clu-store-api`  
**Dependencies:** P03  
**Commit suggestion:** `feat(catalog): implement product and category read endpoints`

```text
Implement P04 following docs/api-contract.md and the existing Prisma schema. Start with git status, README, AGENTS.md if present and code inspection. Create cohesive modules under src/modules/products, categories and information (route/controller/service/repository/Zod schemas where useful). Preserve actual existing work.

Implement all public read routes: GET /api/products/offers, /api/products/newarrivals, /api/products, /api/products/:id, /api/categories, /api/categories/:title, and /api/information/support. Implement query filters keyword/category/page/pageSize/sort, input caps, deterministic sorting/pagination/count, case-insensitive name/title/category search, correct URL-decoded category titles and slugs, and safe no-result behavior. Register static paths before dynamic :id. Create an explicit serializer with observed legacy field keys: product `image`, nested `models[].price` and `memorySizes[].price` serialized as decimal strings, `colors` as name array, and category landing content. All responses use {success,data,meta}, and support returns an explicitly documented {html,locale} under data; do not serve arbitrary unsanitized HTML. Offers are active only when in their schedule, do not relaunch 2025 campaigns. Keep product inStock and marketing soldOut distinct.

Add Supertest + real PostgreSQL integration tests for each read endpoint, filtering, missing product/category, invalid pagination, price sorting, nested SKU DTOs and content. Explicitly validate the model/full price vs memory/increment semantics and not double-add startingPrice. No fake product hardcoding in routes. Run targeted tests, typecheck, lint, build; report exact results and files. Do not touch authentication/cart/orders yet. No push/PR/deploy.
```

**Exit gate:** 6 legacy read paths + new categories list serve DB data; read contract documented and tested.

---

## P05 — Registration, login, JWT validation and ADMIN authorization

**Model:** GPT-6 Astra  
**Thinking:** High  
**Repository:** `clu-store-api`  
**Dependencies:** P02 (can run after P04)  
**Commit suggestion:** `feat(auth): implement secure jwt authentication and roles`

```text
Implement P05 in clu-store-api after reviewing source, docs, AGENTS.md if present and local git status. Do not overwrite user edits. Implement POST /api/auth/register and /api/auth/login via Zod, Argon2id, robust normalized uniqueness, generic authentication failure messages and strict auth rate limiting. Canonical register body {username,email,password,confirmPassword}; optionally accept legacy capitalized ConfirmPassword while marking it deprecated. Require valid email for V1; do not silently make users with no email because the historical Postman lacks it. Canonical login {identifier,password}, also support {username,password}. Output safe user fields only and JWT token metadata; never return passwordHash.

Implement signed JWT with env-only strong secret, issuer, audience, UUID subject, finite expiration, supported-algorithm allowlist; middleware re-fetches role from DB or applies an explicit role freshness policy. Add requireAuth and requireRole('ADMIN'); never accept client-sent role on register. Admin provisioning must be an explicit CLI using operator-provided secret, no fixed admin account/password in seed. Document token TTL, signing choices and limitations for demo use. Redact credentials/headers in Pino logs and error middleware. Ensure login errors do not distinguish user-not-found vs wrong-password.

Test with real DB registration, duplicate username/email including case variations, invalid confirmation/email/weak password, login by either identifier, bad credentials, invalid/malformed/expired JWT, invalid issuer/audience/signature, role guard, and no passwordHash leakage. Run targeted tests and lint/typecheck/build. Report actual results, design/security tradeoffs and P06 prerequisites. No push/PR/deploy.
```

**Exit gate:** Secure JWT authentication and reusable ADMIN policy, with real DB tests and negative cases.

---

## P06 — Persistent cart and authoritative configuration pricing

**Model:** GPT-6 Astra  
**Thinking:** High  
**Repository:** `clu-store-api`  
**Dependencies:** P04 + P05  
**Commit suggestion:** `feat(cart): persist user carts with trusted sku pricing`

```text
Implement P06. Inspect local git status, docs, current auth/catalog/data code and AGENTS.md if present. Use a single cart domain router explicitly exposed under BOTH `/api/ShoppingCart` (legacy) and `/api/shopping-cart` (canonical), with intentional case handling.

Implement GET /api/ShoppingCart/fake-shopping-cart (deterministic synthetic public demo, never real user data), authenticated GET /api/ShoppingCart, POST /api/ShoppingCart/items, DELETE /api/ShoppingCart/items/:id and DELETE /api/ShoppingCart/items. Canonical POST body {productId,modelId,memorySizeId,color,qty}; optional legacy name/imageSrc/model/modelPrice/memorySize/memorySizePrice are accepted solely for migration and discarded as untrusted. Look up product/model/memory/color under the same product, check availability and use Prisma Decimal `model.price + memory.extraPrice` as the only unit-price source. Never add startingPrice to model.price. Store and return currency CNY, decimal amount strings, structured item DTOs. Merge only on full (productId,modelId,memorySizeId,color) key; distinct configurations remain separate. Scope all reads/deletes to authenticated user; use DB unique constraints/upsert or a transactional approach to avoid race-created duplicates. Cap item quantity and total item count; return appropriate 201/200/204/401/404/422 outcomes.

Add focused real Postgres tests: token missing/invalid, private cart isolation, valid add, full-config merge, different-config separation, tampered prices ignored, cross-product model/memory rejected, out of stock, delete own/another user's line, clear cart, alias routes, maximum quantity and invalid payload. Run tests, lint, typecheck, build. If the existing frontend still uses an in-memory cart, leave frontend modifications for P12; do not silently bridge via mock. No push/PR/deploy.
```

**Exit gate:** User-owned cart; server prices; SKU-specific merge and alias routes verified.

---

## P07 — Transactional checkout, order snapshots and idempotency

**Model:** GPT-6 Astra  
**Thinking:** Extra High (`xhigh`)  
**Repository:** `clu-store-api`  
**Dependencies:** P02, P05, P06  
**Commit suggestion:** `feat(orders): implement transactional checkout and idempotency`

```text
Implement the highest-risk phase, P07. Read docs/data-model.md, docs/api-contract.md, existing cart/auth/Prisma source, migrations, and AGENTS.md if present; check local git status first. DO NOT simplify this into nontransactional multiple Prisma calls or mock the database. No push/deploy/PR.

Implement POST /api/orders/place, authenticated. Recommended body is empty {}: place an order from the CURRENT USER's persisted cart. Validate optional Idempotency-Key (document size/format) and optional legacy single-SKU request format. If a legacy SKU request is supported, ignore all client product names/images/prices, resolve and validate the product configuration in DB, and clearly decide/document whether it leaves the cart unchanged (recommended: yes, direct-item mode does not consume the cart). Entire checkout must use a real PostgreSQL transaction: re-read and validate owner/cart items, re-evaluate live stock/option ownership and current Decimal model+memory pricing, create order with pending status, immutable item/name/configuration/unit-price snapshots, total and currency, insert initial status history entry, and atomically delete the purchased cart items if cart mode. No client-specified total/shipping/payment fields are trusted.

Enforce per-user unique idempotency keys and persisted request fingerprint. Replay the same key BEFORE rejecting an empty cart, returning exact prior order (200); first create is 201. Reuse of a key with a different direct-item payload or incompatible request mode must be 409. Handle simultaneous same-key checkout attempts with a uniqueness constraint and appropriate row locking/serializable transaction + bounded retry for recognized serialization conflicts. Prevent double orders with the same key even when requests overlap. Cart clear and order insertion must roll back together on DB failure. Mark invalid/out-of-stock/empty carts with stable 422 errors and preserve cart on failure.

Write real PostgreSQL concurrency and rollback integration tests (Promise.all simultaneous requests), duplicate header replay, different-user same key, conflicting same key, empty cart, wrong stock/config, forced failure after partial work, snapshot price changes after order, and total correctness. Do not claim serializability solely from unit tests. Run targeted and cross-module tests, typecheck/lint/build with actual logs. Summarize transaction isolation choice, unique indexes, retry strategy, observed test results and residual risks. No automatic deployment, commit, push or PR.
```

**Exit gate:** All order-related persistence atomic and idempotent even under concurrent replay.

---

## P08 — Owner order history and atomic ADMIN state transitions

**Model:** GPT-6 Astra  
**Thinking:** High  
**Repository:** `clu-store-api`  
**Dependencies:** P07  
**Commit suggestion:** `feat(orders): enforce admin transitions and audit history`

```text
Implement P08. Start by reading docs/ and current order/auth source, AGENTS.md if available, and `git status --short`. Add GET /api/orders/:id for owner or ADMIN, GET /api/orders for paginated own orders, GET /api/admin/orders for ADMIN-only paginated all orders. Ensure inaccessible user orders are not disclosed; stable 404 for another user's ID is acceptable. Use configured sorting and index-friendly pagination. Safe response includes order and item snapshots/status history but no user password hashes or JWT claims.

Implement POST /api/orders/:id/approve and POST /api/orders/:id/reject with requireAuth + ADMIN role. Normalize optional legacy `metadata` string to bounded structured metadata without trusting input. Valid state transitions ONLY pending->approved or pending->rejected. Use an atomic conditional state update inside a real PostgreSQL transaction with insertion of OrderStatusHistory (operatorId/fromStatus/toStatus/timestamp/metadata). A competing approve/reject must result in exactly one success and one 409, never two success replies and never inconsistent history. No 'unapprove', no repeated approvals, no payment gateway side effects or fake paymentUri.

Test with two users and one ADMIN: own history, other-user restriction, noauth restrictions, nonadmin transition 403, valid approve, valid reject on separate order, repeated/cross-state 409, missing IDs, and concurrent opposite actions. Re-query DB history to assert operator and exactly one state transition. Run tests, lint, typecheck, build and report the actual outputs. No push/PR/deploy.
```

**Exit gate:** Correct order authorization + conflict-safe audited status machine.

---

## P09 — OpenAPI, Swagger UI, contract generation and sanitized Postman

**Model:** GPT-6.1 Sol  
**Thinking:** Medium  
**Repository:** `clu-store-api`  
**Dependencies:** P04–P08  
**Commit suggestion:** `docs(api): publish openapi and sanitized postman collection`

```text
Implement P09 after inspecting local git status, all active routers/Zod schemas, current docs, AGENTS.md if present and the supplied original Black_Apple_API.postman_collection.json. Treat the original collection as SENSITIVE and do not copy it into tracked paths, source examples or PR descriptions.

Generate maintainable OpenAPI 3.x documentation from a single coherent runtime/type source, ideally Zod plus compatible schema registry tooling, and expose GET /docs Swagger UI plus a raw spec JSON URL. Cover all 17 historical method/paths and newer endpoints, case-accurate legacy aliases, pagination, query sort, body examples, decimal monetary STRINGS, JWT bearer security, success/error envelopes, state machine, idempotency and exact status codes. Identify deprecated ConfirmPassword and legacy client price fields. Make the original path shape functional but explicitly document that new payloads use {success,data,meta} and require a frontend adapter.

Generate `postman/CLU_Store_API.sanitized.postman_collection.json` ONLY from new safe API definitions. It must use {{baseUrl}} and {{accessToken}} as variables; every Authorization bearer value should be `{{accessToken}}`; no other hardcoded Authorization header, old IP/host, real JWT, passwords, or stale cURL descriptions. Use synthetic credentials only in examples and state they are not provisioned. Add harmless Postman examples/response schemas and a quick import/run README. Scan all generated files with a programmatic secrets/legacy-origin check, not just manual review.

Validate OpenAPI JSON syntax, 17 legacy route coverage and auth security declarations; validate Postman v2.1 JSON, unique collection endpoint coverage and zero embedded token-like strings. Run lint, typecheck, targeted docs tests and build. Report validation checks and outputs, without echoing sensitive values. Do not push/PR/deploy.
```

**Exit gate:** Every route documented; importable sanitized collection; no secrets or old host references.

---

## P10 — Complete negative-case and transactional integration test suite

**Model:** GPT-6 Astra  
**Thinking:** High  
**Repository:** `clu-store-api`  
**Dependencies:** P09  
**Commit suggestion:** `test(api): cover transactional and authorization edge cases`

```text
Execute P10 quality gate. Read README, docs, AGENTS.md if any, current tests and migrations; inspect git status first. Assess test coverage against the detailed list in 03_IMPLEMENTATION_ROADMAP.md. Add missing real PostgreSQL + Vitest + Supertest tests without rewriting passing functionality. Use a dedicated TEST_DATABASE_URL and guard against accidentally resetting development/production data. Seed tests deterministically and isolate per test run. Test process must be reproducible locally and in GitHub Actions.

Coverage: register success, duplicate email/username, mismatched password, login both identifiers, invalid/expired/forged JWT; product list/keyword/category/pagination/sort/not found; marketing/category/support; cart noauth/owner isolation/merge by full SKU/clear/delete/tampered-price rejection; checkout empty/positive order/price derivation/transaction rollback/Idempotency-Key conflict and simultaneous duplicate/concurrent checkout; order-owner access/ADMIN-only approve or reject/legal and illegal transitions/status history; all capitalized and lowercase cart aliases; deterministic 400/401/403/404/409/422/429/500 envelopes. Add a contract test that checks documented OpenAPI method/paths against mounted routes. Avoid superficial mocks for Prisma transaction checks.

Run the least expensive affected test suites while developing, then ONE complete final set: npm run lint, npm run typecheck, npm test, npm run build. Report actual passing/failing counts, any skipped tests and why. If failure is environmental, diagnose and leave it marked as blocked with evidence; never claim PASS without execution. Do not push/PR/deploy.
```

**Exit gate:** Meaningful real-DB integration tests and reproducible toolchain commands.

---

## P11 — Production Docker image, Compose lifecycle, CI and operations docs

**Model:** GPT-6.1 Sol  
**Thinking:** High  
**Repository:** `clu-store-api`  
**Dependencies:** P10  
**Commit suggestion:** `build(api): add production docker image and github actions`

```text
Implement P11 production packaging after reading existing compose/Prisma/app/package files, docs, AGENTS.md if present, and git status. Never disrupt other local Docker projects or delete unrelated volumes. Build a small multi-stage Dockerfile for Node 24 LTS and the pinned Prisma 7 generation flow (ensure native dependencies/adapter work in runtime). Compose must support BOTH api and postgres services, healthchecks, a persistent named Postgres volume, dependency readiness and env variable injection without exposing secrets. Implement graceful SIGTERM/SIGINT close of HTTP server and Prisma client. Explicitly run checked-in migrations (migrate deploy) as an operator-command or migration job, not automatically destructive schema pushes. Document how to start DB only for local Node development vs all containers for self-hosting, logs, updates, restart, backup/restore and DB URL differences. Bind DB host port to loopback by default.

Add GitHub Actions PR/push workflow with reproducible npm ci, lint, typecheck, Postgres-backed integration tests and build; use test-only secrets/database credentials provisioned in CI and no published artifacts carrying secrets. Add README with route outline, commands, admin-creation CLI, Postman docs, security assumptions and operations troubleshooting. Do not add cloud deployment or public DNS/TLS unless documented as future work.

Run docker compose config, docker compose build, docker compose up --build -d (if developer environment permits), inspect service health, curl /health and /ready, repeat migration/seed safety checks on an isolated DB, and finally test/lint/typecheck/build if changed. Report actual commands, status and blockers. Do not push, publish container images, create PR or deploy.
```

**Exit gate:** Working image + Compose lifecycle + CI plan, with no secret leakage and verified readiness.

---

## P12 — React 19 frontend migration to the new API (separate repository)

**Model:** GPT-6.1 Sol  
**Thinking:** High  
**Repository:** `clu-store-client` (read-only backend unless explicitly necessary)  
**Dependencies:** P11  
**Commit suggestion:** `feat(client): integrate live api and reconcile commerce flows`

```text
Implement P12 in the locally opened DIFFERENT repository, clu-store-client. First inspect git status, AGENTS.md if present, README, package.json, router/hooks/pages/types, and the published local clu-store-api OpenAPI contract. Preserve the existing React 19/Vite/React Router UI, styling and uncommitted user work. Do not push/create PR/deploy and do not rewrite backend architecture without an explicit blocking contract issue.

Add a single typed API client around env-driven VITE_API_BASE_URL and the standardized `{success,data,meta}` envelope. Strip all hardcoded calls to the mentor's old server. Add request abort/error handling and model types synchronized from OpenAPI where feasible. Prices arrive as decimal strings in CNY and are FOR DISPLAY only; server remains checkout authority. Home offers/new arrivals should load from API with safe fallback states, product search should send keyword, category, page, pageSize/sort; actually use returned meta for pagination and prevent page<1/empty debounced queries from issuing invalid calls. Product detail must unwrap data and respect the correct model.price + memory upgrade rule; correct the current startingPrice double count and inconsistent PriceTag. Maintain `image` mapping and normalize category nulls.

Replace hardcoded mocked login with POST /api/auth/login (username/email identifier), implement POST /api/auth/register with confirmation, and make auth guard validate server-issued token expiration/401 handling. Document the security tradeoffs of localStorage vs short-lived in-memory tokens; do not treat an arbitrary string in localStorage as proof of session. Move shopping-cart operations to GET/POST/DELETE `/api/shopping-cart`, merge by full SKU and use backend cart IDs; fix the current CartItem arithmetic/precedence bug and React reducer's product-only merge. Remove the hardcoded shipping amount from authoritative checkout; if shown as an estimate label it, but the V1 order total excludes shipping. Implement checkout call with a per-attempt generated Idempotency-Key, route to actual order detail/history, no fake payment flow. Sanitize/escape remote HTML before dangerouslySetInnerHTML or switch to safe structured rendering.

Add focused tests where possible (API client, price display, auth forms, pagination, cart and checkout) and run actual frontend npm lint, TypeScript check, build, and a real backend+frontend smoke workflow. If existing frontend unrelated type/build failures surface, report and minimally repair those within scope. Report every changed file and actual verification. No push/PR/deploy.
```

**Exit gate:** Real frontend calls; money displayed consistently; auth/cart/checkout functional; old-host references removed.

---

## P13 — Final security, correctness and self-hosting acceptance audit

**Model:** GPT-6 Astra  
**Thinking:** Extra High (`xhigh`)  
**Repository:** `clu-store-api`, with frontend integration validation when available  
**Dependencies:** P00–P12  
**Commit suggestion:** `chore(api): close security audit and freeze v1 contract`

```text
Perform P13 FINAL AUDIT, not an opportunistic rewrite. Inspect current local git status on BOTH repos; read their AGENTS.md/README/docs, the OpenAPI spec, package lockfiles, fixtures, migrations, CI definitions, Postman collection and implementation/test source. Preserve all user edits; do not push/deploy/create PR.

Build a method+path route inventory and verify each of the 17 original routes plus `/api/shopping-cart` aliases and new categories/orders/health/docs. Audit authentication, JWT audience/issuer/expiration, USER/ADMIN separation and case-insensitive route normalization. Check every controller/service for client-controlled price, unvalidated product ID/configuration, SQL injection, logs containing password/token/header, sensitive error details, unsafe CORS/trust proxy, dev/admin password fixtures and support HTML XSS. Verify model.price plus memory.extraPrice only; compare each SKU quoted cart price, actual order price, and preserved order snapshot. Inspect DB migration constraints, indexes, delete strategies and rollback/concurrent idempotency guarantees under real PostgreSQL. Confirm seed rerun stability and handling of inactive 2025 campaigns.

Perform a programmatic scan of CURRENT TRACKED FILES for real JWT-like strings, secrets, old-host references, absolute Authorization header values and accidentally tracked .env; do NOT echo secret values to logs or audit report. A clean tracked-file scan does not imply old Git history is scrubbed; report history exposure separately if relevant and NEVER rewrite Git history without authorization. Validate generated sanitized Postman and OpenAPI. Check container/Compose health and migrations, run final lint/typecheck/test/build exactly once after fixes, backend + frontend smoke flows if environment available, and document any skipped/out-of-scope condition.

Create docs/v1-release-audit.md containing: 17/17 endpoint matrix, auth matrix, migration and seed reproducibility, actual commands/exits/test counts, security findings with severity, verified Docker health, current known gaps and explicit GO / NO-GO. Only state GO if every defined V1 gate was truly verified. No fake success statements, automatic commits/push/releases/deployments/PRs.
```

**Exit gate:** Audited backend/frontend V1 ready for developer approval and optional **separately authorized** deployment.

---

## Post-run report template for each prompt

Ask Codex to finish every phase with:

```text
Phase: Pxx — title
Repository / branch / git status:
Files changed (new/modified/deleted):
Important architectural decisions:
Implemented endpoints / behavior:
Migration and seed changes:
Commands ACTUALLY executed (with success/failure):
Tests run, pass/fail/skip counts:
Known issues, security issues, blockers:
Next phase prerequisites:
No push / no deployment / no PR confirmation:
```

This format prevents a sequence of AI-generated code changes from obscuring incomplete migrations, failed tests or unreviewed local edits.

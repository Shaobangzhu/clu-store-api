# P03 historical first-pass verification

This records the earlier frontend-only run before the response samples were supplied. Current sample coverage and results are in [p03-sample-reconciliation.md](p03-sample-reconciliation.md); the missing-input statements below are historical, not current blockers.

Local execution: 2026-10-20 (America/Los_Angeles), branch `main`, initially clean API working tree. No repository/parent AGENTS.md was found. Existing schema and current source were inspected; no schema change or migration was needed. No dependencies were installed. No commits, pushes, PRs, deployments, resets, remote media downloads or web scraping were performed.

## Input scope

The six response JSON files were not found in checked local input/project/Downloads/Desktop locations. A local `../clu-store-client` checkout was available. Its static product/marketing data was read without executing source code, scanned before tracked fixture creation, archived separately under ignored local input, and curated as an explicitly labeled frontend demo catalog. Its unrelated untracked hook remained untouched.

This fulfills the local-demo seed path, **not full original-response reconciliation**. Product IDs 2/6 are independently available and preserved; 7/15/22/31/42 remain reserved. The unavailable category's 16 summaries/videos/editorial features are excluded rather than fabricated. See [fixture-provenance.md](fixture-provenance.md) for input hashes, ID mappings, price fixes, model/memory transforms, original support text and media exclusions.

## Commands and outcomes

| Command | Exit / result |
|---|---|
| `git status --short` | 0; API initially clean |
| `git branch --show-current` | 0; `main` |
| `git -C ../clu-store-client status --short` | 0; unrelated untracked hook preserved |
| `git -C ../clu-store-client rev-parse HEAD` | 0; source commit recorded in fixtures |
| `docker compose ps` | 0; existing PostgreSQL healthy at loopback 5433 |
| `./node_modules/.bin/prisma migrate status` | 0; existing initial migration up to date |
| `node --import tsx scripts/curate-frontend.ts /Users/luchaora/Documents/Projects/clu-store-client` | Initial attempt failed when sandboxed Node could not spawn Git (OS error -86); no tracked catalog was written. Git lookup was removed from the parser and the separately verified commit supplied explicitly below. |
| `node --import tsx scripts/curate-frontend.ts /Users/luchaora/Documents/Projects/clu-store-client c23689102ff2a9bcd18ad03b57107608f1d9ba25` | 0; 12 curated demo products and separate evidence written |
| `npm run lint` | 0 |
| `npm run typecheck` | 0; includes seed, curation and verification code |
| `npm test` | 0; 40 tests in 3 files passed |
| `npm run db:seed:verify -- before` | 0; queried pre-seed counts/IDs/sequences; no application data present |
| `npm run db:seed` | 0; first transaction committed |
| `npm run db:seed:verify -- after-first` | 0; exact fixture values and relationships verified against database |
| `npm run db:seed` | 0; second transaction committed |
| `npm run db:seed:verify -- after-second` | 0; exact normalized snapshot equality, counts, IDs and sequences verified |
| `npm run build` | 0 |

The seed ran against local `clu_store_dev` using `clu_dev`, after verifying both the configured target and actual PostgreSQL database/role. It used only upserts and monotonic sequence synchronization, with no table resets or pruning.

## Queried counts and stable IDs

| Entity | Before | After first | After second |
|---|---:|---:|---:|
| Categories | 0 | 3 | 3 |
| Products | 0 | 12 | 12 |
| Models | 0 | 23 | 23 |
| Memory options | 0 | 41 | 41 |
| Colors | 0 | 39 | 39 |
| Offers (all inactive) | 0 | 6 | 6 |
| New arrivals | 0 | 8 | 8 |
| Support records | 0 | 1 | 1 |
| Users / carts / cart lines | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Orders / order items / history | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

Product IDs after both runs: `1,2,3,4,5,6,9,10,11,12,1001,1002`. Product 2 belongs to Phones category 1. All model/memory/color IDs are deterministic and unique; all references match their owning products. Product 3 remains unavailable. Every other product is purchasable only as a labeled synthetic frontend demo configuration. One arrival links to product 1001; seven remain unlinked editorial/unverified cards.

Full query snapshots remain in ignored `local-data/p03-seed-verification/{before,after-first,after-second}.json`. Comparison excludes automatic create/update timestamp fields; it includes every seeded field, child option, FK, count, and sequence last value.

- Normalized fixture hash: `fc170d2f855eb652a07d8026c528cd695a42c562f584d0242dc86d7f78334026`.
- Before snapshot hash: `0f02882c55bd97f152713ec818fa7846b030783cad500843a4e381d705f89b36`.
- After-first and after-second snapshot hash: `27e377b5cb8bceef3b701a6c411f482b26b02e68cb01f48176b5eaad800db3bf`.

## P04 readiness and remaining inputs

P04 can implement product list/detail, category navigation/detail, display-ordered arrivals and original support from this schema and demo seed. Active-offer queries will correctly return no offers until a separately reviewed current campaign exists. It must serve the original local placeholder at `/media/demo-placeholder.svg`, preserve demo labels, validate availability, and serialize Decimal amounts as fixed-scale strings. No new HTTP endpoints were added in P03.

Full sample coverage remains pending the six JSON files in `local-input/response-samples/`. Reconcile their records and observed IDs before claiming equivalence to the server samples. No fabricated entries or model options stand in for the missing 16-summary category.

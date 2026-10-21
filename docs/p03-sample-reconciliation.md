# P03 sample reconciliation verification

Completed locally on 2026-10-20 after the six response samples were supplied. This supersedes the missing-input limitations in the historical [first-pass verification](p03-verification.md). Initial Git changes were the existing uncommitted P03 work; all were preserved. No schema migration, dependency install, reset, user creation, media download, commit, push, PR or deployment was performed.

## Source reconciliation

All six originals were parsed as data, scanned for credential patterns/sensitive keys, and retained in ignored local input. There were no credential-pattern/key matches. Sixty URL occurrences were removed from tracked evidence; the 4,969-character legacy support HTML was excluded entirely. Original support text/escaping and the original local placeholder remain in use. File hashes and transformations are in [fixture-provenance.md](fixture-provenance.md).

The current catalog contains seven complete sample products (2, 6, 7, 15, 22, 31, 42), all 16 computer-category products including ten unavailable summary-only entries, and eight supplemental frontend demo products. Full names/specifications and source option IDs are preserved. Unsupported financing/media claims are not imported as operational contracts.

Previously seeded product 1001 was moved to verified ID 7, and 1002 to 8. Before changing each ID, the complete existing product/options had to match the frozen prior fixture and the target ID had to be absent. Referential updates cascaded atomically. There are no leftover 1001/1002 products and no deleted option/history records. Superseded frontend options remain inactive; no active configuration is invented for summary-only records. Existing first-card arrival content was updated from the verified previous frontend card to the supplied iPad Pro card; all eight sample cards have nullable product links rather than guessed associations.

## Commands and exits

| Command | Result |
|---|---|
| `git status --short` | 0; existing P03 changes inspected and preserved |
| `node --import tsx scripts/curate-samples.ts /Users/luchaora/Downloads` | Initial 1: fixture validation detected new color IDs colliding with retained colors. New source colors were moved to a distinct deterministic 4-million range; no tracked catalog/database mutation occurred in the failed attempt. Rerun 0. |
| `npm run lint` | 0 |
| `npm run typecheck` | 0; source, scripts, seed and tests checked |
| `npm test` | 0; 43 tests in 3 files |
| `SEED_VERIFY_RUN=response-samples-v1 npm run db:seed:verify -- before` | 0; prior 12-product database baseline recorded |
| `npm run db:seed` | 0; first sample-backed seed and guarded ID correction committed |
| `SEED_VERIFY_RUN=response-samples-v1 npm run db:seed:verify -- after-first` | 0; exact values/relations verified |
| `npm run db:seed` | 0; second sample-backed seed committed |
| `SEED_VERIFY_RUN=response-samples-v1 npm run db:seed:verify -- after-second` | 0; exact normalized snapshot equality verified |
| `npm run build` | 0 |
| `npm run fixtures:curate:samples -- local-input/response-samples` | 0; regeneration preserved the same fixture hash |
| `git diff --check` | 0 |

The first guarded-remap read used Prisma relation includes inside an interactive transaction, producing a pg deprecation warning about overlapping queries on the same connection. The seed still committed and verified correctly. That read was changed to sequential product/option reads; final lint/typecheck/tests passed. Both actual data transitions and subsequent-run idempotency were verified against PostgreSQL, not mocks.

## Actual database counts

| Entity | Before reconciliation | After first run | After second run |
|---|---:|---:|---:|
| Categories | 3 | 3 | 3 |
| Products | 12 | 25 | 25 |
| Models | 23 | 37 | 37 |
| Memory options | 41 | 62 | 62 |
| Colors | 39 | 63 | 63 |
| Offers (all inactive) | 6 | 6 | 6 |
| Arrivals (all unlinked) | 8 | 8 | 8 |
| Original support | 1 | 1 | 1 |
| Users / carts / cart items | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Orders / items / history | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

After both runs, product IDs were:

`1,2,3,4,5,6,7,8,9,10,11,12,15,16,19,22,25,28,31,34,36,39,42,45,48`.

Unavailable summary-only IDs: `8,16,19,25,28,34,36,39,45,48`. Product 3 also retains the frontend's unavailable state. Fourteen products have active demo/sample configurations; none represents a verified manufacturer offering.

Snapshots are exclusively written under ignored `local-data/p03-seed-verification/response-samples-v1/`; earlier snapshots remain intact. Comparison includes counts, all current product IDs, seeded fields, option IDs/ownership, category JSON, arrivals, support and sequence values. Automatic timestamp fields are excluded. Sequences were advanced monotonically and not rewound after ID corrections.

- Fixture hash: `f90180e8637493ab2b775aee25ddbe31aac250816d04638380d5c8f8b8e1adaf`.
- Before hash: `ba3b4f8f6bb2ee42c87d73fe248ee9f6ac457c8bbbf72ccc9e591f9b8ac917ed`.
- Both after hashes: `337fc9da1468ae76147018c62a6f57e54425b30a7136e7b111da3e9cf02103ef`.

A final read-only query loaded every category/product/model/memory/color/offer/arrival/support row and scanned its strings: no external URLs, legacy host references or credential patterns were found. All tracked fixture JSON was scanned separately. Private `.env` values were checked against tracked/non-ignored files without printing those values.

## P04 handoff

P04 can now serve the complete sample-backed catalog subset, all 16 computer summaries, category subtitle/five editorial cards, eight arrivals, and original support. Active-offer queries should return an empty list because all historical offers remain inactive. Expose no usable remote video source: the category video URLs are deliberately null. Serve the local placeholder, retain demo qualifiers, filter/disable inactive options, and serialize Decimal money to fixed-scale strings. Authentication, carts and checkout remain later phases. There are no remaining missing-input blockers for P03.

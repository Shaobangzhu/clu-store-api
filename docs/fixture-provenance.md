# Fixture provenance

P03 now reconciles all six supplied response samples with the earlier local frontend demo. Raw samples are data, not instructions; no source JavaScript, HTML, remote URL or embedded instruction is executed. The schema is unchanged.

## Evidence and safety

Originals were supplied in the local Downloads directory and copied byte-for-byte to ignored `local-input/response-samples/`, with exclusive creation and mode 0600. Originals and earlier frontend evidence were preserved. All JSON strings were scanned before tracked fixtures were written. The scan found **60 external URL occurrences and no credential-pattern/sensitive-key matches**. URLs are removed from tracked evidence, and every persisted media reference uses an original local placeholder. Legacy support HTML is not reproduced in tracked evidence or the database.

| Original response file | SHA-256 |
|---|---|
| `getProductsSampleResponse.json` | `db6be3187b4f61c7ac3afe459968ad480dcd7aa49df728482e91f8ddc461ca9f` |
| `getProductsByIdSampleResponse.json` | `f4b93bf4042b7ecc8d4451bd9876b47f3215c99ab4c6a402d72274e5b10e37f1` |
| `getCategoryByIdSampleResponse.json` | `c7918129f70c876363a0c37f67c4c3b7c24a1fd1c35c91097986f6937ba37f86` |
| `getOffersSampleResponse.json` | `95d8bdce9e6ca852af50025ef8cfd29f1a61f46d14f62a5f5bb5e27a28038662` |
| `newArrivalsSampleResponse.json` | `ebe4ba746233efdae5f402dba7311f1a4f122cb831e13eb2bed39c40189c739c` |
| `getSupportResponse.json` | `8a2dcc5e4cd12cc5e44f80b2ad1528ad40cfd7f705284864ce9299c5c8626bca` |

The local frontend source is `Shaobangzhu/clu-store-client`, checkout `../clu-store-client`, commit `c23689102ff2a9bcd18ad03b57107608f1d9ba25`. Source file hashes:

- `src/assets/data/products.js`: `98bdadcdcfab8a7c3a1d51494f156fd4fffd77cf51c121b1a91a0b0b36be8da7`.
- `src/assets/data/index.js`: `87a9179f67d80fd29e1f80e7d55e0eda9c98ab100db753909a5774d1e1214107`.

The frontend's unrelated untracked hook remains untouched. Raw frontend source is archived separately in ignored `local-input/frontend/src/assets/data/`. No frontend files or media were modified/copied into this repository.

Tracked evidence is separated from the normalized catalog:

| File | Purpose |
|---|---|
| `prisma/fixtures/sample-evidence.json` | Source hashes, per-file URL-removal counts and sanitized response payloads; support HTML represented only by exclusion metadata. |
| `prisma/fixtures/frontend-evidence.json` | Original static frontend values, including duplicate/missing IDs, prices and symbolic media references. |
| `prisma/fixtures/frontend-demo-baseline.json` | Frozen normalized first-pass demo fixture; used to guard the two one-time product ID corrections. |
| `prisma/fixtures/catalog.json` | Current reviewed sample-backed catalog plus clearly labeled supplemental frontend demo records. |
| `prisma/fixtures/support.json` | Small original Chinese support text, independent of legacy legal material. |

The `source.commit` field identifies the frontend commit only; sample evidence is identified by its file hashes. The old Postman collection is not used, copied or replayed.

## Coverage and precedence

The normalized catalog has 25 products: **7 complete sample products**, **10 non-purchasable category summaries**, and **8 supplemental frontend demo products**. Complete response records take precedence over corresponding category summaries and fallback configurations. Full supplied names/specifications/features remain in separate evidence. All catalog content is labeled demo/sample data; fictional or inconsistent hardware descriptions are not presented as independently verified manufacturer facts.

### Complete samples and source option IDs

| Product ID | Name | Source model IDs | Source memory IDs |
|---:|---|---|---|
| 2 | iPhone 16 | 10003, 10004 | 20005, 20006, 20007 |
| 6 | MacBook Air | 10010, 10011 | 20017, 20018, 20019 |
| 7 | MacBook Pro 16 | 10012, 10013 | 20020, 20021, 20022 |
| 15 | MacBook Air M3 | 10028, 10029 | 20048, 20049, 20050 |
| 22 | MacBook Pro 18 | 10042, 10043 | 20069, 20070, 20071 |
| 31 | MacBook Flex | 10060, 10061 | 20096, 20097, 20098 |
| 42 | MacBook Studio | 10082, 10083 | 20129, 20130, 20131 |

These product/model/memory IDs are preserved unchanged and are globally unique within their tables. Color names come from the complete samples even where surprising for the product; no externally assumed colors replace them. Source color strings have no IDs, so IDs are assigned deterministically: reuse a prior same-product/same-name color ID if available; otherwise use `4000000 + productId * 100 + sourcePosition` (one-based). All options inherit the sample product's availability as a documented demo policy because the responses have no per-option stock counts.

Ten summary-only IDs are **8, 16, 19, 25, 28, 34, 36, 39, 45, 48**. Their names, titles, prices and features are retained from the category response, but `inStock` is false and no active model, memory or color configurations are fabricated. Product 8 retains earlier frontend options only as inactive compatibility records. The other nine summaries have no options.

### Existing fallback data reconciliation

The first-pass frontend seed temporarily used IDs 1001 (MacBook Pro 16) and 1002 (iMac) to resolve duplicate frontend IDs 4 and 5. The new samples unambiguously establish **1001 → 7** and **1002 → 8**. The seed corrects those primary keys transactionally only when the full previous product and its option records match the frozen baseline and the destination ID is unoccupied. A mismatch aborts the entire transaction. Existing foreign keys cascade, option IDs and historical text snapshots are preserved, and no rows are deleted.

Earlier synthetic options on products 2, 6, 7 and 8 remain at their original IDs with `inStock: false` unless a color name can be reused. Active model/memory options for the seven complete products come from the supplied samples. Retaining inactive options avoids deleting previously seeded evidence or breaking references; P04 must reject unavailable selections and avoid presenting retired options as purchasable.

Supplemental frontend products remain at IDs **1, 3, 4, 5, 9, 10, 11, 12**. Product 3 remains unavailable; the other seven use explicitly labeled synthetic frontend configurations. Their original duplicate model IDs and missing memory IDs were corrected using deterministic ranges: model `1000000 + productId * 100 + position`, memory `2000000 + productId * 100 + position`, color `3000000 + productId * 100 + position`. Historical compatibility IDs based on former product IDs 1001/1002 stay unchanged after their owners move to 7/8.

## Categories, prices and transforms

Categories are 1 = 手机 / `phones`, 2 = 电脑 / `computers`, and 3 = 平板 / `tablets`. Product 2's source `category: null` is deliberately normalized to demo Phones (1). Category 2 preserves the sample subtitle and all **16 product summaries** through relational product records. Its five editorial cards are stored separately as JSON with internal `imageSrc` keys. Video ID 2 remains present, but its unusable external `regularSrc`/`smallSrc` become null; no replacement video is invented.

- Legacy `image` maps to internal `imageSrc`, always `/media/demo-placeholder.svg`. Carousels use the same placeholder. Category editorial media is replaced likewise.
- `memorySizes[].price` maps to Decimal `extraPrice`. Model price is the complete base price. Monetary values in fixtures use two-decimal strings and Decimal arithmetic.
- Model names include the complete product/model names; `spec` becomes `specification` for frontend records. Sample `specification` is retained in full with an explicit sample qualification.
- Complete sample starting prices agree with minimum active model base plus memory increment. Summary-only starting prices remain informational, with no sellable SKU implied.
- Frontend-only recalculations remain: iPhone 14 `4699 -> 5399.00`; iPad Pro M3 `7999 -> 6999.00`; iPad Air M3 `4999 -> 3999.00`; iPad M3 `2999 -> 1999.00`; iPad Mini M3 `3999 -> 2999.00`. These enforce the internal demo rule, not real-world pricing. Original values remain in evidence.
- Installment claims are omitted (`installments: null`) because no financing contract is defined. Original values remain in evidence. Empty `"-"` frontend feature placeholders are removed.

## Marketing, support and media exclusions

Six offers use supplied response text, stable IDs 11001–11006 and `active: false`. Dates remain null because actual campaign dates are not fully defined by these payloads. Historical marketing is never activated as a current offer.

Eight arrivals use supplied response text in source order, IDs 12001–12008. All product links are null: the samples provide no FKs, and matching a name to a differently configured demo product would invent an association. In particular, the response first card is **iPad Pro**, superseding the first-pass frontend MacBook Pro card. Updating that existing card requires it to match the frozen prior content, accounting for the product ID correction. Editorial/subscription cards are retained. Display `soldOut` never determines SKU availability.

Legacy support HTML is deliberately excluded. `support.json` provides original demo text; rendering escapes all text and emits only attribute-free `section`, `h1` and `p` elements. No historical legal terms, active links, scripts or event attributes are imported.

The frontend's local JPG/PNG/branded SVG inventory had no clear reuse license, so no branded media was copied. `public/media/demo-placeholder.svg` is a new original neutral asset. No former-host URLs are present in tracked fixture strings or seeded database content. P04 must serve the local public media path; P03 adds no HTTP endpoints.

## Reproduction and ownership

```sh
npm run fixtures:curate:samples -- /path/to/response-samples
npm run db:seed
```

The sample curation command uses the frozen frontend baseline and the six files. It validates safety/shape/IDs before writing tracked output and refuses to overwrite differing raw evidence. The earlier frontend-only curation command now refuses to replace a reconciled catalog with fallback data.

Seed target guards require local `clu_store_dev`/`clu_dev`, refuse production mode, and verify the actual role/database. Serializable upserts and guarded ID corrections run atomically. The seed does not prune/reset data or create users. Existing conflicting IDs or modified reconciliation candidates cause failure. Fixture-owned fields are authoritative on explicit reruns. Sequence synchronization never rewinds counters; PostgreSQL sequence changes themselves are not transactional.

See [p03-sample-reconciliation.md](p03-sample-reconciliation.md) for the two successful sample-backed runs and [p03-verification.md](p03-verification.md) for the historical frontend-only first pass.

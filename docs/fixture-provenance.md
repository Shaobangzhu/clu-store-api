# Fixture provenance and missing inputs

No fixture files, product seed data, images, or sample payloads were found in this local repository. This phase creates no fixtures and assigns no IDs. The planning package reports seven original inputs, but they are outside this working tree. Place reviewed copies later in a safe local input directory (for example, ignored `local-input/`); keep secrets out of Git and never copy bearer tokens into documentation or fixtures.

## Inputs reported by the planning package

| Reported input name | Reported shape / notes | Local status |
|---|---|---|
| `Black_Apple_API.postman_collection.json` | Postman v2.1, 17 requests, empty response samples; bearer-like values and Authorization examples reported | Not present; treat as sensitive. Do not commit/replay original. |
| `getOffersSampleResponse.json` | Array of 6 promotional cards; former-server image links and historical campaign content reported | Not present. |
| `newArrivalsSampleResponse.json` | Array of 8 cards, including editorial/promotional entries | Not present. |
| `getProductsSampleResponse.json` | Array of 6 MacBook search results; reported IDs 6, 7, 15, 22, 31, 42 | Not present. |
| `getProductsByIdSampleResponse.json` | One product detail; reported product ID 2, category null, nested options/features | Not present. |
| `getCategoryByIdSampleResponse.json` | One category; reported category ID 2, Chinese title, 5 editorial cards and 16 product summaries | Not present. |
| `getSupportResponse.json` | Object with HTML string; reported legacy legal/promotional content | Not present; HTML is untrusted until reviewed/sanitized. |

The planning audit says inputs came from supplied attachments and a separate frontend repository. It also names inspected frontend files (including `src/pages/Home.tsx`, `src/assets/data/products.js`, product/search pages, cart/auth pages, support page and API helpers), but none of that frontend source is in this local API repository. These are planning-package claims, not locally reverified facts.

## Future provenance record requirements

When inputs are supplied, record for each accepted fixture: exact safe local filename, source/sample scope, extraction date if known, transformation, preserved numeric IDs and any deterministic remapping, duplicate resolution, omitted or redacted fields, asset replacement/license, and review status. Preserve only facts present in source. Do not invent descriptions, stock, prices, option relationships, offer dates, or assets to fill gaps. Resolve duplicate/inconsistent IDs explicitly before any seed is authored. Treat historical 2025 campaign content as inactive unless independently reviewed for a new use.

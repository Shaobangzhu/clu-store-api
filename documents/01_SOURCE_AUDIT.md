# CLU Store API — Source Audit and Compatibility Findings

**Review date:** 2026-10-19 (America/Los_Angeles)  
**Backend repository:** https://github.com/Shaobangzhu/clu-store-api  
**Frontend repository:** https://github.com/Shaobangzhu/clu-store-client  
**Scope:** Read-only architecture/documentation phase. No code, migration, database, Docker container, commit, push, deployment, or PR is created.

## 1. Verified repository inventory

| Repository | Observed state | Findings |
|---|---|---|
| `clu-store-api` (`main`) | Skeleton / effectively empty | Contains only `README.md` and `.gitignore`. README is a one-paragraph intended stack description. No `AGENTS.md`, `package.json`, source code, Prisma schema, migrations, tests, CI, or Docker files are visible in the remote `main` tree. |
| `clu-store-client` (`main`) | Functional but incomplete React frontend | React 19, TypeScript, Vite, React Router; static homepage card data; hardcoded old-host calls for product detail, search, and support; mocked login; React-memory shopping cart; no backend-based checkout flow. |

The remote GitHub tree is **not** a view of the developer's local working tree. Local uncommitted changes, local `git status`, Docker engine state, installed PostgreSQL containers, and local Git branches **cannot be verified** remotely. Each Codex implementation prompt therefore requires an actual local `git status --short`, `git branch --show-current`, and Docker inspection before modification. Do not assume the local repositories equal their remote `main` branches.

### Frontend files inspected

- `src/pages/Home.tsx`, `src/assets/data/index.js`, `src/assets/data/products.js`
- `src/pages/SearchResults.tsx`, `src/pages/ProductDetail/ProductDetail.tsx`, `src/pages/ProductDetail/PriceTag.tsx`, `src/components/ProductHero.tsx`
- `src/pages/SignIn.tsx`, `src/pages/Register.tsx`, `src/HOCs/RequireAuth.tsx`
- `src/pages/ShoppingCart.tsx`, `src/components/CartItem.tsx`, `src/reducers/shoppingCartReducer.ts`, shopping-cart context/provider
- `src/pages/Support.tsx`, `src/hooks/useApiData.ts`, `src/helpers/loaders.ts`
- `src/types/custom.d.ts`, routing, package scripts and dependencies.

## 2. Complete attachment inventory (seven files)

| Attachment | Source shape | Actual count | Important observations |
|---|---|---:|---|
| `Black_Apple_API.postman_collection.json` | Postman collection v2.1 | **17 requests** | Every `response` array is empty; several request samples contain JWT bearer values and Authorization examples; many descriptions are copied from unrelated requests. |
| `getOffersSampleResponse.json` | Array | 6 cards | Fields: `type`, `title`, `detail`, `image`, `soldOut`; all images refer to the former server; historical holiday marketing content. |
| `newArrivalsSampleResponse.json` | Array | 8 cards | Fields: `title`, `detail`, `image`, `textColor`, `soldOut`; some items are **editorial/promotional cards**, not purchasable product records. |
| `getProductsSampleResponse.json` | Array | 6 products | Search sample for MacBook; stable observed IDs 6, 7, 15, 22, 31, 42, with 12 model options and 18 memory options total. |
| `getProductsByIdSampleResponse.json` | Object | 1 product | Product ID 2 (`iPhone 16`); `category` is `null`; includes nested models, color strings, memory options, and feature list. |
| `getCategoryByIdSampleResponse.json` | Object | 1 category | Category ID 2 (`电脑`) with subtitle, video information, **5 editorial feature cards**, and **16 product summaries**. |
| `getSupportResponse.json` | Object | 1 HTML string | `{ "data": "<div ...>" }`; legacy promotional/legal footnotes include date-specific historical material. Treat the HTML as untrusted content for security/design purposes. |

## 3. Original Postman routes — all 17 accounted for

| # | Method | Historical route | Auth in V1 |
|---:|---|---|---|
| 01 | GET | `/api/products/offers` | Public |
| 02 | GET | `/api/products/newarrivals` | Public |
| 03 | GET | `/api/products` | Public |
| 04 | GET | `/api/products/:id` | Public |
| 05 | GET | `/api/categories/:title` | Public |
| 06 | GET | `/api/information/support` | Public |
| 07 | POST | `/api/auth/register` | Public, strict rate limit |
| 08 | POST | `/api/auth/login` | Public, strict rate limit |
| 09 | GET | `/api/ShoppingCart/fake-shopping-cart` | Public, demo-only |
| 10 | GET | `/api/ShoppingCart` | Bearer JWT |
| 11 | POST | `/api/ShoppingCart/items` | Bearer JWT |
| 12 | DELETE | `/api/ShoppingCart/items/:id` | Bearer JWT |
| 13 | DELETE | `/api/ShoppingCart/items` | Bearer JWT |
| 14 | POST | `/api/orders/place` | Bearer JWT |
| 15 | GET | `/api/orders/:id` | Bearer JWT, owner/admin |
| 16 | POST | `/api/orders/:id/approve` | Bearer JWT, **ADMIN only** |
| 17 | POST | `/api/orders/:id/reject` | Bearer JWT, **ADMIN only** |

**Security correction:** The legacy `approve order` request is labeled `noauth` yet also contains an Authorization header. The no-auth label is a contradictory and unsafe historical artifact, **not** an authorization requirement. Reject unauthenticated or non-admin mutations.

## 4. Concrete source discrepancies and risks

**R1 — Breaking response shape (critical integration decision).** Existing frontend code treats product list and detail responses as direct arrays/objects, and support as `{data: string}`. The new API requirement mandates `{success, data, meta}`. Preserve the standardized envelope and introduce a dedicated frontend API adapter/client when integrating, rather than silently claiming wire-level compatibility.

**R2 — Inconsistent authoritative pricing (critical).** Product `startingPrice` already equals a model's full starting price in the sample (e.g., product 2 has a 5,999 starting price and a 5,999 model price). `SearchResults.tsx` currently adds both and thereby double-counts; `ProductDetail.tsx` does not incorporate the selected model in total; the cart uses a different formula; `CartItem.tsx` has an operator-precedence bug when displaying an item price. V1 rule: **selected model base price + selected memory upgrade = unit price**. The server alone calculates it; never add `startingPrice` again.

**R3 — IDs and fixtures inconsistent.** The frontend static `products.js` includes reused/duplicate product IDs and model IDs, missing memory-size IDs, and a mixture of `spec` vs `specification`. Its product 7 differs from a static entry with reused ID 4. The attached server response samples contain more credible route-specific IDs but are only partial. Build a curated, deterministic seed manifest; preserve sample product IDs where possible, assign noncolliding new IDs to additional items, and fail validation on duplicates.

**R4 — Category content is more than a category label.** Legacy category payload also has `subTitle`, `videos`, editorial `features`, and nested product summaries. Add a documented CMS-like JSONB category-content representation (or a small separate content table) so `/api/categories/:title` can serve this shape.

**R5 — Marketing cards are not all products.** The 8 new-arrival cards include a subscription offer and content. To preserve them, allow a nullable linked product for editorial cards or model distinct editorial cards. V1 recommendation: nullable `NewArrival.productId` plus display fields, with `productId` required only for product-backed entries.

**R6 — Asset ownership and expired marketing.** The provided response JSON references an external legacy image host; none of those links should be copied into seeded production data. The provided promotions mention a **2025** event, no longer current in October 2026. Do not falsely activate historical offers. Use safely licensed local assets or documented placeholders and mark historical campaigns inactive.

**R7 — Support HTML/XSS.** `Support.tsx` uses `dangerouslySetInnerHTML`. Even if the supplied sample has no `<script>` tag, HTML can contain other active payloads and links. Either serve a reviewed/sanitized HTML allowlist and sanitize again at render, or migrate to trusted structured blocks. `target="_blank"` links should use safe `rel` behavior.

**R8 — Frontend mock auth and cart.** `SignIn.tsx` checks hardcoded demo credentials, writes a fake token; `RequireAuth.tsx` treats any `localStorage` token as sufficient. `Register.tsx` has no submission handler. The shopping cart lives in a reducer and is keyed/merged only by `productId`, even when SKU configuration differs. This requires a separate frontend integration milestone.

**R9 — Client-side shipping fee has no server counterpart.** `ShoppingCart.tsx` adds a hardcoded shipping amount, but the original order API has no shipping address/fee/payment contract. V1 must explicitly specify that checkout total covers item subtotal only and shipping/payment/tax is **out of scope**, rather than accept a client-declared amount.

**R10 — Legacy order and auth payload ambiguity.** Register uses `ConfirmPassword` and no email in Postman. Login uses `username`. Approve/reject carry arbitrary string `metadata`. The original GET-order request erroneously has a JSON body. Define validated compatibility adapters; GET bodies are ignored/rejected as appropriate, not copied into new docs.

**R11 — Public repo secret exposure in supplied material.** The provided Postman file embeds bearer JWT-shaped credentials and direct Authorization headers. Treat it as sensitive **even if tokens have expired**. Never commit, quote, or replay those credentials. Clean both structured auth fields, headers, raw URLs, and copied request descriptions when generating a sanitized collection. Consider revoking still-valid tokens if any exist.

**R12 — Frontend build quality requires its own gate.** `clu-store-client` currently has no test/typecheck npm script, and there are visible type/signature discrepancies. A backend API build cannot certify frontend integration. Run a separate frontend build/lint/typecheck and add end-to-end flows in the frontend milestone.

## 5. Verified reference URLs

- Backend tree: https://github.com/Shaobangzhu/clu-store-api/tree/main
- Backend README: https://github.com/Shaobangzhu/clu-store-api/blob/main/README.md
- Frontend package: https://github.com/Shaobangzhu/clu-store-client/blob/main/package.json
- Search: https://github.com/Shaobangzhu/clu-store-client/blob/main/src/pages/SearchResults.tsx
- Pricing UI: https://github.com/Shaobangzhu/clu-store-client/blob/main/src/pages/ProductDetail/ProductDetail.tsx
- Cart reducer: https://github.com/Shaobangzhu/clu-store-client/blob/main/src/reducers/shoppingCartReducer.ts
- Login: https://github.com/Shaobangzhu/clu-store-client/blob/main/src/pages/SignIn.tsx
- Support HTML: https://github.com/Shaobangzhu/clu-store-client/blob/main/src/pages/Support.tsx
- Static products: https://github.com/Shaobangzhu/clu-store-client/blob/main/src/assets/data/products.js

## 6. Verification and scope statement

Completed: remote repository-tree inspection; manual reading of relevant frontend source; structural parsing of all seven attachments; 17-route inventory; discrepancies and security-sensitive fields identified.  
Not performed: local git status; actual Docker inspection; npm install; compilation; migrations; tests; deployment; API HTTP calls; modifications to either GitHub repository. Remote file contents may differ from the user's local working directory.

# CLU Store API — V1 contract

**Status:** agreed target contract; no routes are implemented in this repository yet.

## Response and money rules

Every response with a body uses the envelope. Deletes return `204` with no body.

```json
{"success":true,"data":{"id":2},"meta":null}
{"success":true,"data":[],"meta":{"page":1,"pageSize":20,"total":0,"totalPages":0}}
{"success":false,"error":{"code":"VALIDATION_ERROR","message":"Invalid request","details":null}}
```

Monetary values serialize as decimal strings with two fractional digits (for example, `"5999.00"`) and a `currency: "CNY"` on monetary transaction DTOs/orders. Use Decimal end to end. A selected unit costs `ProductModel.price + ProductMemorySize.extraPrice`; product `startingPrice` is informational. Taxes, shipping, payment and inventory reservation are outside V1. The checkout total is item subtotal only.

## Original 17-route inventory

The original paths remain callable in V1, but the new envelope and validation rules mean raw legacy response/body compatibility is not promised.

| # | Method and path | Auth | Contract summary |
|---:|---|---|---|
| 1 | `GET /api/products/offers` | Public | Active, date-eligible offer cards. Historical campaigns are not presumed active. |
| 2 | `GET /api/products/newarrivals` | Public | Display-ordered cards; editorial cards may have no product ID. |
| 3 | `GET /api/products` | Public | Filter by keyword/category; page, pageSize (default 20, max 100), sort. Return product summaries plus pagination metadata. |
| 4 | `GET /api/products/:id` | Public | Product detail; original numeric ID, models, memory increments, colors and features. |
| 5 | `GET /api/categories/:title` | Public | Resolve title or slug; category content and product summaries. |
| 6 | `GET /api/information/support` | Public | `{html, locale}` in `data`; reviewed/sanitized HTML only. |
| 7 | `POST /api/auth/register` | Public, strict rate limit | Requires username, email, password, confirmPassword. `201` safe user. |
| 8 | `POST /api/auth/login` | Public, strict rate limit | `{identifier,password}`; returns bearer token metadata and safe user. |
| 9 | `GET /api/ShoppingCart/fake-shopping-cart` | Public | Fixed synthetic demo cart; never user data. Lowercase alias is also supported. |
| 10 | `GET /api/ShoppingCart` | JWT | Authenticated user's cart and computed amounts. Lowercase alias supported. |
| 11 | `POST /api/ShoppingCart/items` | JWT | `{productId,modelId,memorySizeId,color,qty}`; resolve valid SKU; merge by full configuration. |
| 12 | `DELETE /api/ShoppingCart/items/:id` | JWT | Delete an owned cart line; `204`. |
| 13 | `DELETE /api/ShoppingCart/items` | JWT | Clear own cart; idempotent; `204`. |
| 14 | `POST /api/orders/place` | JWT | Checkout own cart; require `Idempotency-Key`; server recalculates price and transactionally snapshots order/items/history and clears cart. `201` new, `200` replay. |
| 15 | `GET /api/orders/:id` | JWT owner or ADMIN | Order snapshots and status history. |
| 16 | `POST /api/orders/:id/approve` | ADMIN JWT | `pending -> approved` only; atomic history write. |
| 17 | `POST /api/orders/:id/reject` | ADMIN JWT | `pending -> rejected` only; atomic history write. |

### New V1 routes

`GET /api/categories` (public navigation summaries); `GET /api/orders` (paginated own orders); `GET /api/admin/orders` (ADMIN paginated/searchable orders); `GET /health` (liveness); `GET /ready` (database readiness); `GET /docs` (OpenAPI UI).

### Compatibility and deprecation map

| Legacy behavior/input | V1 handling |
|---|---|
| Direct arrays/objects and support `{data:string}` | Replaced by standard `{success,data,meta}` envelope (or error envelope). Frontend must use a typed adapter to unwrap `data`. |
| `/api/ShoppingCart` capitalization | Preserved exactly; explicitly register lowercase `/api/shopping-cart` aliases for the same cart paths. New clients should use lowercase. |
| Login `{username,password}` | Accept as a deprecated alias for `{identifier,password}`; normalize before auth. |
| Registration `ConfirmPassword` casing | Accept as deprecated casing alias for `confirmPassword`; email is required. No-email legacy registration is rejected. |
| Cart/order client-supplied name or price | Ignore and never use as authority. Server loads product/options and computes price. |
| `approve` marked `noauth` in old collection | Rejected. Both transitions require authenticated ADMIN. |
| Arbitrary legacy transition metadata | Only accept validated structured metadata if retained; it cannot alter authorization or state rules. Exact schema remains unspecified. |
| GET order request body in old collection | No body contract. Clients must not depend on it; ignore or reject according to HTTP parsing policy. |
| Legacy direct single-item checkout body | Cart checkout is canonical. Whether to retain a compatibility adapter is undecided; if supported later, validate SKU and ignore client pricing. |
| Legacy image URLs / old support HTML | Do not copy blindly; replace only with reviewed/local assets and sanitized content. |

Errors use stable codes such as `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `PRODUCT_NOT_FOUND`, `INVALID_PRODUCT_CONFIGURATION`, `EMPTY_CART`, `ORDER_INVALID_TRANSITION`, `IDEMPOTENCY_CONFLICT`, and `SERVICE_NOT_READY`. Use `400` malformed request, `401` unauthenticated, `403` wrong role, `404` missing/inaccessible resource, `409` uniqueness/transition/idempotency conflict, `422` invalid business selection, `429` rate limited, and sanitized `500`/`503` as appropriate.

Product list sort values: `newest` (default), `price_asc`, `price_desc`, `name_asc`, `name_desc`; deterministic ID tie-break. Search is bounded, trimmed and case-insensitive. No relevance ranking is defined.

Checkout idempotency is scoped per user and route. Same key and request returns the same order, including after the cart is empty. Same key with a different fingerprint returns `409 IDEMPOTENCY_CONFLICT`. Checkout state mutation is all-or-nothing in PostgreSQL. Order state machine and security gates: [architecture.md](architecture.md).

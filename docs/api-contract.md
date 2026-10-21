# CLU Store API — V1 contract

**Status:** P05 implements registration/login and reusable JWT/role guards alongside the seven P04 public reads and `/health`/`/ready`. Cart, order and documentation UI routes remain future V1 work.

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

## P02 operational behavior

`GET /health` returns `200` with `data: {status: "ok"}` and `meta: null`.
`GET /ready` performs a bounded real PostgreSQL query. It returns `200` with `data: {status: "ready", database: "up"}` and `meta: null` on success. Failure/timeout returns `503 SERVICE_NOT_READY` with `details: {database: "unavailable"}`; missing database configuration returns the same code with `database: "not_configured"`. Errors expose no connection details. Responses use `Cache-Control: no-store`. This checks connectivity, not migration currency.

Foundation error codes also include `NOT_FOUND` (404), `MALFORMED_JSON` (400), `PAYLOAD_TOO_LARGE` (413), `UNSUPPORTED_MEDIA_TYPE` (415 for unsupported body encodings), `CORS_ORIGIN_DENIED` (403), `RATE_LIMITED` (429), and `INTERNAL_ERROR` (500). Error envelopes have no success data/meta fields. `X-Request-Id` is server-generated on requests. CORS preflights and HTTP HEAD/204 responses have no JSON body.

## P04 public read details

All seven API routes return the success envelope with `meta: null`, except the paginated product list. Missing rows use error envelopes: `PRODUCT_NOT_FOUND`, `CATEGORY_NOT_FOUND`, or `INFORMATION_NOT_FOUND` (404). Malformed input uses `400 VALIDATION_ERROR`. A missing database dependency returns `503 SERVICE_NOT_READY`; internal errors do not reveal SQL, connection URLs or stack traces.

### Products and queries

`GET /api/products` accepts only `keyword`, `category`, `page`, `pageSize`, and `sort`. Unknown/repeated parameters and arrays are rejected. Page/pageSize are plain positive decimal integers (no signs, fractions, exponents or leading zeros): page defaults to 1, max 10000; pageSize defaults to 20, max 100. Keyword/category inputs allow at most 200 raw characters and 100 after trimming; control characters are rejected. Blank keyword means no search filter; blank category is invalid.

Keyword matches product name, title, category title or category slug, case-insensitively. Search text is a literal substring: SQL LIKE wildcard characters are escaped. The optional category filter resolves a case-insensitive title or slug, with title taking precedence; any case-insensitive identity tie uses ascending ID. Keyword and category filters combine with AND. Unknown category filters return an empty product list rather than a category error.

Sort choices remain `newest`, `price_asc`, `price_desc`, `name_asc`, `name_desc`. Newest orders by `createdAt DESC`; price uses the database Decimal starting price; name uses PostgreSQL collation. All primary sorts use ascending numeric ID as a deterministic tie break. Count, page rows and their nested configurations are read in one Repeatable Read database snapshot. No results give `data: []`, `total: 0`, `totalPages: 0`. Pages beyond the last return `[]` while retaining the actual count/page metadata.

List and detail data preserve these public keys:

- `id`, `name`, `title`, `image`, `carouselImages`, `features`, `inStock`, and category title string or null.
- `startingPrice` and nullable `installments`: fixed two-decimal strings, never JSON numbers.
- `models`: `{id,name,specification,price,inStock}`, with price as the **complete model base price** string.
- `memorySizes`: `{id,name,price,inStock}`, with price as the **incremental upgrade** string; internal `extraPrice` is not exposed.
- `colors`: names only, not internal color rows/IDs.

Only active model/memory/color records are exposed. Retired compatibility options remain stored but cannot appear as purchasable options. Summary-only unavailable products may have empty configuration arrays. Product `inStock` is its stored availability flag and is independent of marketing `soldOut`. Unit pricing in later checkout is model base plus memory increment; `startingPrice` is never added again. Catalog reads do not calculate a checkout or accept a price from the client.

`GET /api/products/:id` accepts only a positive integer within PostgreSQL Int32 range. Static `/offers` and `/newarrivals` are registered before `/:id`. Invalid IDs/encoding produce 400; valid missing IDs produce 404.

### Categories and editorial content

`GET /api/categories` returns `{id,title,slug,subTitle}` navigation rows ordered by ID. `GET /api/categories/:title` accepts one URL-decoded title or slug, at most 128 decoded characters, trimmed, without slashes/backslashes/control characters. Express decodes it exactly once; double-encoded text is not decoded again. Unknown detail categories return 404.

Category landing data contains navigation fields, `videos`, editorial `features`, and product summaries ordered by ID. Editorial images are exposed as `features[].image`, mapped from internal JSON `imageSrc`. Product summaries contain `id,name,title,image,startingPrice,installments,features,inStock`. Empty/missing video content becomes null; the source video object may retain its ID with null source URLs when no reusable video exists. No remote video is invented or fetched.

### Offers, arrivals, support and media

Offers require `active: true` and schedule eligibility: null start/end is unbounded; start is inclusive (`startsAt <= now`), end exclusive (`endsAt > now`). Ordering is ascending ID. P03's historical offers remain inactive, so the current demo returns no offers. The API does not activate campaigns or infer current eligibility from historical marketing text. Offer DTOs retain `type,title,detail,image,soldOut` plus ID and nullable linked product ID.

Arrivals are ordered by `displayOrder ASC, id ASC`, retain `title,detail,image,textColor,soldOut`, and include ID/nullable product ID. A card may be editorial; display state never changes product stock.

Support selects the controlled `support` / `zh-CN` record and returns `data: {html,locale}`. Stored HTML is capped at 100000 characters and sanitized on every read. Allowed tags are `section,h1,h2,h3,p,ul,ol,li,strong,em,br,code`, with no attributes or links. Scripts/styles/frames/SVG/math and their active contents are discarded. Missing content returns `INFORMATION_NOT_FOUND`; no arbitrary fallback/legal page is invented. The frontend should still sanitize HTML at render.

Media paths in public DTOs are local `/media/` paths. `GET /media/demo-placeholder.svg` serves only the reviewed original placeholder file; it is an image response outside the JSON API envelope. Other files/directories are not exposed. HEAD/conditional HTTP responses retain standard bodyless semantics.


## P05 authentication

These are deliberate V1 policies, not inferred fields from historical samples. The canonical request and response bodies are:

| Route | Request body | Success `data` |
|---|---|---|
| `POST /api/auth/register` | `{username,email,password,confirmPassword}` | `201 {id,username,email,role,createdAt}` |
| `POST /api/auth/login` | `{identifier,password}` | `200 {user:{id,username,email,role,createdAt},token,tokenType,expiresIn,expiresAt}` |

Both use `{success:true,data,meta}` with `meta:null` normally and `Cache-Control: no-store`. UUID user IDs are strings; dates are ISO timestamps. Registration always assigns USER, rejects a supplied role/unknown fields, and does not automatically log in. Login's `tokenType` is `Bearer`, `expiresIn` is integer seconds, and `expiresAt` agrees with the JWT expiration. No password, confirmation, hash, connection settings or signing key is serialized. Neither endpoint accepts query parameters.

### Identities and passwords

Username and email are trimmed and lowercased before storage and lookup. Usernames are ASCII, 3–32 characters, start with a letter/digit, and thereafter allow letters/digits/dot/underscore/hyphen (raw input capped at 100). Email is required, Zod-validated ASCII email, at most 254 characters after normalization (raw cap 300); its local part is deliberately case-insensitive in V1. Unicode usernames/internationalized email and implicit Gmail-style dot/plus equivalence are unsupported. This avoids Unicode case-fold/collation ambiguities without inventing missing legacy email data.

The existing PostgreSQL unique indexes on `lower(btrim(username))` and `lower(btrim(email))` enforce uniqueness, including concurrent registrations. Parameterized login lookups use those same expressions. An identifier containing `@` is an email; otherwise it is a username. Login input is capped at 300 raw/254 normalized characters. `%`, `_` and SQL-looking input are treated literally, never interpolated SQL. No schema migration or existing account rewrite is needed.

New passwords require 15–128 JavaScript string code units, including at least 15 after excluding leading/trailing whitespace for the length check. The original password is hashed unchanged; spaces and Unicode are supported. Single-character repetition and a small explicit common-password list are rejected. This local list is not a comprehensive breached-password service. Login permits 1–128 code units for compatibility and does not apply signup strength rules. Passwords are salted by Argon2id (v19, memory 65536 KiB, time cost 3, parallelism 1, 32-byte hash).

Exactly one confirmation field must be supplied and must match the parsed password string exactly. `ConfirmPassword` is a deprecated alias: successful use returns `meta:{deprecatedFields:["ConfirmPassword"]}`. Login likewise accepts exactly one of `identifier` or legacy `username`; the alias supports username or email and returns `meta:{deprecatedFields:["username"]}`. Supplying both aliases is rejected even when equal.

### Errors and abuse limits

Invalid bodies/confirmation/email/password return `400 VALIDATION_ERROR` with field paths and issue codes only. Any duplicate username or email returns `409 ACCOUNT_CONFLICT`, message `Unable to register with those account details`, without identifying which field conflicts. Registration still reveals that some account detail is unavailable; login does not reveal account existence.

Absent users, wrong passwords, missing/deleted token subjects, malformed/expired/invalid tokens all return `401 UNAUTHORIZED`, message `Authentication failed`, `details:null`; HTTP 401 includes `WWW-Authenticate: Bearer`. Unknown users perform verification against a randomly initialized Argon2id dummy hash with the same work parameters. This reduces timing differences; it is not a constant-time guarantee across database/network conditions. A valid user with the wrong role receives `403 FORBIDDEN` / `Access denied`. Missing auth configuration returns `503 SERVICE_NOT_READY`; unexpected database exceptions remain sanitized 500 errors.

The generic global limiter remains in effect. Register and login additionally share a default 10-attempt per-IP budget per 15 minutes (`AUTH_RATE_LIMIT_MAX`, configurable 1–20; `AUTH_RATE_LIMIT_WINDOW_MS`, 60000–3600000). It runs before JSON parsing, so malformed JSON counts. Validated attempts also share a default 5-attempt budget per normalized identifier (`AUTH_IDENTIFIER_RATE_LIMIT_MAX`, 1–10). The identifier is HMACed with an ephemeral random key before entering the memory store; registration uses username. Login username/email are separate identifier buckets; the IP budget applies across both. All outcomes, including successes, count. Exceeding a budget returns `429 RATE_LIMITED` and `Retry-After`.

No client `X-Forwarded-For` is trusted. Limit state is local to a process, lost on restart and unsuitable for enforcing a distributed budget. At most four password operations run concurrently per process; excess work receives a nonleaky 503 without an unbounded queue. Account budgets can temporarily deny legitimate access after malicious attempts; choose an appropriate shared limiter/proxy policy before deployment.

### Tokens and role freshness

Tokens are signed with JOSE HS256 only, with protected header `typ:JWT`. The only accepted algorithm is HS256; `none`, other HMAC algorithms and algorithm substitution are rejected. `JWT_SECRET` is environment-only, 32 random bytes encoded as 64 hex characters; startup validation rejects wrong format and obvious low-diversity values. Entropy cannot be proven from format validation, so generate the key cryptographically. No fallback key is embedded in code or fixtures.

Issuer and audience are validated against `JWT_ISSUER` (default `clu-store-api`) and `JWT_AUDIENCE` (default `clu-store-client`). Each token has UUID `sub`, UUID `jti`, `iat` and finite `exp`; default TTL is 900 seconds, configurable 60–3600. Verification requires issuer/audience/subject/issued-at/expiration, a valid UUID subject, integer times, positive lifetime no longer than configured TTL and no future issuance. Clock tolerance is zero; hosts need synchronized clocks. Tokens contain no role, email or password data.

`requireAuth(service)` accepts only the Authorization Bearer header (maximum 4096 characters), verifies the token, then fetches a safe user projection by subject from PostgreSQL. A deleted user is denied. `requireRole('ADMIN')` checks the freshly fetched role; an embedded token role claim is ignored. Role freshness is one database read at the start of every protected request; it is not a guarantee against a role change midway through that request. Future admin mutations must consider their transaction boundary.

This is a single-service demo access-token design: no refresh tokens, logout/revocation list, MFA, email verification, password recovery/change, key rotation overlap or multi-service key distribution. A stolen bearer token works until expiry unless its user is deleted or the signing key changes. Password changes made out of band do not revoke existing tokens. HS256 verification requires the signing secret, so any verifier can mint tokens. Use TLS before network exposure; the frontend should manage token storage and XSS risk deliberately. P06 must mount the reusable guard and derive ownership from `res.locals.user.id`.

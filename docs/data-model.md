# CLU Store API — data model

P02 implements this relational foundation in `prisma/schema.prisma` and the reviewed initial migration. Preserve observed numeric catalog IDs when source mapping is unambiguous. P03 now supplies a separate labeled frontend demo seed; mappings and missing response inputs are recorded in fixture-provenance.md.

| Entity | Key fields and relations | Invariants |
|---|---|---|
| `User` | UUID id, username, email, passwordHash, role, timestamps | USER/ADMIN; normalized unique username/email; never expose hash. |
| `Category` | Numeric id, title, slug, optional subtitle, videos/editorial features | Unique title/slug; editorial presentation separate from product configuration. |
| `Product` | Numeric id, nullable category FK, name/title, image, carousel, startingPrice Decimal, installments Decimal?, features, inStock | `startingPrice` is informational/lowest complete sellable SKU; no double-add. |
| `ProductModel` | Numeric id, product FK, name, specification, full base price Decimal, inStock | Product option ownership validated. |
| `ProductMemorySize` | Numeric id, product FK, name, incremental extraPrice Decimal, inStock | Product option ownership validated. |
| `ProductColor` | Internal id, product FK, name, inStock | Unique `(productId,name)`; exposed as color names. |
| `Offer` | id, optional product FK, type/title/detail/image, active dates, soldOut? | Presentation card may be unlinked; soldOut does not determine SKU stock. Historical campaigns inactive unless revalidated. |
| `NewArrival` | id, nullable product FK, displayOrder, title/detail/image/textColor/soldOut | Nullable link supports editorial cards. Stable display order. |
| `SupportInformation` | key, locale, reviewed HTML, updatedAt | Unique `(key,locale)`; content sanitized and controlled. |
| `Cart` | id, user UUID FK, status, timestamps | One reusable ACTIVE cart per user. |
| `CartItem` | id, cart/product/model/memory FKs, color, quantity, cached unitPrice Decimal | Unique complete SKU configuration within cart; cache is not checkout authority. |
| `Order` | id, user FK, status, total Decimal, CNY, idempotency key/fingerprint, timestamps | Per-user idempotency uniqueness; immutable committed total. |
| `OrderItem` | id, order FK, optional product reference, name/config snapshots, unitPrice/lineTotal Decimal, quantity | Preserve historical purchase description and amount even if catalog changes. |
| `OrderStatusHistory` | id, order FK, from/to status, operator FK, metadata?, createdAt | Initial null-to-pending and each admin transition recorded. |

## Relations and integrity

Category has many products. Product owns models, memory sizes, colors and may be referenced by cards. User has one active cart and many orders. Cart has configured items. Order has immutable item snapshots and ordered status history. Cascade may be used for ephemeral cart lines; historical order references should be restricted or nullable while snapshots remain. Add indexes for product category/name, option product IDs, `(userId,createdAt)` orders, order status, and `(orderId,createdAt)` history. Case-insensitive unique indexes may require reviewed PostgreSQL migration SQL.

## Money and SKU semantics

Use PostgreSQL `numeric(12,2)` through Prisma Decimal. Serialize amounts as fixed two-decimal strings and include `currency: "CNY"` on transaction DTOs/orders. Do not perform monetary business arithmetic with JavaScript floating point.

`unitPrice = ProductModel.price + ProductMemorySize.extraPrice` after verifying both options and selected color belong to the product and are available. Quantity is a bounded positive integer. The model price is the complete model base price; memory price is an increment. Never add `Product.startingPrice` to a chosen model price. Checkout re-reads and recalculates inside the transaction; stored cart price is only a display cache. Shipping, tax and payment are excluded from V1 total.

## Checkout consistency

P07 uses one PostgreSQL Read Committed transaction: lock the owner, check an optional per-user idempotency key/fingerprint before reading the cart, lock cart and current SKU rows, calculate Decimal line totals/subtotal, insert pending order/item snapshots/initial history/saved receipt, and consume the purchased cart lines. Any failure rolls all steps back. Direct SKU mode leaves the cart unchanged. Replay returns the saved creation receipt; conflicting reuse is `409`. The lock protocol, unique index and bounded conflict retries are exercised against real PostgreSQL; see [P07 verification](p07-verification.md).

## P02 concrete schema decisions

- `User.id` is a Prisma-generated UUID backed by PostgreSQL UUID. `Order.id`, `OrderItem.id`, `Cart.id`, `CartItem.id` and catalog/configuration IDs are PostgreSQL integers with sequences. Order IDs are opaque numeric identifiers, never authorization credentials.
- Explicit sample IDs can be inserted without changing their type. P03 must reconcile collisions and advance sequences after explicit-ID imports. No inferred sample records are inserted by P02.
- `Product.categoryId` is nullable because the reported product-detail sample has `category: null`; a category link cannot be fabricated. The FK is enforced whenever present.
- One reusable ACTIVE cart per user is enforced by unique `Cart.userId` and the ACTIVE-only status enum. Checkout clears its items; it does not create a second active cart.
- Composite foreign keys tie cart model, memory and color to their selected product. Full `(cartId,productId,modelId,memorySizeId,color)` uniqueness prevents duplicate lines while preserving different configurations.
- `Order.currency` and `Cart.currency` use a CNY-only enum. Every monetary column is `Decimal @db.Decimal(12,2)`. `serializeMoney` emits two-decimal strings; future DTOs must call it explicitly rather than assume Decimal's default JSON formatting preserves trailing zeros.
- `Order.metadata` and history metadata are optional JSONB. Idempotency key and SHA-256 hex request fingerprint must either both be null or both be present. Unique `(userId,idempotencyKey)` allows multiple null keys and the same key for different users. P07 accepts an optional key, replacing the earlier planned mandatory API header; keyless orders store both fields as null.
- Additional SQL enforces normalized case-insensitive username/email uniqueness, nonempty identities, positive catalog IDs/quantities, nonnegative prices, exact order line arithmetic, offer date order and valid history-edge shapes. P06/P07 enforce quantity ceilings in their locked services.
- Deleting carts cascades to cart lines; deleting a user cascades its cart but is restricted by any order/history. Category and option dependencies use RESTRICT. Product deletion sets editorial card links null; order item product references and order/history records use RESTRICT. All reference updates explicitly cascade.

The initial migration contains the SQL checks/functional indexes that Prisma cannot express directly. Do not discard them when regenerating schema changes. P07 implements snapshots/totals, live cart repricing and atomic checkout/history writes; immutability is an application rule, not a database trigger. ADMIN decisions and atomic conditional status transitions remain P08 responsibilities; SQL history-edge validation alone does not implement the order state machine.

## P03 demo data

The schema is unchanged. The reconciled seed preserves all seven complete response product IDs and their model/memory IDs. It corrects prior fallback IDs 1001 to 7 and 1002 to 8 only after checking the frozen prior data. Product 2 is normalized into demo Phones category 1. All 16 category summaries are present; the ten without complete sample options are unavailable, and no active configurations are fabricated for them. Supplemental frontend configurations remain labeled demo choices. Replaced configurations are retained inactive to preserve references. See [fixture-provenance.md](fixture-provenance.md).


## P05 identity enforcement

No schema changes are required. Public registration stores trimmed, lowercase ASCII usernames/emails and uses the existing normalized unique indexes; concurrent unique violations become one generic account conflict. Credential lookup is parameterized and uses the same `lower(btrim(...))` expressions. The API chooses USER regardless of client intent and rejects unknown role fields. Only the explicit admin CLI chooses ADMIN. Existing accounts are not rewritten or promoted. Argon2id hashes stay internal; role authorization reads the current User row for each protected request. [Full identity policy](api-contract.md#identities-and-passwords).


## P06 cart enforcement

No schema or migration change is needed. `Cart.userId` uniqueness and full-SKU `CartItem` uniqueness are used by transactional upserts. The service acquires the owner User row lock before all writes so concurrent first adds, merges, deletes and clears share one ordering point. Composite option foreign keys supplement explicit same-product/availability checks. Caps (99 per line, 50 lines, 500 total units) are application invariants under that lock; direct database writers must honor the protocol.

Cart currency is stored as CNY. `CartItem.unitPrice` stores the server-calculated full-model base plus memory increment on add/merge. GET computes current-price display amounts from a consistent catalog snapshot without updating this cache. Deleted/cleared lines do not delete the reusable cart. P07 acquires the same owner lock, revalidates all selected configurations and monetary limits, and performs order creation and cart consumption atomically. [Exact cart DTO contract](api-contract.md#p06-carts).

## P07 order persistence and replay

The existing initial migration is sufficient; no schema migration or dependency change is needed. `Order_userId_idempotencyKey_key` enforces the per-user nullable key uniqueness. Existing paired-null/fingerprint-format/key-length checks remain intact. `Cart_userId_key`, full-SKU cart uniqueness and composite option ownership foreign keys remain authoritative.

Each order stores CNY, the Decimal subtotal, pending status and numeric identity. OrderItem stores product ID, product/model/specification/memory/color descriptions, quantity, unit price and line total. These values are copied from share-locked live rows and never recomputed on replay. Unit, line and subtotal values are checked against `9999999999.99` before inserts. The initial history is `{fromStatus:null,toStatus:pending,operatorId:purchaserUUID}`. The checkout service has no update path for item snapshots or the committed subtotal.

Server-owned `Order.metadata` now contains `{checkoutVersion:1,mode:"cart"|"direct",placement:<creation DTO>}` for every P07 order. This persists the exact safe creation receipt, including the original status/timestamp/ordered items, without needing extra columns. It contains no credentials or client metadata. Replays validate its version/shape before returning it; malformed or pre-P07 keyed records with no supported receipt fail safely rather than invent a response. No existing order is backfilled or overwritten. P08 must preserve these reserved fields; future metadata changes need an explicit merge/version policy.

The SHA-256 fingerprint uses a fixed versioned route/mode tuple, plus canonical SKU IDs/color/quantity in direct mode. Cart mode fingerprints the intent, not mutable cart contents. A key is retained for the lifetime of its order; no key expiry/purge policy is implemented. Different users may reuse a key. Out-of-band SQL can modify snapshots/metadata and bypass owner locks, so database access and future writer protocols must preserve these application invariants. Order IDs/sequences may have gaps after rollback.

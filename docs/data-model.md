# CLU Store API — data model

This is a logical V1 model; it is not a Prisma schema or migration. Preserve observed numeric catalog IDs when source mapping is unambiguous. No fixture IDs are assigned in this phase.

| Entity | Key fields and relations | Invariants |
|---|---|---|
| `User` | UUID id, username, email, passwordHash, role, timestamps | USER/ADMIN; normalized unique username/email; never expose hash. |
| `Category` | Numeric id, title, slug, optional subtitle, videos/editorial features | Unique title/slug; editorial presentation separate from product configuration. |
| `Product` | Numeric id, category FK, name/title, image, carousel, startingPrice Decimal, installment Decimal?, features, inStock | `startingPrice` is informational/lowest complete sellable SKU; no double-add. |
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

Within one PostgreSQL transaction: claim/check per-user idempotency key and request fingerprint; read/snapshot the user's cart and current SKU data; calculate Decimal line totals and subtotal; insert pending order, item snapshots and initial status history; clear only that user's cart. Any failure rolls all steps back. A replay returns the existing order; conflicting key reuse is `409`. Concurrency needs an appropriate row lock or serializable transaction/retry strategy, verified against PostgreSQL.

import { z } from 'zod';
import type { Router, RequestHandler } from 'express';
import * as dto from './responses.js';
import { listRequest, detailRequest, emptyReadRequest } from '../modules/products/schemas.js';
import { categoryRequest } from '../modules/categories/schemas.js';
import { registerRequest, loginRequest } from '../modules/auth/schemas.js';
import { addItemRequest, cartReadRequest, clearCartRequest, removeItemRequest } from '../modules/cart/schemas.js';
import { placeRequest, idempotencyKeySchema } from '../modules/orders/schemas.js';
import { orderListRequest, orderDetailRequest, decisionRequest } from '../modules/orders/management-schemas.js';

export const mounts = { products: '/api/products', categories: '/api/categories', information: '/api/information', auth: '/api/auth',
  cart: '/api/shopping-cart', orders: '/api/orders', adminOrders: '/api/admin/orders', root: '' } as const;
export const legacyCartMount = '/api/ShoppingCart';
export type Access = 'public' | 'bearer' | 'admin';
export interface ApiOperation {
  group: keyof typeof mounts; method: 'get' | 'post' | 'delete'; route: string;
  summary: string; description: string; access: Access;
  request?: z.ZodObject; headers?: z.ZodObject; responses: Record<number, z.ZodType | null>;
  errors?: Partial<Record<number, string[]>>; bodyExample?: unknown; dataExample?: unknown;
  responseExamples?: Record<number, unknown>; parameters?: Record<string, { description: string; example?: unknown }>;
  mediaType?: string; bodyRequired?: boolean;
}
const ok = (schema: z.ZodType, meta?: z.ZodType) => dto.success(schema, meta ?? z.null());
const catalogSearch = 'Literal case-insensitive substring search across product name/title/category title or slug. Unknown category filters return an empty list. ID breaks sort ties. Unknown/repeated query keys are rejected.';
const pricing = 'Live full ProductModel.price + ProductMemorySize.extraPrice, using Decimal; startingPrice is never added. CNY amounts are fixed two-decimal strings. Legacy names/images/prices are bounded and discarded. Limits: 99 units/line, 50 configurations and 500 units/cart.';
const orderPaging = 'Owner/time/ID or global time/ID indexed cursor pagination. newest = createdAt DESC,id DESC; oldest reverses both. pageSize defaults to 20, max 100. Cursor is an opaque versioned position, max 256 characters, reused with the same sort; never an authorization credential. No page/offset/count/search parameters. Each response uses one Repeatable Read snapshot.';
const transition = 'ADMIN only, with transaction-time role recheck under an operator share lock. Only pending -> approved or pending -> rejected; terminal states cannot change. A conditional PostgreSQL UPDATE and initial-to-terminal history insertion commit atomically. Opposite concurrent decisions yield one 200 and one 409. Immutable snapshots and the P07 creation receipt are preserved. No payments or payment URI. Optional metadata is a trimmed plain {note} (raw <=1000, normalized 1–500, no controls); a deprecated string becomes a note and is never parsed as JSON.';
export const syntheticRegistration = { username: 'synthetic_demo_user', email: 'synthetic@example.test', password: 'Synthetic-example-ChangeMe-2026!', confirmPassword: 'Synthetic-example-ChangeMe-2026!' };
const sku = { productId: 2, modelId: 1, memorySizeId: 1, color: 'Silver', qty: 1 };

export const operations = {
  offers: { group: 'products', method: 'get', route: '/offers', summary: 'Read active scheduled offers', access: 'public', request: emptyReadRequest,
    description: 'Only active offers with startsAt <= now and endsAt > now; null bounds are unbounded. Historical 2025 campaigns remain inactive. Marketing soldOut is independent of SKU stock.', responses: { 200: ok(z.array(dto.offer)) }, dataExample: [] },
  arrivals: { group: 'products', method: 'get', route: '/newarrivals', summary: 'Read editorial new-arrival cards', access: 'public', request: emptyReadRequest,
    description: 'Ordered by displayOrder ASC,id ASC. Linked productId may be null for non-product editorial cards.', responses: { 200: ok(z.array(dto.arrival)) }, dataExample: [] },
  products: { group: 'products', method: 'get', route: '/', summary: 'Search and paginate products', access: 'public', request: listRequest,
    description: catalogSearch + ' page default 1/max 10000; pageSize default 20/max 100. newest sorts createdAt DESC; prices use Decimal startingPrice; name sorts use DB collation; ties use id ASC. Memory price is incremental.', responses: { 200: ok(z.array(dto.product), dto.productPageMeta) },
    parameters: { keyword: { description: 'Trimmed literal case-insensitive search, raw <=200/normalized <=100, no controls.', example: 'demo' }, category: { description: 'Case-insensitive title or slug, same length caps; blank invalid.', example: 'Phones' } },
    responseExamples: { 200: { success: true, data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } } },
  product: { group: 'products', method: 'get', route: '/:id', summary: 'Read product and SKU options', access: 'public', request: detailRequest,
    description: 'Original numeric catalog ID. image retains the observed legacy field name; models[].price is a complete base and memorySizes[].price an increment, both strings. colors is a name array. Unknown product is 404.', responses: { 200: ok(dto.product) }, errors: { 404: ['PRODUCT_NOT_FOUND'] } },
  categories: { group: 'categories', method: 'get', route: '/', summary: 'Read category navigation', access: 'public', request: emptyReadRequest,
    description: 'Category ID/title/slug/subTitle summaries in ID order.', responses: { 200: ok(z.array(dto.category)) }, dataExample: [] },
  category: { group: 'categories', method: 'get', route: '/:title', summary: 'Read category landing content', access: 'public', request: categoryRequest,
    description: 'Case-insensitive title or slug, URL-decoded exactly once by Express. At most 128 decoded characters, no slash/backslash/control. Unknown category is 404. Landing content contains videos, editorial features and product summaries.', responses: { 200: ok(dto.categoryLanding) }, errors: { 404: ['CATEGORY_NOT_FOUND'] }, parameters: { title: { description: 'URL-encode title once; slug is also accepted.', example: 'Phones' } } },
  support: { group: 'information', method: 'get', route: '/support', summary: 'Read sanitized support information', access: 'public', request: emptyReadRequest,
    description: 'data is explicitly {html,locale}. Reviewed original support HTML is sanitized on read with a tag allowlist and no attributes/links. Never arbitrary source HTML.', responses: { 200: ok(dto.support) }, errors: { 404: ['INFORMATION_NOT_FOUND'] }, dataExample: { html: '<section><h1>Demo support</h1><p>Original synthetic example.</p></section>', locale: 'zh-CN' } },
  register: { group: 'auth', method: 'post', route: '/register', summary: 'Register a USER account', access: 'public', request: registerRequest,
    description: 'Email is required. Exactly one matching confirmPassword or deprecated ConfirmPassword is required. Username/email are trimmed, lowercased and uniquely normalized. Password is 15–128 characters, long and uncommon. Client role rejected. Strict IP/account limits. Synthetic examples are not provisioned.', responses: { 201: ok(dto.safeUser, dto.deprecationMeta) }, errors: { 409: ['ACCOUNT_CONFLICT'] }, bodyExample: syntheticRegistration },
  login: { group: 'auth', method: 'post', route: '/login', summary: 'Log in by username or email', access: 'public', request: loginRequest,
    description: 'Exactly one identifier or deprecated username alias. Generic failure for unknown user/wrong password. Returns safe user plus HS256 bearer token metadata. Env-only key, issuer/audience validation and finite TTL (default 900s); role is re-fetched per protected request. Synthetic examples are not provisioned.', responses: { 200: ok(dto.login, dto.deprecationMeta) }, errors: { 401: ['UNAUTHORIZED'] }, bodyExample: { identifier: syntheticRegistration.username, password: syntheticRegistration.password } },
  cartDemo: { group: 'cart', method: 'get', route: '/fake-shopping-cart', summary: 'Read public synthetic cart demo', access: 'public', request: cartReadRequest,
    description: 'Deterministic original demo, no real user/catalog data, null IDs and available:false. Never purchasable.', responses: { 200: ok(dto.cartDemo) } },
  cart: { group: 'cart', method: 'get', route: '/', summary: 'Read own persisted cart', access: 'bearer', request: cartReadRequest,
    description: 'Owner comes from the authenticated UUID. Current-price display estimates include unavailable lines; an empty cart is not written to DB. ' + pricing, responses: { 200: ok(dto.cart) } },
  addCartItem: { group: 'cart', method: 'post', route: '/items', summary: 'Add or merge an owned full-SKU cart line', access: 'bearer', request: addItemRequest,
    description: pricing + ' Merge only the full product/model/memory/color key. New line 201, merge 200. All selected options must belong to the product and be available.', responses: { 200: ok(dto.cartItem, dto.deprecationMeta), 201: ok(dto.cartItem, dto.deprecationMeta) }, errors: { 404: ['PRODUCT_NOT_FOUND'], 422: ['INVALID_PRODUCT_CONFIGURATION', 'PRODUCT_UNAVAILABLE', 'CART_LIMIT_EXCEEDED'] }, bodyExample: sku },
  removeCartItem: { group: 'cart', method: 'delete', route: '/items/:id', summary: 'Delete own cart line', access: 'bearer', request: removeItemRequest,
    description: 'Foreign and missing cart line IDs have the same 404. Success has no response body.', responses: { 204: null }, errors: { 404: ['CART_ITEM_NOT_FOUND'] } },
  clearCart: { group: 'cart', method: 'delete', route: '/items', summary: 'Clear own cart', access: 'bearer', request: clearCartRequest,
    description: 'Idempotently deletes only owned lines; preserves the reusable Cart row. 204 has no response body.', responses: { 204: null } },
  place: { group: 'orders', method: 'post', route: '/place', summary: 'Atomically place an order', access: 'bearer', request: placeRequest, headers: z.object({ 'Idempotency-Key': idempotencyKeySchema.optional() }),
    description: 'JSON {} purchases the CURRENT USER persisted cart. Direct full-SKU body is optional compatibility mode and leaves the cart unchanged. ' + pricing + ' One Read Committed PostgreSQL transaction owner-locks, revalidates/reprices, creates pending order/items/history/receipt and consumes purchased cart lines atomically. Optional Idempotency-Key: 1–128 ASCII characters; duplicates rejected; per-user unique key and persisted SHA-256 fingerprint. Replay is checked BEFORE empty/stock checks and returns the exact prior creation receipt with 200 even after cart refill/status change. First create 201. Changed direct payload/mode with same key 409. Cart fingerprint denotes the purchase intent, not mutable contents; use a new key for a new purchase. Keyless direct requests lack replay guarantees. P2034 serialization/deadlock retries: max 3 attempts with 20/40ms waits; exhausted 503 CHECKOUT_BUSY. No inventory reservation, tax/shipping/payment or client totals.',
    responses: { 201: ok(dto.placedOrderSchema), 200: ok(dto.placedOrderSchema) }, errors: { 409: ['IDEMPOTENCY_CONFLICT'], 422: ['EMPTY_CART', 'INVALID_CART', 'INVALID_PRODUCT_CONFIGURATION', 'PRODUCT_UNAVAILABLE', 'ORDER_AMOUNT_EXCEEDED'], 503: ['SERVICE_NOT_READY', 'CHECKOUT_BUSY'] }, bodyExample: {}, parameters: { 'Idempotency-Key': { description: 'Optional case-sensitive purchase-intent key. Header name case-insensitive. Pattern: ^[A-Za-z0-9][A-Za-z0-9._:-]*$, length 1–128; repeated headers rejected.', example: 'synthetic-checkout-001' } } },
  ownOrders: { group: 'orders', method: 'get', route: '/', summary: 'List own orders', access: 'bearer', request: orderListRequest,
    description: 'Own orders only, even for ADMIN. ' + orderPaging, responses: { 200: ok(z.array(dto.currentOrder), dto.orderPageMeta) }, responseExamples: { 200: { success: true, data: [], meta: { pageSize: 20, sort: 'newest', hasMore: false, nextCursor: null } } } },
  order: { group: 'orders', method: 'get', route: '/:id', summary: 'Read owned order or ADMIN-visible order', access: 'bearer', request: orderDetailRequest,
    description: 'Owner or ADMIN. Foreign USER and missing ID return identical ORDER_NOT_FOUND. Current state, immutable purchase snapshots and ordered status history; no account relation or internal receipt metadata. P07 placement replay remains the original pending receipt.', responses: { 200: ok(dto.currentOrder) }, errors: { 404: ['ORDER_NOT_FOUND'] } },
  approve: { group: 'orders', method: 'post', route: '/:id/approve', summary: 'Approve a pending order (ADMIN)', access: 'admin', request: decisionRequest,
    description: transition, responses: { 200: ok(dto.currentOrder, dto.deprecationMeta) }, errors: { 404: ['ORDER_NOT_FOUND'], 409: ['ORDER_INVALID_TRANSITION'] }, bodyExample: { metadata: { note: 'Synthetic operator review example' } } },
  reject: { group: 'orders', method: 'post', route: '/:id/reject', summary: 'Reject a pending order (ADMIN)', access: 'admin', request: decisionRequest,
    description: transition, responses: { 200: ok(dto.currentOrder, dto.deprecationMeta) }, errors: { 404: ['ORDER_NOT_FOUND'], 409: ['ORDER_INVALID_TRANSITION'] }, bodyExample: { metadata: { note: 'Synthetic operator review example' } } },
  adminOrders: { group: 'adminOrders', method: 'get', route: '/', summary: 'List all orders (ADMIN)', access: 'admin', request: orderListRequest,
    description: 'ADMIN only, across owners. ' + orderPaging, responses: { 200: ok(z.array(dto.currentOrder), dto.orderPageMeta) }, responseExamples: { 200: { success: true, data: [], meta: { pageSize: 20, sort: 'newest', hasMore: false, nextCursor: null } } } },
  health: { group: 'root', method: 'get', route: '/health', summary: 'Process liveness', access: 'public', description: 'Process-only check, independent of DB/auth readiness.', responses: { 200: ok(z.object({ status: z.literal('ok') }).strict()) }, dataExample: { status: 'ok' } },
  ready: { group: 'root', method: 'get', route: '/ready', summary: 'Bounded database readiness', access: 'public', description: 'Real bounded SELECT 1. Missing/unavailable DB returns 503, never false success. Connectivity only, not migration/auth/catalog readiness.', responses: { 200: ok(z.object({ status: z.literal('ready'), database: z.literal('up') }).strict()) }, errors: { 503: ['SERVICE_NOT_READY'] }, dataExample: { status: 'ready', database: 'up' } },
  docs: { group: 'root', method: 'get', route: '/docs', summary: 'Local Swagger UI', access: 'public', description: 'HTML documentation using local assets. Spec loading and UI initialization do not call business routes. External validation and persisted authorization are disabled.', mediaType: 'text/html', responses: { 200: z.string() } },
  spec: { group: 'root', method: 'get', route: '/docs/openapi.json', summary: 'Raw OpenAPI 3.1 specification', access: 'public', description: 'Raw OpenAPI document, intentionally outside the application response envelope.', responses: { 200: z.object({ openapi: z.literal('3.1.0') }).passthrough() } },
  media: { group: 'root', method: 'get', route: '/media/demo-placeholder.svg', summary: 'Reviewed local placeholder image', access: 'public', description: 'Original SVG file only. Standard HEAD/conditional responses may be bodyless; static assets are outside the API JSON envelope.', mediaType: 'image/svg+xml', responses: { 200: z.string(), 304: null } },
} satisfies Record<string, ApiOperation>;
export type OperationId = keyof typeof operations;
export function operationPaths(operation: ApiOperation) {
  const suffix = operation.route === '/' ? '' : operation.route;
  return operation.group === 'cart' ? [mounts.cart + suffix, legacyCartMount + suffix] : [mounts[operation.group] + suffix];
}
// Routers bind method and local path from the same catalog used by both generators.
export function contractRoute(router: Router, operationId: OperationId, ...handlers: RequestHandler[]) {
  const operation = operations[operationId];
  router[operation.method](operation.route, ...handlers);
}

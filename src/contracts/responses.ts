import { z } from 'zod';
import { localMedia } from '../modules/products/schemas.js';
import { decisionMetadata } from '../modules/orders/management-schemas.js';

export const id = z.number().int().positive().max(2147483647);
export const money = z.string().regex(/^\d+\.\d{2}$/).meta({ description: 'CNY decimal amount serialized as a fixed two-decimal JSON STRING. Never a JSON number.', examples: ['10.10'] });
const date = z.iso.datetime();
const currency = z.literal('CNY');
export const deprecationMeta = z.object({ deprecatedFields: z.array(z.string()) }).strict().nullable();
export const productPageMeta = z.object({ page: z.number().int().positive(), pageSize: z.number().int().positive(), total: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative() }).strict();
export const orderPageMeta = z.object({ pageSize: z.number().int().positive(), sort: z.enum(['newest', 'oldest']), hasMore: z.boolean(), nextCursor: z.string().nullable() }).strict();
export function success<T extends z.ZodType>(data: T, meta: z.ZodType = z.null()) {
  return z.object({ success: z.literal(true), data, meta }).strict();
}
export const errorEnvelope = z.object({ success: z.literal(false), error: z.object({
  code: z.string(), message: z.string(), details: z.union([z.null(), z.array(z.object({ path: z.array(z.union([z.string(), z.number()])), code: z.string() }).strict()),
    z.object({ database: z.enum(['not_configured', 'unavailable']) }).strict()]),
}).strict() }).strict();

export const productSummary = z.object({ id, name: z.string(), title: z.string(), image: localMedia, startingPrice: money,
  installments: money.nullable(), features: z.array(z.string()), inStock: z.boolean() }).strict();
export const product = productSummary.extend({ category: z.string().nullable(), carouselImages: z.array(localMedia),
  models: z.array(z.object({ id, name: z.string(), specification: z.string(), price: money.meta({ description: 'Complete model base price; do not add startingPrice.' }), inStock: z.boolean() }).strict()),
  memorySizes: z.array(z.object({ id, name: z.string(), price: money.meta({ description: 'Incremental memory upgrade price, added to the full model base.' }), inStock: z.boolean() }).strict()),
  colors: z.array(z.string()) }).strict();
export const offer = z.object({ id, productId: id.nullable(), type: z.string(), title: z.string(), detail: z.string(), image: localMedia, soldOut: z.boolean() }).strict();
export const arrival = offer.omit({ type: true }).extend({ textColor: z.string() }).strict();
export const category = z.object({ id, title: z.string(), slug: z.string(), subTitle: z.string().nullable() }).strict();
export const categoryLanding = category.extend({ videos: z.object({ id: z.number().int(), regularSrc: localMedia.nullable(), smallSrc: localMedia.nullable() }).strict().nullable(),
  features: z.array(z.object({ id: z.number().int(), title: z.string(), detail: z.string(), image: localMedia, textColor: z.enum(['black', 'white']) }).strict()),
  products: z.array(productSummary) }).strict();
export const support = z.object({ html: z.string().meta({ description: 'Reviewed support HTML sanitized on read with a tag allowlist and no attributes/links. Render defensively.' }), locale: z.string() }).strict();
export const safeUser = z.object({ id: z.uuid(), username: z.string(), email: z.string(), role: z.enum(['USER', 'ADMIN']), createdAt: date }).strict();
export const login = z.object({ user: safeUser, token: z.string().meta({ description: 'Issued HS256 JWT. Examples use a placeholder only.' }), tokenType: z.literal('Bearer'), expiresIn: z.number().int().positive(), expiresAt: date }).strict();

const itemFields = { id, product: z.object({ id, name: z.string(), image: localMedia }).strict(),
  model: z.object({ id, name: z.string(), specification: z.string(), price: money }).strict(),
  memorySize: z.object({ id, name: z.string(), price: money }).strict(), color: z.string(), qty: z.number().int().positive(),
  currency, unitPrice: money, lineTotal: money, available: z.boolean() };
export const cartItem = z.object(itemFields).strict();
export const cart = z.object({ id: id.nullable(), isDemo: z.literal(false), currency, items: z.array(cartItem), itemCount: z.number().int().nonnegative(), totalQty: z.number().int().nonnegative(), totalAmount: money }).strict();
const demoItem = cartItem.extend({ id: z.null(), product: itemFields.product.extend({ id: z.null() }), model: itemFields.model.extend({ id: z.null() }), memorySize: itemFields.memorySize.extend({ id: z.null() }), available: z.literal(false) });
export const cartDemo = z.object({ id: z.null(), isDemo: z.literal(true), currency, items: z.array(demoItem), itemCount: z.number().int().nonnegative(), totalQty: z.number().int().nonnegative(), totalAmount: money }).strict();
export const orderItem = z.object({ id, productId: id.nullable(), productName: z.string(), modelName: z.string(), modelSpecification: z.string(), memoryName: z.string(), color: z.string(), qty: z.number().int().positive(), unitPrice: money, lineTotal: money }).strict();
export const placedOrderSchema = z.object({ id, status: z.literal('pending'), currency, totalAmount: money, createdAt: date,
  items: z.array(orderItem.extend({ productId: id })).min(1).max(50) }).strict();
export const currentOrder = z.object({ id, userId: z.uuid(), status: z.enum(['pending', 'approved', 'rejected']), currency, totalAmount: money, createdAt: date, updatedAt: date,
  items: z.array(orderItem), statusHistory: z.array(z.object({ id, fromStatus: z.enum(['pending', 'approved', 'rejected']).nullable(), toStatus: z.enum(['pending', 'approved', 'rejected']), operatorId: z.uuid(), createdAt: date, metadata: decisionMetadata.nullable() }).strict()) }).strict();
export type PlacedOrder = z.output<typeof placedOrderSchema>;

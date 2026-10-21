import { createHash } from 'node:crypto';
import { z } from 'zod';
import { addItemRequest } from '../cart/schemas.js';

export const idempotencyKeySchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const checkoutBody = z.union([
  z.object({}).strict().transform(() => ({ mode: 'cart' as const })),
  addItemRequest.shape.body.transform((value) => ({ mode: 'direct' as const, sku: {
    productId: value.productId, modelId: value.modelId, memorySizeId: value.memorySizeId, color: value.color, qty: value.qty,
  } })),
]);
export const placeRequest = z.object({ query: z.object({}).strict(), body: checkoutBody });
export type Checkout = z.output<typeof checkoutBody>;
export type CheckoutSku = Extract<Checkout, { mode: 'direct' }>['sku'];
export function fingerprint(input: Checkout) {
  // Fixed property order, version and route domain. Cart contents are deliberately
  // excluded: retries must still match after consumption or subsequent cart edits.
  const canonical = input.mode === 'cart' ? ['orders/place', 1, 'cart']
    : ['orders/place', 1, 'direct', input.sku.productId, input.sku.modelId, input.sku.memorySizeId, input.sku.color, input.sku.qty];
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

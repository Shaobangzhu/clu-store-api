import { z } from 'zod';

export const MAX_ITEM_QUANTITY = 99;
export const MAX_CART_LINES = 50;
export const MAX_CART_QUANTITY = 500;
const id = z.number().int().positive().max(2147483647);
const legacyText = z.string().max(2048);
const legacyPrice = z.union([z.string().max(100), z.number().finite()]);
const legacyFields = ['name', 'imageSrc', 'model', 'modelPrice', 'memorySize', 'memorySizePrice'] as const;
export const addItemRequest = z.object({ query: z.object({}).strict(), body: z.object({
  productId: id, modelId: id, memorySizeId: id,
  color: z.string().min(1).max(100).regex(/^[^\p{Cc}]+$/u), qty: id,
  name: legacyText.optional(), imageSrc: legacyText.optional(), model: legacyText.optional(),
  modelPrice: legacyPrice.optional(), memorySize: legacyText.optional(), memorySizePrice: legacyPrice.optional(),
}).strict().transform((value) => ({
  productId: value.productId, modelId: value.modelId, memorySizeId: value.memorySizeId,
  color: value.color, qty: value.qty,
  deprecatedFields: legacyFields.filter((field) => value[field] !== undefined),
})) });
export type AddItem = z.output<typeof addItemRequest>['body'];
export const cartReadRequest = z.object({ query: z.object({}).strict() });
export const clearCartRequest = z.object({ query: z.object({}).strict(), body: z.object({}).strict().optional() });
export const removeItemRequest = clearCartRequest.extend({ params: z.object({
  id: z.string().max(10).regex(/^[1-9]\d*$/).transform(Number).pipe(id),
}) });

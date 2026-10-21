import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import type { CartRepository } from './repository.js';
import { MAX_ITEM_QUANTITY, MAX_CART_LINES, MAX_CART_QUANTITY, type AddItem } from './schemas.js';
import { serializeCart, serializeCartItem } from './serializer.js';

export function createCartService(repository: CartRepository) {
  return {
    async read(userId: string) { return serializeCart(await repository.read(userId)); },
    add: (userId: string, input: AddItem) => repository.mutate(userId, async (store) => {
      const cart = await store.getCart();
      const items = cart?.items ?? [];
      const existing = items.find((item) => item.productId === input.productId && item.modelId === input.modelId
        && item.memorySizeId === input.memorySizeId && item.color === input.color);
      const quantity = (existing?.quantity ?? 0) + input.qty;
      if (quantity > MAX_ITEM_QUANTITY || (!existing && items.length >= MAX_CART_LINES)
        || items.reduce((sum, item) => sum + item.quantity, 0) + input.qty > MAX_CART_QUANTITY) {
        throw new AppError(422, 'CART_LIMIT_EXCEEDED', 'Cart quantity or item limit exceeded');
      }
      if (!await store.productExists(input.productId)) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
      const sku = await store.sku(input);
      if (!sku) throw new AppError(422, 'INVALID_PRODUCT_CONFIGURATION', 'Invalid product configuration');
      if (!sku.available) throw new AppError(422, 'PRODUCT_UNAVAILABLE', 'Product configuration is unavailable');
      const unitPrice = new Prisma.Decimal(sku.modelPrice).plus(sku.extraPrice);
      if (unitPrice.greaterThan('9999999999.99')) {
        throw new AppError(422, 'INVALID_PRODUCT_CONFIGURATION', 'Product configuration price is outside the supported range');
      }
      const target = cart ?? await store.ensureCart();
      const item = await store.saveItem(target.id, input, quantity, unitPrice);
      return { created: !existing, item: serializeCartItem(item) };
    }),
    remove: (userId: string, id: number) => repository.mutate(userId, async (store) => {
      const result = await store.removeItem(id);
      if (!result.count) throw new AppError(404, 'CART_ITEM_NOT_FOUND', 'Cart item not found');
    }),
    clear: (userId: string) => repository.mutate(userId, async (store) => { await store.clear(); }),
  };
}

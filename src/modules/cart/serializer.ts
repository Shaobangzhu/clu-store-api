import { Prisma } from '../../generated/prisma/client.js';
import { serializeMoney } from '../../lib/money.js';
import { localMedia } from '../products/schemas.js';
import type { CartItemRecord, CartRecord } from './repository.js';

export function serializeCartItem(item: CartItemRecord) {
  // Reads display current catalog prices; the stored unitPrice is only an add-time cache.
  const unitPrice = item.model.price.plus(item.memorySize.extraPrice);
  return {
    id: item.id,
    product: { id: item.productId, name: item.product.name, image: localMedia.parse(item.product.imageSrc) },
    model: { id: item.modelId, name: item.model.name, specification: item.model.specification, price: serializeMoney(item.model.price) },
    memorySize: { id: item.memorySizeId, name: item.memorySize.name, price: serializeMoney(item.memorySize.extraPrice) },
    color: item.color, qty: item.quantity, currency: 'CNY' as const,
    unitPrice: serializeMoney(unitPrice), lineTotal: serializeMoney(unitPrice.times(item.quantity)),
    available: item.product.inStock && item.model.inStock && item.memorySize.inStock && item.productColor.inStock,
  };
}
export function serializeCart(cart: CartRecord | null) {
  const items = cart?.items.map(serializeCartItem) ?? [];
  const totalAmount = items.reduce((sum, item) => sum.plus(item.lineTotal), new Prisma.Decimal(0));
  return { id: cart?.id ?? null, isDemo: false, currency: cart?.currency ?? 'CNY', items,
    itemCount: items.length, totalQty: items.reduce((sum, item) => sum + item.qty, 0), totalAmount: serializeMoney(totalAmount) };
}

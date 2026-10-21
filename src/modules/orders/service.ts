import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { MAX_CART_LINES, MAX_CART_QUANTITY, MAX_ITEM_QUANTITY } from '../cart/schemas.js';
import { fingerprint, type Checkout } from './schemas.js';
import type { OrdersRepository, PurchasedLine } from './repository.js';
import { replayMetadataSchema, serializePlacedOrder } from './serializer.js';

const maximumMoney = new Prisma.Decimal('9999999999.99');
export function createOrdersService(repository: OrdersRepository) {
  return {
    place: (userId: string, input: Checkout, key?: string) => repository.transaction(userId, async (store) => {
      const requestFingerprint = fingerprint(input);
      if (key) {
        const existing = await store.findReplay(key);
        if (existing) {
          if (existing.requestFingerprint !== requestFingerprint) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was used for a different checkout request');
          const saved = replayMetadataSchema.parse(existing.metadata);
          if (saved.mode !== input.mode || saved.placement.id !== existing.id) throw new Error('Invalid saved checkout response');
          return { created: false, order: saved.placement };
        }
      }
      const lines: PurchasedLine[] = input.mode === 'cart' ? await store.cartLines() : [input.sku];
      if (!lines.length) throw new AppError(422, 'EMPTY_CART', 'Cart is empty');
      if (lines.length > MAX_CART_LINES || lines.some((line) => !Number.isInteger(line.qty) || line.qty < 1 || line.qty > MAX_ITEM_QUANTITY)
        || lines.reduce((sum, line) => sum + line.qty, 0) > MAX_CART_QUANTITY) {
        throw new AppError(422, 'INVALID_CART', 'Checkout quantity or item limit exceeded');
      }
      const skus = await store.liveSkus(lines);
      if (skus.length !== lines.length) throw new AppError(422, 'INVALID_PRODUCT_CONFIGURATION', 'Invalid product configuration');
      if (skus.some((sku) => !sku.available)) throw new AppError(422, 'PRODUCT_UNAVAILABLE', 'Product configuration is unavailable');
      // Snapshot in original cart-ID order (direct mode has one line).
      skus.sort((left, right) => left.ordinal - right.ordinal);
      const snapshots = skus.map((sku) => {
        const quantity = lines[sku.ordinal]!.qty;
        const unitPrice = new Prisma.Decimal(sku.modelPrice).plus(sku.extraPrice);
        const lineTotal = unitPrice.times(quantity);
        if (unitPrice.greaterThan(maximumMoney) || lineTotal.greaterThan(maximumMoney)) {
          throw new AppError(422, 'ORDER_AMOUNT_EXCEEDED', 'Checkout amount exceeds the supported limit');
        }
        return { productId: sku.productId, productName: sku.productName, modelName: sku.modelName,
          modelSpecification: sku.modelSpecification, memoryName: sku.memoryName, color: sku.color,
          quantity, unitPrice, lineTotal };
      });
      const total = snapshots.reduce((sum, item) => sum.plus(item.lineTotal), new Prisma.Decimal(0));
      if (total.greaterThan(maximumMoney)) throw new AppError(422, 'ORDER_AMOUNT_EXCEEDED', 'Checkout amount exceeds the supported limit');
      const order = await store.createOrder(total, key, requestFingerprint);
      const items = [];
      for (const item of snapshots) items.push(await store.createItem({ ...item, orderId: order.id }));
      await store.initialHistory(order.id);
      const response = serializePlacedOrder(order, items);
      await store.saveResponse(order.id, input.mode, response);
      if (input.mode === 'cart') {
        const ids = lines.map((line) => line.cartItemId!);
        const deleted = await store.deletePurchased(ids);
        if (deleted.count !== ids.length) throw new Error('Checkout cart changed unexpectedly');
      }
      return { created: true, order: response };
    }),
  };
}

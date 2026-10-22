import { z } from 'zod';
import type { Order, OrderItem } from '../../generated/prisma/client.js';
import { serializeMoney } from '../../lib/money.js';
import type { OrderRecord } from './management-repository.js';
import { decisionMetadata } from './management-schemas.js';
import { placedOrderSchema, type PlacedOrder, type currentOrder, type orderItem } from '../../contracts/responses.js';
export { placedOrderSchema, type PlacedOrder } from '../../contracts/responses.js';

export const replayMetadataSchema = z.object({ checkoutVersion: z.literal(1), mode: z.enum(['cart', 'direct']),
  placement: placedOrderSchema,
}).strict();
function serializeOrderItem(item: OrderItem): z.output<typeof orderItem> {
  return { id: item.id, productId: item.productId, productName: item.productName,
    modelName: item.modelName, modelSpecification: item.modelSpecification, memoryName: item.memoryName,
    color: item.color, qty: item.quantity, unitPrice: serializeMoney(item.unitPrice), lineTotal: serializeMoney(item.lineTotal) };
}
export function serializePlacedOrder(order: Order, items: OrderItem[]): PlacedOrder {
  return placedOrderSchema.parse({ id: order.id, status: order.status, currency: order.currency,
    totalAmount: serializeMoney(order.totalAmount), createdAt: order.createdAt.toISOString(),
    items: items.map(serializeOrderItem),
  });
}
export function serializeCurrentOrder(order: OrderRecord): z.output<typeof currentOrder> {
  return { id: order.id, userId: order.userId, status: order.status, currency: order.currency,
    totalAmount: serializeMoney(order.totalAmount), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString(),
    items: order.items.map(serializeOrderItem),
    statusHistory: order.history.map((entry) => {
      const metadata = decisionMetadata.safeParse(entry.metadata);
      return { id: entry.id, fromStatus: entry.fromStatus, toStatus: entry.toStatus, operatorId: entry.operatorId,
        createdAt: entry.createdAt.toISOString(), metadata: metadata.success ? metadata.data : null };
    }),
  };
}

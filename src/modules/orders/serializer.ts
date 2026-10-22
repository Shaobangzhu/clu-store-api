import { z } from 'zod';
import type { Order, OrderItem } from '../../generated/prisma/client.js';
import { serializeMoney } from '../../lib/money.js';
import type { OrderRecord } from './management-repository.js';
import { decisionMetadata } from './management-schemas.js';

const money = z.string().regex(/^\d+\.\d{2}$/);
export const placedOrderSchema = z.object({
  id: z.number().int().positive(), status: z.literal('pending'), currency: z.literal('CNY'),
  totalAmount: money, createdAt: z.iso.datetime(),
  items: z.array(z.object({ id: z.number().int().positive(), productId: z.number().int().positive(),
    productName: z.string(), modelName: z.string(), modelSpecification: z.string(), memoryName: z.string(),
    color: z.string(), qty: z.number().int().positive(), unitPrice: money, lineTotal: money,
  }).strict()).min(1).max(50),
}).strict();
export const replayMetadataSchema = z.object({ checkoutVersion: z.literal(1), mode: z.enum(['cart', 'direct']),
  placement: placedOrderSchema,
}).strict();
export type PlacedOrder = z.output<typeof placedOrderSchema>;
function serializeOrderItem(item: OrderItem) {
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
export function serializeCurrentOrder(order: OrderRecord) {
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

import { z } from 'zod';
import type { Order, OrderItem } from '../../generated/prisma/client.js';
import { serializeMoney } from '../../lib/money.js';

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
export function serializePlacedOrder(order: Order, items: OrderItem[]): PlacedOrder {
  return placedOrderSchema.parse({ id: order.id, status: order.status, currency: order.currency,
    totalAmount: serializeMoney(order.totalAmount), createdAt: order.createdAt.toISOString(),
    items: items.map((item) => ({ id: item.id, productId: item.productId, productName: item.productName,
      modelName: item.modelName, modelSpecification: item.modelSpecification, memoryName: item.memoryName,
      color: item.color, qty: item.quantity, unitPrice: serializeMoney(item.unitPrice), lineTotal: serializeMoney(item.lineTotal) })),
  });
}

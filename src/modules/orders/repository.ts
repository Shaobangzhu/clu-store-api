import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { lockCartOwner } from '../cart/locking.js';
import type { CheckoutSku } from './schemas.js';
import type { PlacedOrder } from './serializer.js';
import { retryCheckout } from './retry.js';

export type PurchasedLine = CheckoutSku & { cartItemId?: number };
export type LiveSku = { ordinal: number; productId: number; productName: string; modelName: string;
  modelSpecification: string; memoryName: string; color: string; modelPrice: string; extraPrice: string; available: boolean };
function transactionStore(tx: Prisma.TransactionClient, userId: string) {
  return {
    findReplay: (key: string) => tx.order.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: key } } }),
    async cartLines(): Promise<PurchasedLine[]> {
      const cart = await tx.cart.findUnique({ where: { userId }, select: { id: true } });
      if (!cart) return [];
      return tx.$queryRaw<PurchasedLine[]>`SELECT id AS "cartItemId", "productId", "modelId", "memorySizeId", color, quantity AS qty
        FROM "CartItem" WHERE "cartId" = ${cart.id} ORDER BY id FOR UPDATE`;
    },
    liveSkus: (lines: PurchasedLine[]) => tx.$queryRaw<LiveSku[]>(Prisma.sql`
      SELECT chosen.ordinal, p.id AS "productId", p.name AS "productName", m.name AS "modelName",
        m.specification AS "modelSpecification", mem.name AS "memoryName", c.name AS color,
        m.price::text AS "modelPrice", mem."extraPrice"::text AS "extraPrice",
        (p."inStock" AND m."inStock" AND mem."inStock" AND c."inStock") AS available
      FROM (VALUES ${Prisma.join(lines.map((line, index) => Prisma.sql`(${index}::integer, ${line.productId}::integer,
        ${line.modelId}::integer, ${line.memorySizeId}::integer, ${line.color}::text)`))})
        AS chosen(ordinal, product_id, model_id, memory_id, color)
      JOIN "Product" p ON p.id = chosen.product_id
      JOIN "ProductModel" m ON m.id = chosen.model_id AND m."productId" = p.id
      JOIN "ProductMemorySize" mem ON mem.id = chosen.memory_id AND mem."productId" = p.id
      JOIN "ProductColor" c ON c.name = chosen.color AND c."productId" = p.id
      ORDER BY p.id, m.id, mem.id, c.id, chosen.ordinal
      FOR SHARE OF p, m, mem, c`),
    createOrder: (totalAmount: Prisma.Decimal, key: string | undefined, requestFingerprint: string) => tx.order.create({ data: {
      userId, status: 'pending', currency: 'CNY', totalAmount,
      idempotencyKey: key ?? null, requestFingerprint: key ? requestFingerprint : null,
    } }),
    createItem: (data: Prisma.OrderItemUncheckedCreateInput) => tx.orderItem.create({ data }),
    initialHistory: (orderId: number) => tx.orderStatusHistory.create({ data: {
      orderId, fromStatus: null, toStatus: 'pending', operatorId: userId,
    } }),
    saveResponse: (orderId: number, mode: 'cart' | 'direct', placement: PlacedOrder) => tx.order.update({
      where: { id: orderId, userId }, data: { metadata: { checkoutVersion: 1, mode, placement } },
    }),
    deletePurchased: (ids: number[]) => tx.cartItem.deleteMany({ where: { id: { in: ids }, cart: { userId } } }),
  };
}
export type CheckoutStore = ReturnType<typeof transactionStore>;
export function createOrdersRepository(database: PrismaClient | undefined) {
  return {
    transaction<T>(userId: string, operation: (store: CheckoutStore) => Promise<T>): Promise<T> {
      if (!database) throw new AppError(503, 'SERVICE_NOT_READY', 'Database is not configured');
      return retryCheckout(() => database.$transaction(async (tx) => {
        await lockCartOwner(tx, userId);
        return operation(transactionStore(tx, userId));
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 10000 }));
    },
  };
}
export type OrdersRepository = ReturnType<typeof createOrdersRepository>;

import { Prisma, type PrismaClient, type Order, type Role } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { unauthorized } from '../auth/token.js';
import type { Decision, DecisionMetadata, OrderListQuery } from './management-schemas.js';

const orderSelect = { id: true, userId: true, status: true, currency: true, totalAmount: true, createdAt: true, updatedAt: true } as const;
type OrderHead = Pick<Order, keyof typeof orderSelect>;
async function withSnapshots(tx: Prisma.TransactionClient, orders: OrderHead[]) {
  if (!orders.length) return [];
  const ids = orders.map((order) => order.id);
  // Sequential batch queries on one connection; no catalog or User relation loads.
  const items = await tx.orderItem.findMany({ where: { orderId: { in: ids } }, orderBy: { id: 'asc' } });
  const history = await tx.orderStatusHistory.findMany({ where: { orderId: { in: ids } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  return orders.map((order) => ({ ...order, items: items.filter((item) => item.orderId === order.id),
    history: history.filter((entry) => entry.orderId === order.id) }));
}
export type OrderRecord = Awaited<ReturnType<typeof withSnapshots>>[number];
const missing = () => new AppError(404, 'ORDER_NOT_FOUND', 'Order not found');
export function createOrderManagementRepository(database: PrismaClient | undefined) {
  function client() {
    if (!database) throw new AppError(503, 'SERVICE_NOT_READY', 'Database is not configured');
    return database;
  }
  return {
    detail: (id: number, ownerId?: string) => client().$transaction(async (tx) => {
      const row = await tx.order.findFirst({ where: { id, ...(ownerId ? { userId: ownerId } : {}) }, select: orderSelect });
      if (!row) throw missing();
      return (await withSnapshots(tx, [row]))[0]!;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5000, timeout: 10000 }),
    list: (query: OrderListQuery, ownerId?: string) => client().$transaction(async (tx) => {
      const direction = query.sort === 'newest' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
      const comparison = query.sort === 'newest' ? Prisma.sql`<` : Prisma.sql`>`;
      const filters = [Prisma.sql`TRUE`];
      if (ownerId) filters.push(Prisma.sql`"userId" = ${ownerId}::uuid`);
      if (query.cursor) filters.push(Prisma.sql`("createdAt", id) ${comparison} (${new Date(query.cursor.createdAt)}::timestamptz, ${query.cursor.id}::integer)`);
      // Tuple keyset predicate matches the owner/time/ID and global time/ID indexes.
      const rows = await tx.$queryRaw<OrderHead[]>(Prisma.sql`SELECT id, "userId", status, currency, "totalAmount", "createdAt", "updatedAt"
        FROM "Order" WHERE ${Prisma.join(filters, ' AND ')} ORDER BY "createdAt" ${direction}, id ${direction} LIMIT ${query.pageSize + 1}`);
      return { orders: await withSnapshots(tx, rows.slice(0, query.pageSize)), hasMore: rows.length > query.pageSize };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5000, timeout: 10000 }),
    decide: (id: number, operatorId: string, target: Decision, metadata?: DecisionMetadata) => client().$transaction(async (tx) => {
      // Protect against demotion/deletion between the HTTP role guard and commit.
      // SHARE allows concurrent decisions by the same ADMIN; the order predicate arbitrates.
      const operators = await tx.$queryRaw<{ role: Role }[]>`SELECT role FROM "User" WHERE id = ${operatorId}::uuid FOR SHARE`;
      if (!operators[0]) throw unauthorized();
      if (operators[0].role !== 'ADMIN') throw new AppError(403, 'FORBIDDEN', 'Access denied');
      const changed = await tx.$queryRaw<{ updatedAt: Date }[]>`UPDATE "Order"
        SET status = ${target}::"OrderStatus", "updatedAt" = clock_timestamp()
        WHERE id = ${id} AND status = 'pending' RETURNING "updatedAt"`;
      if (!changed[0]) {
        if (!await tx.order.findUnique({ where: { id }, select: { id: true } })) throw missing();
        throw new AppError(409, 'ORDER_INVALID_TRANSITION', 'Order is no longer pending');
      }
      await tx.orderStatusHistory.create({ data: { orderId: id, operatorId, fromStatus: 'pending', toStatus: target,
        createdAt: changed[0].updatedAt, ...(metadata ? { metadata } : {}) } });
      const row = await tx.order.findUniqueOrThrow({ where: { id }, select: orderSelect });
      return (await withSnapshots(tx, [row]))[0]!;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 10000 }),
  };
}
export type OrderManagementRepository = ReturnType<typeof createOrderManagementRepository>;

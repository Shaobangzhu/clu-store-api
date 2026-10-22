import type { SafeUser } from '../auth/repository.js';
import type { OrderManagementRepository } from './management-repository.js';
import { encodeOrderCursor, type Decision, type DecisionMetadata, type OrderListQuery } from './management-schemas.js';
import { serializeCurrentOrder } from './serializer.js';

export function createOrderManagementService(repository: OrderManagementRepository) {
  return {
    async detail(id: number, caller: SafeUser) {
      return serializeCurrentOrder(await repository.detail(id, caller.role === 'ADMIN' ? undefined : caller.id));
    },
    async list(query: OrderListQuery, ownerId?: string) {
      const { orders, hasMore } = await repository.list(query, ownerId);
      return { data: orders.map(serializeCurrentOrder), meta: { pageSize: query.pageSize, sort: query.sort, hasMore,
        nextCursor: hasMore ? encodeOrderCursor(orders.at(-1)!, query.sort) : null } };
    },
    async decide(id: number, operatorId: string, target: Decision, metadata?: DecisionMetadata) {
      return serializeCurrentOrder(await repository.decide(id, operatorId, target, metadata));
    },
  };
}

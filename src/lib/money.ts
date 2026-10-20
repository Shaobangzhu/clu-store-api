import type { Prisma } from '../generated/prisma/client.js';

// DTOs must call this explicitly; Decimal.toJSON() alone does not retain scale.
export function serializeMoney(amount: Prisma.Decimal): string {
  return amount.toFixed(2);
}

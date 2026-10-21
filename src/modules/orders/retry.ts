import { setTimeout } from 'node:timers/promises';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';

export async function retryCheckout<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      // The pinned pg adapter maps SQLSTATE 40001 / 40P01 to P2034.
      // Do not retry validation, constraints, timeouts or unknown commit outcomes.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') throw error;
      if (attempt === 2) throw new AppError(503, 'CHECKOUT_BUSY', 'Checkout is temporarily busy; retry with the same idempotency key');
      await setTimeout(20 * (attempt + 1));
    }
  }
  throw new Error('Unreachable checkout retry state');
}

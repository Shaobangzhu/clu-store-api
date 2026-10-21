import type { Prisma } from '../../generated/prisma/client.js';
import { unauthorized } from '../auth/token.js';

// Shared by cart mutations and checkout, including before a cart exists.
export async function lockCartOwner(tx: Prisma.TransactionClient, userId: string) {
  const users = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
  if (!users.length) throw unauthorized();
}

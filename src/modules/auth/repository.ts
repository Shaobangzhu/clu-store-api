import { Prisma, type User, type Role } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import type { z } from 'zod';
import type { safeUser } from '../../contracts/responses.js';

export type AuthDatabase = Pick<Prisma.TransactionClient, 'user' | '$queryRaw'>;
export const safeUserSelect = { id: true, username: true, email: true, role: true, createdAt: true } as const;
export type SafeUser = Pick<User, keyof typeof safeUserSelect>;
export function serializeUser(user: SafeUser): z.output<typeof safeUser> {
  return { id: user.id, username: user.username, email: user.email, role: user.role, createdAt: user.createdAt.toISOString() };
}
export function createAuthRepository(database: AuthDatabase) {
  return {
    async create(input: { username: string; email: string; passwordHash: string }, role: Role = 'USER') {
      try {
        return await database.user.create({ data: { ...input, role }, select: safeUserSelect });
      } catch (error) {
        // Both normal and functional unique indexes are authoritative, including races.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new AppError(409, 'ACCOUNT_CONFLICT', 'Unable to register with those account details');
        }
        throw error;
      }
    },
    async findCredentials(identifier: string) {
      // Match the initial migration's lower(btrim(...)) functional indexes exactly.
      // Username cannot contain @, so the two identity namespaces are unambiguous.
      const users = identifier.includes('@')
        ? await database.$queryRaw<User[]>`SELECT "id", "username", "email", "passwordHash", "role", "createdAt", "updatedAt"
            FROM "User" WHERE lower(btrim("email")) = ${identifier} LIMIT 1`
        : await database.$queryRaw<User[]>`SELECT "id", "username", "email", "passwordHash", "role", "createdAt", "updatedAt"
            FROM "User" WHERE lower(btrim("username")) = ${identifier} LIMIT 1`;
      return users[0] ?? null;
    },
    findSafeById: (id: string) => database.user.findUnique({ where: { id }, select: safeUserSelect }),
  };
}
export type AuthRepository = ReturnType<typeof createAuthRepository>;

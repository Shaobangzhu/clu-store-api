import { randomBytes } from 'node:crypto';
import { argon2id, hash, verify } from 'argon2';
import { AppError } from '../../lib/errors.js';

const options = { type: argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1, hashLength: 32 } as const;
let dummyHash: Promise<string> | undefined;
export function initializePasswordHashing() {
  // No known dummy credential. Prewarm once at server startup; never persisted.
  dummyHash ??= hash(randomBytes(32), options);
  return dummyHash;
}
let active = 0;
export async function withPasswordSlot<T>(operation: () => Promise<T>): Promise<T> {
  if (active >= 4) throw new AppError(503, 'SERVICE_NOT_READY', 'Authentication is temporarily busy');
  active += 1;
  try { return await operation(); } finally { active -= 1; }
}
export const hashPassword = (password: string) => hash(password, options);
export async function verifyPassword(passwordHash: string | undefined, password: string) {
  const dummy = await initializePasswordHashing();
  // An unknown account still pays the same configured Argon2id verification cost.
  try { return await verify(passwordHash ?? dummy, password); }
  catch {
    await verify(dummy, password);
    return false;
  }
}

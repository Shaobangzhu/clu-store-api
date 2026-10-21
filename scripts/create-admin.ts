import { z } from 'zod';
import { createDatabase } from '../src/lib/database.js';
import { AppError } from '../src/lib/errors.js';
import { createAuthRepository, serializeUser } from '../src/modules/auth/repository.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { usernameSchema, emailSchema, passwordSchema } from '../src/modules/auth/schemas.js';

const credentials = z.object({ username: usernameSchema, email: emailSchema, password: passwordSchema,
  confirmPassword: z.string().max(128),
}).strict().refine((value) => value.password === value.confirmPassword);

async function main() {
  // Deliberately no password argv/env option. A password manager can pipe JSON to stdin.
  if (process.stdin.isTTY) throw new AppError(400, 'VALIDATION_ERROR', 'Supply credentials as JSON on stdin');
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    bytes += buffer.length;
    if (bytes > 4096) throw new AppError(400, 'VALIDATION_ERROR', 'Input too large');
    chunks.push(buffer);
  }
  const input = credentials.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
  const url = z.string().url().parse(process.env.DATABASE_URL);
  const parsedUrl = new URL(url);
  const expectedDatabase = process.env.ADMIN_DATABASE_NAME;
  if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol) || !expectedDatabase
    || decodeURIComponent(parsedUrl.pathname.slice(1)) !== expectedDatabase) {
    throw new AppError(400, 'VALIDATION_ERROR', 'ADMIN_DATABASE_NAME must match the selected database');
  }
  const database = createDatabase(url, 5000);
  try {
    const actual = await database.client.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    if (actual[0]?.name !== expectedDatabase) throw new AppError(400, 'VALIDATION_ERROR', 'Database confirmation mismatch');
    // Create only: never overwrite credentials or silently promote an existing account.
    const user = await createAuthRepository(database.client).create({ username: input.username,
      email: input.email, passwordHash: await hashPassword(input.password) }, 'ADMIN');
    console.log(JSON.stringify({ user: serializeUser(user) }));
  } finally { await database.disconnect(); }
}
try { await main(); }
catch (error) {
  const code = error instanceof AppError ? error.code : error instanceof z.ZodError || error instanceof SyntaxError
    ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR';
  // Never print database errors, input, connection URLs or password hashes.
  console.error(`Admin provisioning failed (${code}). Check input, database confirmation and connectivity.`);
  process.exitCode = 1;
}

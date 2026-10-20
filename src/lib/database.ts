import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export function createDatabase(connectionString: string, timeoutMs: number) {
  const adapter = new PrismaPg({
    connectionString,
    max: 5,
    connectionTimeoutMillis: timeoutMs,
    statement_timeout: timeoutMs,
    query_timeout: timeoutMs,
    idleTimeoutMillis: 10000,
  });
  const client = new PrismaClient({ adapter, log: [] });
  return {
    client,
    async check(): Promise<void> { await client.$queryRaw`SELECT 1`; },
    disconnect: () => client.$disconnect(),
  };
}

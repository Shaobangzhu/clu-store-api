import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { AppError } from './errors.js';

export type CatalogReader = Pick<Prisma.TransactionClient,
  'product' | 'productModel' | 'productMemorySize' | 'productColor' | 'category' | 'offer' | 'newArrival' | 'supportInformation'>;
export interface CatalogDatabase {
  read<T>(operation: (client: CatalogReader) => Promise<T>): Promise<T>;
}
export function createCatalogDatabase(client: PrismaClient): CatalogDatabase {
  return { read: (operation) => client.$transaction(operation, {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 10000,
  }) };
}
export function readCatalog<T>(database: CatalogDatabase | undefined, operation: (client: CatalogReader) => Promise<T>): Promise<T> {
  if (!database) throw new AppError(503, 'SERVICE_NOT_READY', 'Database is not configured', { database: 'not_configured' });
  return database.read(operation);
}
// Prisma's case-insensitive PostgreSQL string filters use LIKE/ILIKE.
export function literalLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

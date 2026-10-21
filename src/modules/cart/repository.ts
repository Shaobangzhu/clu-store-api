import { Prisma, type PrismaClient, type Cart, type CartItem, type Product, type ProductModel,
  type ProductMemorySize, type ProductColor } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { unauthorized } from '../auth/token.js';
import type { AddItem } from './schemas.js';

export type CartItemRecord = CartItem & { product: Product; model: ProductModel; memorySize: ProductMemorySize; productColor: ProductColor };
export type CartRecord = Cart & { items: CartItemRecord[] };
type Sku = { modelPrice: string; extraPrice: string; available: boolean };

async function loadItems(tx: Prisma.TransactionClient, items: CartItem[]): Promise<CartItemRecord[]> {
  if (!items.length) return [];
  // Prisma's multi-relation include fans out concurrently on one pg transaction
  // connection. Load each relation sequentially while retaining the same snapshot.
  const products = await tx.product.findMany({ where: { id: { in: items.map((item) => item.productId) } } });
  const models = await tx.productModel.findMany({ where: { id: { in: items.map((item) => item.modelId) } } });
  const memories = await tx.productMemorySize.findMany({ where: { id: { in: items.map((item) => item.memorySizeId) } } });
  const colors = await tx.productColor.findMany({ where: { OR: items.map((item) => ({ productId: item.productId, name: item.color })) } });
  return items.map((item) => {
    const product = products.find((row) => row.id === item.productId);
    const model = models.find((row) => row.id === item.modelId);
    const memorySize = memories.find((row) => row.id === item.memorySizeId);
    const productColor = colors.find((row) => row.productId === item.productId && row.name === item.color);
    if (!product || !model || !memorySize || !productColor) throw new Error('Cart relation integrity failure');
    return { ...item, product, model, memorySize, productColor };
  });
}

function writer(tx: Prisma.TransactionClient, userId: string) {
  return {
    getCart: () => tx.cart.findUnique({ where: { userId }, include: { items: true } }),
    productExists: (id: number) => tx.product.findUnique({ where: { id }, select: { id: true } }),
    async sku(input: AddItem) {
      // One statement checks membership and locks the selected catalog rows against
      // price/availability updates until this cart mutation commits.
      const rows = await tx.$queryRaw<Sku[]>`
        SELECT m."price"::text AS "modelPrice", s."extraPrice"::text AS "extraPrice",
          (p."inStock" AND m."inStock" AND s."inStock" AND c."inStock") AS "available"
        FROM "Product" p
        JOIN "ProductModel" m ON m."productId" = p.id AND m.id = ${input.modelId}
        JOIN "ProductMemorySize" s ON s."productId" = p.id AND s.id = ${input.memorySizeId}
        JOIN "ProductColor" c ON c."productId" = p.id AND c.name = ${input.color}
        WHERE p.id = ${input.productId}
        FOR SHARE OF p, m, s, c`;
      return rows[0] ?? null;
    },
    ensureCart: () => tx.cart.upsert({ where: { userId }, create: { userId, currency: 'CNY' }, update: {} }),
    saveItem: async (cartId: number, input: AddItem, quantity: number, unitPrice: Prisma.Decimal) => {
      const key = { cartId, productId: input.productId, modelId: input.modelId, memorySizeId: input.memorySizeId, color: input.color };
      const item = await tx.cartItem.upsert({ where: { cartId_productId_modelId_memorySizeId_color: key },
        create: { ...key, quantity, unitPrice }, update: { quantity, unitPrice } });
      return (await loadItems(tx, [item]))[0]!;
    },
    removeItem: (id: number) => tx.cartItem.deleteMany({ where: { id, cart: { userId } } }),
    clear: () => tx.cartItem.deleteMany({ where: { cart: { userId } } }),
  };
}
export type CartWriter = ReturnType<typeof writer>;
export function createCartRepository(database: PrismaClient | undefined) {
  function client() {
    if (!database) throw new AppError(503, 'SERVICE_NOT_READY', 'Database is not configured');
    return database;
  }
  return {
    read: (userId: string) => client().$transaction(async (tx): Promise<CartRecord | null> => {
      const cart = await tx.cart.findUnique({ where: { userId }, include: { items: { orderBy: { id: 'asc' } } } });
      return cart ? { ...cart, items: await loadItems(tx, cart.items) } : null;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 10000 }),
    mutate: <T>(userId: string, operation: (cart: CartWriter) => Promise<T>) => client().$transaction(async (tx) => {
      // Lock the owner even before a cart exists. All cart writes (including deletes)
      // must use this lock; P07 checkout must use the same ordering/protocol.
      const users = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
      if (!users.length) throw unauthorized();
      return operation(writer(tx, userId));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 10000 }),
  };
}
export type CartRepository = ReturnType<typeof createCartRepository>;

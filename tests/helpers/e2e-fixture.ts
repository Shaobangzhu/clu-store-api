import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { createCartFixture } from './cart-fixture.js';

// Called only after the shared test connection guard and run lock succeed.
export async function createE2eFixture(client: PrismaClient) {
  const password = randomBytes(24).toString('base64url');
  const passwordHash = await hashPassword(password);
  const owned = await client.$transaction(async (tx) => {
    const fixture = await createCartFixture(tx, passwordHash);
    const admin = await tx.user.create({ data: {
      username: `${fixture.firstUser.username}_admin`,
      email: `${fixture.firstUser.username}_admin@example.test`, passwordHash, role: 'ADMIN',
    } });
    const category = await tx.category.create({ data: {
      title: `${fixture.firstUser.username} Devices`, slug: fixture.firstUser.username,
    } });
    await tx.product.updateMany({ where: { id: { in: [fixture.product.id, fixture.foreignProduct.id] } },
      data: { categoryId: category.id } });
    return { ...fixture, admin, category };
  });
  const account = (user: typeof owned.firstUser) => ({ id: user.id, username: user.username, email: user.email, password });
  return {
    manifest: {
      version: 1, users: { customer: account(owned.firstUser), other: account(owned.secondUser), admin: account(owned.admin) },
      categorySlug: owned.category.slug, productId: owned.product.id,
      input: owned.input, expectedUnitPrice: '10.10',
    },
    async cleanup() {
      // Exact allocated IDs only. FK restrictions fail closed on foreign references.
      await client.$transaction(async (tx) => {
        const userId = { in: [owned.firstUser.id, owned.secondUser.id, owned.admin.id] };
        await tx.orderStatusHistory.deleteMany({ where: { order: { userId } } });
        await tx.orderItem.deleteMany({ where: { order: { userId } } });
        await tx.order.deleteMany({ where: { userId } });
        await tx.user.deleteMany({ where: { id: userId } });
        const productId = { in: [owned.product.id, owned.foreignProduct.id] };
        await tx.productColor.deleteMany({ where: { productId } });
        await tx.productMemorySize.deleteMany({ where: { productId } });
        await tx.productModel.deleteMany({ where: { productId } });
        await tx.product.deleteMany({ where: { id: productId } });
        await tx.category.deleteMany({ where: { id: owned.category.id } });
      });
    },
  };
}

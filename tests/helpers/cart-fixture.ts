import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../src/generated/prisma/client.js';

export async function createCartFixture(tx: Prisma.TransactionClient, passwordHash: string) {
  const prefix = `p06_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const firstUser = await tx.user.create({ data: { username: `${prefix}_a`, email: `${prefix}_a@example.test`, passwordHash } });
  const secondUser = await tx.user.create({ data: { username: `${prefix}_b`, email: `${prefix}_b@example.test`, passwordHash } });
  const product = await tx.product.create({ data: { name: `${prefix} Device`, title: 'Original test device',
    imageSrc: '/media/demo-placeholder.svg', carouselImages: [], features: [], startingPrice: '999.99', inStock: true } });
  const foreignProduct = await tx.product.create({ data: { name: `${prefix} Other device`, title: 'Other test device',
    imageSrc: '/media/demo-placeholder.svg', carouselImages: [], features: [], startingPrice: '500.00', inStock: true } });
  const model = await tx.productModel.create({ data: { productId: product.id, name: 'Full base model', specification: 'Test model specification', price: '10.00', inStock: true } });
  const secondModel = await tx.productModel.create({ data: { productId: product.id, name: 'Full base model', specification: 'Distinct configuration, same display name', price: '20.30', inStock: true } });
  const memory = await tx.productMemorySize.create({ data: { productId: product.id, name: 'Upgrade', extraPrice: '0.10', inStock: true } });
  const secondMemory = await tx.productMemorySize.create({ data: { productId: product.id, name: 'Upgrade', extraPrice: '0.20', inStock: true } });
  const color = await tx.productColor.create({ data: { productId: product.id, name: 'Silver', inStock: true } });
  await tx.productColor.create({ data: { productId: product.id, name: 'Black', inStock: true } });
  const foreignModel = await tx.productModel.create({ data: { productId: foreignProduct.id, name: 'Other model', specification: 'Other specification', price: '5.00', inStock: true } });
  const foreignMemory = await tx.productMemorySize.create({ data: { productId: foreignProduct.id, name: 'Other memory', extraPrice: '1.00', inStock: true } });
  await tx.productColor.create({ data: { productId: foreignProduct.id, name: 'Foreign color', inStock: true } });
  return { firstUser, secondUser, product, foreignProduct, model, secondModel, memory, secondMemory, color, foreignModel, foreignMemory,
    input: { productId: product.id, modelId: model.id, memorySizeId: memory.id, color: color.name, qty: 1 },
  };
}
export type CartFixture = Awaited<ReturnType<typeof createCartFixture>>;

import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../src/generated/prisma/client.js';

export const testNow = new Date('2026-10-20T12:00:00Z');
const image = '/media/demo-placeholder.svg';
export async function createReadFixture(tx: Prisma.TransactionClient) {
  const prefix = `p04${randomUUID().replaceAll('-', '')}`;
  const category = await tx.category.create({ data: { title: `电脑${prefix}`, slug: `${prefix}-computers`,
    subTitle: 'Editorial category', videos: { id: 2, regularSrc: null, smallSrc: null },
    editorialFeatures: [{ id: 13, title: 'Editorial card', detail: 'A reviewed demo card', imageSrc: image, textColor: 'black' }],
  } });
  const phones = await tx.category.create({ data: { title: `Phones ${prefix}`, slug: `${prefix}-phones` } });
  const base = { title: 'Demo title', imageSrc: image, carouselImages: [image],
    features: ['Synthetic integration fixture'], inStock: true, createdAt: new Date('2026-01-01T00:00:00Z') };
  const alpha = await tx.product.create({ data: { ...base, name: `${prefix} Alpha`, categoryId: category.id, startingPrice: '10.00', installments: '0.50' } });
  const beta = await tx.product.create({ data: { ...base, name: `${prefix} Beta`, title: `${prefix} NEEDLE`, categoryId: category.id, startingPrice: '2.50' } });
  const duplicate = await tx.product.create({ data: { ...base, name: `${prefix} Alpha`, categoryId: phones.id, startingPrice: '10.00' } });
  const summary = await tx.product.create({ data: { ...base, name: `${prefix} Summary`, categoryId: category.id, startingPrice: '100.00', inStock: false } });
  const special = await tx.product.create({ data: { ...base, name: `${prefix} 100%_literal`, categoryId: phones.id, startingPrice: '1.00' } });
  for (const product of [alpha, beta, duplicate, special]) {
    await tx.productModel.create({ data: { productId: product.id, name: `${product.name} full model`, specification: 'Complete test specification', price: product.startingPrice, inStock: true } });
    await tx.productMemorySize.create({ data: { productId: product.id, name: 'Base', extraPrice: '0.00', inStock: true } });
    await tx.productColor.create({ data: { productId: product.id, name: 'Silver', inStock: true } });
  }
  const upgrade = await tx.productMemorySize.create({ data: { productId: alpha.id, name: 'Upgrade', extraPrice: '0.10', inStock: true } });
  const retired = await tx.productModel.create({ data: { productId: alpha.id, name: 'Retired compatibility model', specification: 'Not purchasable', price: '999.00', inStock: false } });
  await tx.productMemorySize.create({ data: { productId: alpha.id, name: 'Retired memory', extraPrice: '999.00', inStock: false } });
  await tx.productColor.create({ data: { productId: alpha.id, name: 'Retired color', inStock: false } });
  const offerBase = { type: 'Synthetic campaign', title: prefix, detail: 'Test only', imageSrc: image, active: true };
  const live = await tx.offer.create({ data: { ...offerBase, productId: alpha.id, soldOut: true,
    startsAt: new Date(testNow.getTime() - 1000), endsAt: new Date(testNow.getTime() + 1000) } });
  const starting = await tx.offer.create({ data: { ...offerBase, startsAt: testNow } });
  const undated = await tx.offer.create({ data: offerBase });
  const inactive = await tx.offer.create({ data: { ...offerBase, active: false } });
  const expired = await tx.offer.create({ data: { ...offerBase, endsAt: testNow } });
  const future = await tx.offer.create({ data: { ...offerBase, startsAt: new Date(testNow.getTime() + 1) } });
  const historical = await tx.offer.create({ data: { ...offerBase, startsAt: new Date('2025-01-04'), endsAt: new Date('2025-01-08') } });
  const arrivalBase = { title: prefix, detail: 'Editorial test', imageSrc: image, textColor: 'white', displayOrder: 100000 };
  const arrivalA = await tx.newArrival.create({ data: { ...arrivalBase, productId: alpha.id, soldOut: true } });
  const arrivalB = await tx.newArrival.create({ data: arrivalBase });
  const arrivalFirst = await tx.newArrival.create({ data: { ...arrivalBase, displayOrder: 99999 } });
  const dirtyHtml = `<section onclick="attack()"><h1>${prefix}</h1><p><strong>safe</strong></p><script>attack()</script><style>body{display:none}</style><img src=x onerror=attack()><a href="javascript:attack()">link</a><svg><script>attack()</script></svg><iframe srcdoc="attack()">hidden</iframe></section>`;
  await tx.supportInformation.upsert({ where: { key_locale: { key: 'support', locale: 'zh-CN' } },
    create: { key: 'support', locale: 'zh-CN', html: dirtyHtml }, update: { html: dirtyHtml } });
  return { prefix, category, phones, alpha, beta, duplicate, summary, special, upgrade, retired,
    offers: { live, starting, undated, inactive, expired, future, historical }, arrivals: { arrivalA, arrivalB, arrivalFirst } };
}

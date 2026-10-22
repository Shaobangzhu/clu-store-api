import type { Product, Offer, NewArrival } from '../../generated/prisma/client.js';
import { serializeMoney } from '../../lib/money.js';
import { localMedia, stringList } from './schemas.js';
import type { ProductRecord } from './repository.js';
import type { z } from 'zod';
import type { productSummary, product as productDto, offer as offerDto, arrival as arrivalDto } from '../../contracts/responses.js';

export function serializeProductSummary(product: Product): z.output<typeof productSummary> {
  return { id: product.id, name: product.name, title: product.title,
    image: localMedia.parse(product.imageSrc), startingPrice: serializeMoney(product.startingPrice),
    installments: product.installments === null ? null : serializeMoney(product.installments),
    features: stringList.parse(product.features), inStock: product.inStock,
  };
}
export function serializeProduct(product: ProductRecord): z.output<typeof productDto> {
  return { ...serializeProductSummary(product), category: product.category,
    carouselImages: localMedia.array().parse(product.carouselImages),
    // Model price is full base; memory price is incremental. startingPrice is never added.
    models: product.models.map((model) => ({ id: model.id, name: model.name,
      specification: model.specification, price: serializeMoney(model.price), inStock: model.inStock })),
    memorySizes: product.memorySizes.map((memory) => ({ id: memory.id, name: memory.name,
      price: serializeMoney(memory.extraPrice), inStock: memory.inStock })),
    colors: product.colors.map((color) => color.name),
  };
}
export function serializeOffer(offer: Offer): z.output<typeof offerDto> {
  return { id: offer.id, productId: offer.productId, type: offer.type, title: offer.title, detail: offer.detail,
    image: localMedia.parse(offer.imageSrc), soldOut: offer.soldOut };
}
export function serializeArrival(arrival: NewArrival): z.output<typeof arrivalDto> {
  return { id: arrival.id, productId: arrival.productId, title: arrival.title, detail: arrival.detail,
    image: localMedia.parse(arrival.imageSrc), textColor: arrival.textColor, soldOut: arrival.soldOut };
}

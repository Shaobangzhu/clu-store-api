import type { Product, Offer, NewArrival } from '../../generated/prisma/client.js';
import { serializeMoney } from '../../lib/money.js';
import { localMedia, stringList } from './schemas.js';
import type { ProductRecord } from './repository.js';

export function serializeProductSummary(product: Product) {
  return { id: product.id, name: product.name, title: product.title,
    image: localMedia.parse(product.imageSrc), startingPrice: serializeMoney(product.startingPrice),
    installments: product.installments === null ? null : serializeMoney(product.installments),
    features: stringList.parse(product.features), inStock: product.inStock,
  };
}
export function serializeProduct(product: ProductRecord) {
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
export function serializeOffer(offer: Offer) {
  return { id: offer.id, productId: offer.productId, type: offer.type, title: offer.title, detail: offer.detail,
    image: localMedia.parse(offer.imageSrc), soldOut: offer.soldOut };
}
export function serializeArrival(arrival: NewArrival) {
  return { id: arrival.id, productId: arrival.productId, title: arrival.title, detail: arrival.detail,
    image: localMedia.parse(arrival.imageSrc), textColor: arrival.textColor, soldOut: arrival.soldOut };
}

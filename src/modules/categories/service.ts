import { AppError } from '../../lib/errors.js';
import type { Category } from '../../generated/prisma/client.js';
import type { createCategoriesRepository } from './repository.js';
import { categoryFeatures, categoryVideo } from './schemas.js';
import { serializeProductSummary } from '../products/serializer.js';

function navigation(category: Category) {
  return { id: category.id, title: category.title, slug: category.slug, subTitle: category.subTitle };
}
export function createCategoriesService(repository: ReturnType<typeof createCategoriesRepository>) {
  return {
    async list() { return (await repository.list()).map(navigation); },
    async detail(title: string) {
      const category = await repository.detail(title);
      if (!category) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
      const videos = category.videos === null || (Array.isArray(category.videos) && category.videos.length === 0)
        ? null : categoryVideo.parse(category.videos);
      const features = categoryFeatures.parse(category.editorialFeatures ?? []).map(({ imageSrc, ...feature }) => ({ ...feature, image: imageSrc }));
      return { ...navigation(category), videos, features, products: category.products.map(serializeProductSummary) };
    },
  };
}

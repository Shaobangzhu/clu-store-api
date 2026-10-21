import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '../src/generated/prisma/client.js';

const id = z.number().int().positive().max(2147483647);
const text = z.string().trim().min(1).max(5000);
const money = z.string().regex(/^(0|[1-9]\d{0,9})\.\d{2}$/);
const media = z.literal('/media/demo-placeholder.svg');
const source = z.object({ repository: text, commit: z.string().regex(/^[a-f0-9]{40}$/),
  files: z.array(z.object({ path: text, sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(1),
}).strict();
const category = z.object({ id, title: text, slug: z.string().regex(/^[a-z-]+$/), subTitle: text,
  videos: z.union([z.array(z.never()), z.object({ id, regularSrc: z.null(), smallSrc: z.null() }).strict()]),
  editorialFeatures: z.array(z.object({ id, title: text, detail: text, imageSrc: media, textColor: z.enum(['black', 'white']) }).strict()),
}).strict();
const model = z.object({ id, name: text, specification: text, price: money, inStock: z.boolean() }).strict();
const memory = z.object({ id, name: text, extraPrice: money, inStock: z.boolean() }).strict();
const color = z.object({ id, name: text, inStock: z.boolean() }).strict();
const product = z.object({ id, sourceKey: text, name: text, title: text, categoryId: id,
  imageSrc: media, carouselImages: z.array(media).min(1), startingPrice: money,
  installments: z.null(), features: z.array(text), inStock: z.boolean(),
  models: z.array(model), memorySizes: z.array(memory), colors: z.array(color),
}).strict();
const offer = z.object({ id, productId: z.null(), type: text, title: text, detail: text,
  imageSrc: media, active: z.literal(false), startsAt: z.null(), endsAt: z.null(), soldOut: z.boolean(),
}).strict();
const arrival = z.object({ id, productId: id.nullable(), displayOrder: z.number().int().nonnegative(),
  title: text, detail: text, imageSrc: media, textColor: z.enum(['black', 'white']), soldOut: z.boolean(),
}).strict();
const schema = z.object({ version: z.literal(1), sourceKind: z.enum(['local-frontend-demo', 'response-samples-with-frontend-demo']), source,
  categories: z.array(category).min(1), products: z.array(product).min(1),
  offers: z.array(offer), newArrivals: z.array(arrival),
  productIdRemaps: z.array(z.object({ from: id, to: id }).strict()).optional(),
}).strict();
export type SeedCatalog = z.infer<typeof schema>;

// Reject unsafe material without echoing its contents. Media is always local.
export function assertSafeFixture(value: unknown, path = '$'): void {
  if (typeof value === 'string') {
    if (/(?:https?:\/\/|javascript:|data:|file:|\bBearer\s+\S+|\beyJ[\w-]+\.[\w-]+\.[\w-]+|-----BEGIN[ -]|(?:\d{1,3}\.){3}\d{1,3})/i.test(value)) {
      throw new Error(`Unsafe fixture string at ${path}`);
    }
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSafeFixture(entry, `${path}[${index}]`));
  } else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (/authorization|password|token|secret|cookie|api[-_]?key/i.test(key)) throw new Error(`Sensitive fixture key at ${path}`);
      assertSafeFixture(entry, `${path}.${key}`);
    }
  }
}

function unique(values: (number | string)[], label: string) {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}`);
}
export function parseCatalog(value: unknown): SeedCatalog {
  assertSafeFixture(value);
  const catalog = schema.parse(value);
  unique(catalog.categories.map((entry) => entry.id), 'category IDs');
  unique(catalog.categories.map((entry) => entry.title), 'category titles');
  unique(catalog.categories.map((entry) => entry.slug), 'category slugs');
  unique(catalog.products.map((entry) => entry.id), 'product IDs');
  unique(catalog.products.map((entry) => entry.sourceKey), 'source keys');
  unique(catalog.products.flatMap((entry) => entry.models.map((option) => option.id)), 'model IDs');
  unique(catalog.products.flatMap((entry) => entry.memorySizes.map((option) => option.id)), 'memory IDs');
  unique(catalog.products.flatMap((entry) => entry.colors.map((option) => option.id)), 'color IDs');
  unique(catalog.offers.map((entry) => entry.id), 'offer IDs');
  unique(catalog.newArrivals.map((entry) => entry.id), 'arrival IDs');
  const categories = new Set(catalog.categories.map((entry) => entry.id));
  const products = new Set(catalog.products.map((entry) => entry.id));
  unique((catalog.productIdRemaps ?? []).map((entry) => entry.from), 'remap source IDs');
  unique((catalog.productIdRemaps ?? []).map((entry) => entry.to), 'remap target IDs');
  for (const remap of catalog.productIdRemaps ?? []) {
    if (!((remap.from === 1001 && remap.to === 7) || (remap.from === 1002 && remap.to === 8))
      || !products.has(remap.to) || products.has(remap.from)) throw new Error('Unreviewed product ID remap');
  }
  const reserved = new Set([7, 15, 22, 31, 42]);
  for (const entry of catalog.products) {
    if (catalog.sourceKind === 'local-frontend-demo' && reserved.has(entry.id)) throw new Error('Unverified server sample ID used by frontend fallback');
    if (!categories.has(entry.categoryId)) throw new Error('Missing category relationship');
    unique(entry.colors.map((option) => option.name), 'product colors');
    const models = entry.models.filter((option) => !entry.inStock || option.inStock);
    const memories = entry.memorySizes.filter((option) => !entry.inStock || option.inStock);
    if (entry.inStock && (!models.length || !memories.length || !entry.colors.some((option) => option.inStock))) {
      throw new Error('Purchasable product has incomplete configuration');
    }
    if (!models.length || !memories.length) continue;
    const minModel = Prisma.Decimal.min(...models.map((option) => new Prisma.Decimal(option.price)));
    const minMemory = Prisma.Decimal.min(...memories.map((option) => new Prisma.Decimal(option.extraPrice)));
    if (!minModel.plus(minMemory).equals(entry.startingPrice)) throw new Error('Inconsistent startingPrice');
  }
  for (const entry of catalog.newArrivals) {
    if (entry.productId !== null && !products.has(entry.productId)) throw new Error('Missing arrival relationship');
  }
  return catalog;
}
export function loadCatalog(): SeedCatalog {
  const catalog = parseCatalog(JSON.parse(readFileSync(new URL('./fixtures/catalog.json', import.meta.url), 'utf8')));
  const file = catalog.sourceKind === 'local-frontend-demo' ? 'frontend-evidence.json' : 'sample-evidence.json';
  const evidence = JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8')) as { source: SeedCatalog['source'] };
  assertSafeFixture(evidence);
  if (JSON.stringify(catalog.source) !== JSON.stringify(evidence.source)) throw new Error('Fixture evidence/source mismatch');
  return catalog;
}
export function loadPreviousCatalog(): SeedCatalog {
  return parseCatalog(JSON.parse(readFileSync(new URL('./fixtures/frontend-demo-baseline.json', import.meta.url), 'utf8')));
}
export function catalogHash(catalog: SeedCatalog): string {
  return createHash('sha256').update(JSON.stringify(catalog)).digest('hex');
}

export function renderSupport(value: unknown): string {
  assertSafeFixture(value);
  const content = z.object({ title: text, paragraphs: z.array(text).min(1).max(6) }).strict().parse(value);
  const escape = (input: string) => input.replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
  return `<section><h1>${escape(content.title)}</h1>${content.paragraphs.map((paragraph) => `<p>${escape(paragraph)}</p>`).join('')}</section>`;
}
export function loadSupport(): string {
  return renderSupport(JSON.parse(readFileSync(new URL('./fixtures/support.json', import.meta.url), 'utf8')));
}

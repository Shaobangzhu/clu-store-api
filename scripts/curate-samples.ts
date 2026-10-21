import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '../src/generated/prisma/client.js';
import { loadPreviousCatalog, parseCatalog, assertSafeFixture, type SeedCatalog } from '../prisma/seed-data.js';

const directory = process.argv[2];
if (!directory) throw new Error('Provide the local directory containing all six response JSON files');
const names = ['getProductsSampleResponse.json', 'getProductsByIdSampleResponse.json', 'getCategoryByIdSampleResponse.json',
  'getOffersSampleResponse.json', 'newArrivalsSampleResponse.json', 'getSupportResponse.json'] as const;
const scan: { file: string; removedUrlCount: number; excludedHtmlCharacters?: number }[] = [];
const files: { path: string; sha256: string }[] = [];
const payloads: Record<string, unknown> = {};
const raws: { name: string; bytes: Buffer }[] = [];
function sanitize(value: unknown, counters: { urls: number }): unknown {
  if (typeof value === 'string') {
    if (/\bBearer\s+\S+|\beyJ[\w-]+\.[\w-]+\.[\w-]+|-----BEGIN[ -]/i.test(value)) throw new Error('Sensitive sample string; no tracked fixture written');
    return value.replace(/https?:\/\/[^\s"'<>]+/gi, () => { counters.urls++; return '[external-url-omitted]'; });
  }
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry, counters));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    if (/authorization|password|token|secret|cookie|api[-_]?key/i.test(key)) throw new Error('Sensitive sample key; no tracked fixture written');
    return [key, sanitize(entry, counters)];
  }));
  return value;
}
for (const name of names) {
  const bytes = readFileSync(resolve(directory, name));
  const input: unknown = JSON.parse(bytes.toString('utf8'));
  const counters = { urls: 0 };
  const safe = sanitize(input, counters);
  files.push({ path: `response-samples/${name}`, sha256: createHash('sha256').update(bytes).digest('hex') });
  if (name === 'getSupportResponse.json') {
    const html = z.object({ data: z.string() }).strict().parse(input).data;
    payloads[name] = { excluded: 'Legacy legal/support HTML intentionally not reproduced', characterCount: html.length };
    scan.push({ file: name, removedUrlCount: counters.urls, excludedHtmlCharacters: html.length });
  } else {
    assertSafeFixture(safe);
    payloads[name] = safe;
    scan.push({ file: name, removedUrlCount: counters.urls });
  }
  raws.push({ name, bytes });
}
const text = z.string().min(1);
const numeric = z.number().finite().nonnegative();
const id = z.number().int().positive();
const summary = z.object({ id, name: text, title: text, image: text, startingPrice: numeric,
  installments: numeric, features: z.array(text) });
const complete = summary.extend({ carouselImages: z.array(text),
  models: z.array(z.object({ id, name: text, specification: text, price: numeric }).strict()).min(1),
  memorySizes: z.array(z.object({ id, name: text, price: numeric }).strict()).min(1),
  colors: z.array(text).min(1), inStock: z.boolean(), category: text.nullable(),
}).strict();
const rawCategory = z.object({ id, title: text, subTitle: text,
  videos: z.object({ id, regularSrc: text, smallSrc: text }).strict(),
  features: z.array(z.object({ id, title: text, detail: text, image: text, textColor: z.enum(['black', 'white']) }).strict()),
  products: z.array(summary.strict()),
}).strict().parse(payloads['getCategoryByIdSampleResponse.json']);
const search = z.array(complete).parse(payloads['getProductsSampleResponse.json']);
const detail = complete.parse(payloads['getProductsByIdSampleResponse.json']);
const previous = loadPreviousCatalog();
const source = { repository: 'local-response-samples + Shaobangzhu/clu-store-client', commit: previous.source.commit,
  files: [...files, ...previous.source.files] };
const products = structuredClone(previous.products);
const remaps = [{ from: 1001, to: 7 }, { from: 1002, to: 8 }];
for (const remap of remaps) {
  const entry = products.find((product) => product.id === remap.from);
  if (!entry || products.some((product) => product.id === remap.to)) throw new Error('Ambiguous baseline ID mapping');
  entry.id = remap.to;
}
const categories = structuredClone(previous.categories);
const category = categories.find((entry) => entry.id === rawCategory.id);
if (!category || category.title !== rawCategory.title) throw new Error('Category identity mismatch');
category.subTitle = rawCategory.subTitle;
category.videos = { id: rawCategory.videos.id, regularSrc: null, smallSrc: null };
category.editorialFeatures = rawCategory.features.map(({ image: _image, ...feature }) => {
  void _image;
  return { ...feature, imageSrc: '/media/demo-placeholder.svg' };
});
const money = (value: number) => new Prisma.Decimal(value.toString()).toFixed(2);
for (const row of rawCategory.products) {
  const old = products.find((entry) => entry.id === row.id);
  if (old && old.name !== row.name) throw new Error('Category summary conflicts with frontend product name');
  const options = old ? { models: old.models.map((entry) => ({ ...entry, inStock: false })),
    memorySizes: old.memorySizes.map((entry) => ({ ...entry, inStock: false })),
    colors: old.colors.map((entry) => ({ ...entry, inStock: false })) } : { models: [], memorySizes: [], colors: [] };
  const product: SeedCatalog['products'][number] = { id: row.id, sourceKey: `category-summary:${row.id}`, name: row.name,
    title: `演示样本 · ${row.title}`, categoryId: rawCategory.id,
    imageSrc: '/media/demo-placeholder.svg', carouselImages: ['/media/demo-placeholder.svg'],
    startingPrice: money(row.startingPrice), installments: null,
    features: ['来源样本仅为演示，不构成真实商品规格或销售承诺。', ...row.features], inStock: false, ...options };
  if (old) products[products.indexOf(old)] = product; else products.push(product);
}
for (const row of [detail, ...search]) {
  const old = products.find((entry) => entry.id === row.id);
  if (old && old.name !== row.name) throw new Error('Complete sample product name collision');
  const categoryId = row.category === null && row.id === 2 ? 1 : categories.find((entry) => entry.title === row.category)?.id;
  if (!categoryId) throw new Error('Unknown complete product category');
  const retiredModels = old?.models.map((entry) => ({ ...entry, inStock: false })) ?? [];
  const retiredMemories = old?.memorySizes.map((entry) => ({ ...entry, inStock: false })) ?? [];
  const colors = old?.colors.map((entry) => ({ ...entry, inStock: false })) ?? [];
  row.colors.forEach((name, index) => {
    const existing = colors.find((entry) => entry.name === name);
    if (existing) existing.inStock = row.inStock;
    else colors.push({ id: 4000000 + row.id * 100 + index + 1, name, inStock: row.inStock });
  });
  const product: SeedCatalog['products'][number] = { id: row.id, sourceKey: `complete-sample:${row.id}`, name: row.name,
    title: `演示样本 · ${row.title}`, categoryId, imageSrc: '/media/demo-placeholder.svg',
    carouselImages: row.carouselImages.map(() => '/media/demo-placeholder.svg'),
    startingPrice: money(row.startingPrice), installments: null,
    features: ['来源样本仅为演示，不构成真实商品规格或销售承诺。', ...row.features], inStock: row.inStock,
    models: [...retiredModels, ...row.models.map((entry) => ({ id: entry.id, name: `${row.name} — ${entry.name}（样本）`,
      specification: `${entry.specification}（来源样本演示配置，未经厂商核实）`, price: money(entry.price), inStock: row.inStock }))].sort((a, b) => a.id - b.id),
    memorySizes: [...retiredMemories, ...row.memorySizes.map((entry) => ({ id: entry.id, name: entry.name,
      extraPrice: money(entry.price), inStock: row.inStock }))].sort((a, b) => a.id - b.id),
    colors: colors.sort((a, b) => a.id - b.id),
  };
  if (old) products[products.indexOf(old)] = product; else products.push(product);
}
const rawOffers = z.array(z.object({ type: text, title: text, detail: text, image: text, soldOut: z.boolean() }).strict())
  .parse(payloads['getOffersSampleResponse.json']);
const rawArrivals = z.array(z.object({ title: text, detail: text, image: text, soldOut: z.boolean(), textColor: z.enum(['black', 'white']) }).strict())
  .parse(payloads['newArrivalsSampleResponse.json']);
const catalog = parseCatalog({ version: 1, sourceKind: 'response-samples-with-frontend-demo', source,
  categories, products: products.sort((a, b) => a.id - b.id), productIdRemaps: remaps,
  offers: rawOffers.map((row, index) => ({ id: 11001 + index, productId: null, type: `历史演示 · ${row.type}`,
    title: row.title, detail: row.detail, imageSrc: '/media/demo-placeholder.svg', active: false,
    startsAt: null, endsAt: null, soldOut: row.soldOut })),
  newArrivals: rawArrivals.map((row, index) => ({ id: 12001 + index, productId: null, displayOrder: index,
    title: row.title, detail: row.detail, imageSrc: '/media/demo-placeholder.svg', textColor: row.textColor, soldOut: row.soldOut })),
});
const evidence = { source, scan, payloads };
assertSafeFixture(evidence);
mkdirSync('local-input/response-samples', { recursive: true });
for (const { name, bytes } of raws) {
  const path = resolve('local-input/response-samples', name);
  if (existsSync(path)) {
    if (!readFileSync(path).equals(bytes)) throw new Error('Existing local source evidence differs; refusing overwrite');
  } else writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
}
writeFileSync('prisma/fixtures/sample-evidence.json', JSON.stringify(evidence, null, 2) + '\n');
writeFileSync('prisma/fixtures/catalog.json', JSON.stringify(catalog, null, 2) + '\n');
console.log(JSON.stringify({ source: catalog.sourceKind, products: catalog.products.length,
  completeSampleIds: [detail, ...search].map((entry) => entry.id),
  nonPurchasableSummaryIds: rawCategory.products.filter((entry) => !search.some((product) => product.id === entry.id)).map((entry) => entry.id),
  removedUrls: scan.reduce((sum, entry) => sum + entry.removedUrlCount, 0) }));

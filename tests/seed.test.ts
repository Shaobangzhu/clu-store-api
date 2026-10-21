import { describe, expect, it } from 'vitest';
import { loadCatalog, loadSupport, loadPreviousCatalog, parseCatalog, assertSafeFixture, renderSupport } from '../prisma/seed-data.js';
import { previousProductMatches } from '../prisma/seed-catalog.js';
import { seedDatabaseUrl } from '../prisma/seed-target.js';

const catalog = loadCatalog();
const copy = () => structuredClone(catalog);

describe('reconciled sample/demo catalog', () => {
  it('preserves all verified server product IDs', () => {
    expect(catalog.products.find((entry) => entry.id === 2)?.name).toBe('iPhone 16');
    expect(catalog.products.find((entry) => entry.id === 6)?.name).toBe('MacBook Air');
    expect(catalog.products.map((entry) => entry.id)).toEqual(expect.arrayContaining([2, 6, 7, 15, 22, 31, 42]));
    expect(catalog.products.map((entry) => entry.id)).not.toEqual(expect.arrayContaining([1001, 1002]));
    expect(catalog.products.find((entry) => entry.id === 2)?.categoryId).toBe(1);
  });
  it('has complete names/specifications and distinct global option IDs', () => {
    const ids = catalog.products.flatMap((entry) => [...entry.models, ...entry.memorySizes, ...entry.colors].map((option) => option.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(catalog.products.every((entry) => entry.models.every((model) => model.name.length > 5 && model.specification.includes('演示配置')))).toBe(true);
  });
  it('rejects duplicate global model and missing category references', () => {
    const duplicate = copy();
    duplicate.products[1]!.models[0]!.id = duplicate.products[0]!.models[0]!.id;
    expect(() => parseCatalog(duplicate)).toThrow('Duplicate model IDs');
    const missing = copy();
    missing.products[0]!.categoryId = 9999;
    expect(() => parseCatalog(missing)).toThrow('Missing category');
  });
  it('rejects unsafe media, price drift and accidental campaign activation', () => {
    const unsafe = copy();
    unsafe.products[0]!.imageSrc = '//external.example/media' as typeof unsafe.products[0]['imageSrc'];
    expect(() => parseCatalog(unsafe)).toThrow();
    const price = copy();
    price.products[0]!.startingPrice = '0.00';
    expect(() => parseCatalog(price)).toThrow('startingPrice');
    const active = copy() as unknown as { offers: { active: boolean }[] };
    active.offers[0]!.active = true;
    expect(() => parseCatalog(active)).toThrow();
  });
  it('retains editorial arrivals and keeps all historical offers inactive', () => {
    expect(catalog.newArrivals.some((entry) => entry.productId === null)).toBe(true);
    expect(catalog.newArrivals.every((entry) => entry.productId === null)).toBe(true);
    expect(catalog.newArrivals[0]?.title).toBe('iPad Pro');
    expect(catalog.offers.every((entry) => !entry.active)).toBe(true);
  });
});

describe('source safety and support', () => {
  it.each([
    { image: 'http://legacy.example/a' }, { authorization: 'private' },
    { text: 'Bearer abcdef' }, { text: 'eyJhbGciOiJIUzI1NiJ9.e30.signature' },
    { text: 'https://unapproved.example/a' },
  ])('rejects unreviewed URLs or secret material without echoing it', (value) => {
    expect(() => assertSafeFixture(value)).toThrow(/fixture/);
  });
  it('renders original support using only attribute-free structural tags', () => {
    const html = loadSupport();
    expect(html).toContain('CLU Store 演示支持');
    expect(html.replace(/<\/?(?:section|h1|p)>/g, '')).not.toMatch(/[<>]/);
    expect(html).not.toMatch(/2025|https?:|onclick|script/i);
    expect(renderSupport({ title: '<img onerror="attack">', paragraphs: ['<script>bad</script>'] }))
      .toContain('&lt;script&gt;bad&lt;/script&gt;');
  });
});

it('refuses test, remote, superuser and production seed targets', () => {
  const dev = 'postgresql://clu_dev@localhost:5433/clu_store_dev';
  expect(seedDatabaseUrl({ DATABASE_URL: dev })).toBe(dev);
  for (const url of [dev.replace('clu_store_dev', 'clu_store_test'), dev.replace('localhost', 'remote.example'), dev.replace('clu_dev@', 'clu_bootstrap@')]) {
    expect(() => seedDatabaseUrl({ DATABASE_URL: url })).toThrow();
  }
  expect(() => seedDatabaseUrl({ DATABASE_URL: dev, NODE_ENV: 'production' })).toThrow();
});

it('keeps all ten summary-only products unavailable without active invented options', () => {
  const ids = [8, 16, 19, 25, 28, 34, 36, 39, 45, 48];
  for (const id of ids) {
    const product = catalog.products.find((entry) => entry.id === id)!;
    expect(product.inStock).toBe(false);
    expect([...product.models, ...product.memorySizes, ...product.colors].some((option) => option.inStock)).toBe(false);
  }
  const invalid = copy();
  invalid.products.find((entry) => entry.id === 16)!.inStock = true;
  expect(() => parseCatalog(invalid)).toThrow('incomplete');
});
it('preserves source model/memory IDs and disables replaced frontend options', () => {
  const phone = catalog.products.find((entry) => entry.id === 2)!;
  expect(phone.models.filter((entry) => entry.inStock).map((entry) => entry.id)).toEqual([10003, 10004]);
  expect(phone.memorySizes.filter((entry) => entry.inStock).map((entry) => entry.id)).toEqual([20005, 20006, 20007]);
  expect(phone.models.find((entry) => entry.id === 1000201)?.inStock).toBe(false);
});
it('only reconciles untouched previous products and refuses unreviewed remaps', () => {
  const previous = loadPreviousCatalog().products.find((entry) => entry.id === 1001)!;
  const { sourceKey: _sourceKey, ...data } = previous;
  void _sourceKey;
  const record = { ...data,
    models: data.models.map((option) => ({ ...option, productId: data.id })),
    memorySizes: data.memorySizes.map((option) => ({ ...option, productId: data.id })),
    colors: data.colors.map((option) => ({ ...option, productId: data.id })),
  };
  expect(previousProductMatches(record, previous)).toBe(true);
  expect(previousProductMatches({ ...record, title: 'user edit' }, previous)).toBe(false);
  const invalid = copy();
  invalid.productIdRemaps = [{ from: 1001, to: 15 }];
  expect(() => parseCatalog(invalid)).toThrow('Unreviewed');
});

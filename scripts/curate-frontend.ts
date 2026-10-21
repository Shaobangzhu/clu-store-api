import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { z } from 'zod';
import { Prisma } from '../src/generated/prisma/client.js';
import { assertSafeFixture, parseCatalog } from '../prisma/seed-data.js';

type Literal = string | number | boolean | null | Literal[] | { [key: string]: Literal };
type Scope = Record<string, Literal>;
if (existsSync('prisma/fixtures/sample-evidence.json')) throw new Error('Response samples are reconciled; refusing to replace them with the frontend fallback');
const root = process.argv[2];
if (!root) throw new Error('Provide the local clu-store-client path; no network inputs are accepted');
const paths = ['src/assets/data/products.js', 'src/assets/data/index.js'];
const scope: Scope = Object.create(null) as Scope;
function evaluate(node: ts.Expression): Literal {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isIdentifier(node) && Object.hasOwn(scope, node.text)) return scope[node.text] ?? null;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map((entry) => {
    if (ts.isSpreadElement(entry)) throw new Error('Spreads are not supported in source evidence');
    return evaluate(entry);
  });
  if (ts.isObjectLiteralExpression(node)) {
    const result: { [key: string]: Literal } = Object.create(null) as { [key: string]: Literal };
    for (const property of node.properties) {
      if (ts.isShorthandPropertyAssignment(property)) result[property.name.text] = evaluate(property.name);
      else if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) {
        result[property.name.text] = evaluate(property.initializer);
      } else throw new Error('Unsupported source object expression');
    }
    return result;
  }
  if (ts.isPropertyAccessExpression(node)) {
    const owner = evaluate(node.expression);
    if (owner && typeof owner === 'object' && !Array.isArray(owner) && Object.hasOwn(owner, node.name.text)) {
      return owner[node.name.text] ?? null;
    }
  }
  throw new Error('Unsupported source expression; source files are never executed');
}
const sources = paths.map((path) => {
  const bytes = readFileSync(resolve(root, path));
  const contents = bytes.toString('utf8');
  assertSafeFixture(contents, path); // Stop before writing tracked evidence if suspicious strings occur.
  const file = ts.createSourceFile(path, contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (statement.importClause?.name && ts.isStringLiteral(statement.moduleSpecifier)) {
        scope[statement.importClause.name.text] = `frontend-media:${statement.moduleSpecifier.text}`;
      }
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) throw new Error('Unsupported source declaration');
        scope[declaration.name.text] = evaluate(declaration.initializer);
      }
    } else if (statement.kind !== ts.SyntaxKind.EmptyStatement) throw new Error('Only static source declarations are accepted');
  }
  const archive = resolve('local-input/frontend', path);
  mkdirSync(dirname(archive), { recursive: true });
  if (existsSync(archive)) {
    if (!readFileSync(archive).equals(bytes)) throw new Error('Local source evidence already exists with different content');
  } else writeFileSync(archive, bytes, { flag: 'wx', mode: 0o600 });
  return { path, sha256: createHash('sha256').update(bytes).digest('hex') };
});
const string = z.string().min(1);
const price = z.number().finite().nonnegative();
const rawProduct = z.object({ id: z.number().int().positive(), name: string, title: string,
  image: string, carouselImages: z.array(string), startingPrice: price, installments: price,
  models: z.array(z.object({ id: z.number().int().positive(), name: string,
    spec: string.optional(), specification: string.optional(), price,
  }).strict()).min(1), colors: z.array(string).min(1),
  memorySizes: z.array(z.object({ id: z.number().int().positive().optional(), name: string, price }).strict()).min(1),
  features: z.array(string), inStock: z.boolean(), category: string,
  productCategoryId: z.number().int().positive().optional(),
}).strict();
const productKeys = ['IPHONE_16_PRO', 'IPHONE_16', 'IPHONE_15', 'IPHONE_14', 'IPHONE_SE',
  'MacBook_Air', 'MacBook_Pro_16', 'iMac', 'iPad_Pro', 'iPad_Air', 'iPad', 'ipad_mini'];
const rawProducts = productKeys.map((key) => ({ sourceKey: key, data: rawProduct.parse(scope[key]) }));
const rawOffer = z.object({ type: string, title: string, detail: string, image: string, soldOut: z.boolean() }).strict();
const rawArrival = z.object({ title: string, detail: string, image: string, textColor: z.enum(['black', 'white']), soldOut: z.boolean() }).strict();
const rawOffers = z.array(rawOffer).parse(scope.OFFER_LIST);
const rawArrivals = z.array(rawArrival).parse(scope.NEW_ARRIVALS_LIST);
const source = { repository: 'Shaobangzhu/clu-store-client',
  commit: z.string().regex(/^[a-f0-9]{40}$/).parse(process.argv[3]), files: sources };
const evidence = { source, products: rawProducts, offers: rawOffers, newArrivals: rawArrivals };
assertSafeFixture(evidence);
const placeholder = '/media/demo-placeholder.svg';
const categories = [
  { id: 1, title: '手机', slug: 'phones' }, { id: 2, title: '电脑', slug: 'computers' },
  { id: 3, title: '平板', slug: 'tablets' },
].map((entry) => ({ ...entry, subTitle: '本地前端演示分类', videos: [], editorialFeatures: [] }));
const remapped: Record<string, number> = { MacBook_Pro_16: 1001, iMac: 1002 };
const catalog = parseCatalog({ version: 1, sourceKind: 'local-frontend-demo', source, categories,
  products: rawProducts.map(({ sourceKey, data }) => {
    const id = remapped[sourceKey] ?? data.id;
    const category = categories.find((entry) => entry.title === data.category);
    if (!category) throw new Error('Unmapped demo category');
    const models = data.models.map((model, index) => ({ id: 1000000 + id * 100 + index + 1,
      name: `${data.name} — ${model.name}（演示）`,
      specification: `${model.specification ?? model.spec ?? ''}（本地前端演示配置，未经厂商核实）`,
      price: new Prisma.Decimal(model.price.toString()).toFixed(2), inStock: data.inStock,
    }));
    const memorySizes = data.memorySizes.map((memory, index) => ({ id: 2000000 + id * 100 + index + 1,
      name: memory.name, extraPrice: new Prisma.Decimal(memory.price.toString()).toFixed(2), inStock: data.inStock,
    }));
    const base = Prisma.Decimal.min(...models.map((model) => new Prisma.Decimal(model.price)));
    const extra = Prisma.Decimal.min(...memorySizes.map((memory) => new Prisma.Decimal(memory.extraPrice)));
    return { id, sourceKey, name: data.name, title: `演示配置 · ${data.title}`, categoryId: category.id,
      imageSrc: placeholder, carouselImages: data.carouselImages.map(() => placeholder),
      startingPrice: base.plus(extra).toFixed(2), installments: null,
      features: ['本地前端演示配置，非真实商品规格或销售承诺。', ...data.features.filter((feature) => feature !== '-')],
      inStock: data.inStock, models, memorySizes,
      colors: data.colors.map((name, index) => ({ id: 3000000 + id * 100 + index + 1, name, inStock: data.inStock })),
    };
  }),
  offers: rawOffers.map((offer, index) => ({ id: 11001 + index, productId: null, type: `历史演示 · ${offer.type}`,
    title: offer.title, detail: offer.detail, imageSrc: placeholder,
    active: false, startsAt: null, endsAt: null, soldOut: offer.soldOut,
  })),
  newArrivals: rawArrivals.map((arrival, index) => ({ id: 12001 + index,
    productId: index === 0 ? 1001 : null, displayOrder: index,
    title: arrival.title, detail: arrival.detail, imageSrc: placeholder, textColor: arrival.textColor, soldOut: arrival.soldOut,
  })),
});
mkdirSync('prisma/fixtures', { recursive: true });
writeFileSync('prisma/fixtures/frontend-evidence.json', JSON.stringify(evidence, null, 2) + '\n');
writeFileSync('prisma/fixtures/catalog.json', JSON.stringify(catalog, null, 2) + '\n');
console.log(`Curated ${catalog.products.length} explicit frontend demo products; server response samples remain missing.`);

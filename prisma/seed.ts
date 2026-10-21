import { createDatabase } from '../src/lib/database.js';
import { loadCatalog, loadSupport, catalogHash } from './seed-data.js';
import { seedDatabaseUrl } from './seed-target.js';
import { seedCatalog } from './seed-catalog.js';

async function main() {
  const catalog = loadCatalog();
  const html = loadSupport();
  const database = createDatabase(seedDatabaseUrl(process.env), 5000);
  try {
    await seedCatalog(database.client, catalog, html);
    console.log(JSON.stringify({ seeded: true, source: catalog.sourceKind,
      products: catalog.products.length, fixtureHash: catalogHash(catalog) }));
  } finally { await database.disconnect(); }
}
void main().catch(() => {
  // Database error objects can include connection details or raw fixture fields.
  console.error('Seed failed; no catalog transaction committed. Check the local database target, fixture validation, migration status and ID/content collisions. No reset was attempted.');
  process.exitCode = 1;
});

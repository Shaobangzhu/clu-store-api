import { readCatalog, type CatalogDatabase } from '../../lib/catalog-database.js';

export function createInformationRepository(database: CatalogDatabase | undefined) {
  return { support: () => readCatalog(database, (client) => client.supportInformation.findUnique({
    where: { key_locale: { key: 'support', locale: 'zh-CN' } },
  })) };
}

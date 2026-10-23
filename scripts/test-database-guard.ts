import type { Client } from 'pg';

export function testDatabaseUrl(environment: NodeJS.ProcessEnv): string {
  if (environment.NODE_ENV === 'production') throw new Error('Refusing test database access in production mode');
  const test = environment.TEST_DATABASE_URL;
  const dev = environment.DATABASE_URL;
  if (!test || !dev) throw new Error('Both DATABASE_URL and TEST_DATABASE_URL are required');
  let testUrl: URL;
  let devUrl: URL;
  try {
    testUrl = new URL(test);
    devUrl = new URL(dev);
  } catch {
    throw new Error('Invalid database URL configuration');
  }
  const localHosts = ['localhost', '127.0.0.1', '[::1]', 'postgres'];
  const testName = decodeURIComponent(testUrl.pathname.slice(1));
  const devName = decodeURIComponent(devUrl.pathname.slice(1));
  if (!['postgres:', 'postgresql:'].includes(testUrl.protocol)
    || !localHosts.includes(testUrl.hostname)
    || testName !== 'clu_store_test'
    || testName === devName
    || decodeURIComponent(testUrl.username) !== 'clu_test'
    || testUrl.search || testUrl.hash) {
    throw new Error('Refusing test database access: require local clu_store_test, clu_test role, no URL options, and a different development database');
  }
  return test;
}

export async function assertTestConnection(client: Client): Promise<void> {
  const result = await client.query<{ database: string; role: string; rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean; rolreplication: boolean; rolbypassrls: boolean }>(`
    SELECT current_database() AS database, current_user AS role, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
    FROM pg_roles WHERE rolname = current_user
  `);
  const row = result.rows[0];
  if (!row || row.database !== 'clu_store_test' || row.role !== 'clu_test'
    || row.rolsuper || row.rolcreatedb || row.rolcreaterole || row.rolreplication || row.rolbypassrls) {
    throw new Error('Refusing test database access: actual database/role is unsafe');
  }
}

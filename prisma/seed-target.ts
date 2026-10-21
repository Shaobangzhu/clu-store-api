export function seedDatabaseUrl(environment: NodeJS.ProcessEnv): string {
  if (environment.NODE_ENV === 'production') throw new Error('Demo seed refuses production mode');
  const value = environment.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is required');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Invalid seed database URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !['localhost', '127.0.0.1', '[::1]', 'postgres'].includes(url.hostname)
    || decodeURIComponent(url.pathname) !== '/clu_store_dev'
    || decodeURIComponent(url.username) !== 'clu_dev'
    || url.search || url.hash) {
    throw new Error('Demo seed requires local clu_store_dev with the clu_dev role and no URL options');
  }
  return value;
}

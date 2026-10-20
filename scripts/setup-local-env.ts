import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

// Exclusive creation protects an existing developer .env. Never print credentials.
const devPassword = randomBytes(32).toString('hex');
const testPassword = randomBytes(32).toString('hex');
const values: Record<string, string> = {
  POSTGRES_PASSWORD: randomBytes(32).toString('hex'),
  CLU_DEV_PASSWORD: devPassword,
  CLU_TEST_PASSWORD: testPassword,
  DATABASE_URL: `postgresql://clu_dev:${devPassword}@localhost:5433/clu_store_dev`,
  TEST_DATABASE_URL: `postgresql://clu_test:${testPassword}@localhost:5433/clu_store_test`,
};
const template = readFileSync('.env.example', 'utf8');
const content = template.split('\n').map((line) => {
  const key = line.split('=')[0] ?? '';
  return key in values ? `${key}=${values[key]}` : line;
}).join('\n');
try {
  writeFileSync('.env', content, { flag: 'wx', mode: 0o600 });
  console.log('Created private .env for the isolated local database project.');
} catch (error) {
  if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
    throw new Error('.env already exists; merge database settings manually without replacing it.', { cause: error });
  }
  throw error;
}

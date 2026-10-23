import { defineConfig } from 'vitest/config';

export default defineConfig({ test: {
  name: 'postgres', allowOnly: false, globalSetup: ['tests/helpers/database-setup.ts'],
  include: ['tests/integration/**/*.test.ts'], fileParallelism: false,
  testTimeout: 30000, hookTimeout: 30000,
} });

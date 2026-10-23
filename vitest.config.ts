import { defineConfig } from 'vitest/config';

// The default quality gate includes PostgreSQL; missing infrastructure is a failure.
export default defineConfig({ test: {
  projects: ['vitest.unit.config.ts', 'vitest.integration.config.ts'],
  fileParallelism: false,
} });

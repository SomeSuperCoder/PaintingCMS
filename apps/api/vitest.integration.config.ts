import { defineConfig } from 'vitest/config';

/**
 * apps/api INTEGRATION test config (task 8.2 integration portion).
 * =====================================================================
 * HTTP-level supertest suite against a REAL Postgres 16 test database
 * (paintingcms_test_te1b). Files run SEQUENTIALLY (fileParallelism: false,
 * forks pool) because the ownership model is a global singleton — one owner at
 * a time — so spec files must never share the DB concurrently; each file
 * boots its own app and truncates between tests. The default `vitest run`
 * (vitest.config.ts) stays the pure-unit config; this one is invoked
 * explicitly: vitest run --config vitest.integration.config.ts.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test-integration/**/*.spec.ts'],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['test-integration/setup-env.ts'],
    fileParallelism: false,
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});

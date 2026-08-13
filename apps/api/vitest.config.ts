import { defineConfig } from 'vitest/config';

/**
 * apps/api unit test config (tasks 8.1-8.2, unit portion).
 * =====================================================================
 * PURE unit tests only: no DB, no network, no E2E (separate microtask).
 * Specs are co-located next to their subject (src · spec files under
 * src/** so `pnpm typecheck` — tsc --noEmit over tsconfig.json, which
 * includes src/** — also typechecks the tests). tsconfig.build.json
 * excludes `**` + `*spec.ts` so nest build never ships them.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: ['node_modules', 'dist'],
  },
});

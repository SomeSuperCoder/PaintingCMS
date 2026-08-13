/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import babel from '@rolldown/plugin-babel';
import { defineConfig } from 'vite';

/**
 * `import.meta.dirname` is Node 20.11+ ESM-only. @types/node is intentionally
 * NOT a dependency of this app (pnpm strict node_modules), so we declare the
 * member here. package.json has `"type": "module"`, so Vite bundles this config
 * as ESM and the member exists at runtime.
 */
declare global {
  interface ImportMeta {
    /** Absolute path of the directory containing the current module (Node ESM). */
    dirname: string;
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // React fast-refresh (Vite 6+ dropped Babel; React Compiler is enabled via
    // the separate @rolldown/plugin-babel pass — design D8).
    react(),
    babel({
      plugins: [['babel-plugin-react-compiler', {}]],
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': import.meta.dirname + '/src',
    },
  },
  server: {
    proxy: {
      // Dev: /api/v1 requests → NestJS on :3000 (design D9, Justfile dev).
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});

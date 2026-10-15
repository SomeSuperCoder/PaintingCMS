/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import babel from '@rolldown/plugin-babel';
import { defineConfig, loadEnv } from 'vite';
import { join } from 'node:path';

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

/**
 * PUBLIC_URL is the SSOT for "where does this app live" (.env.example), so the
 * dev server reuses it instead of adding a second host config to keep in sync.
 * envDir must be the REPO ROOT — Vite defaults it to `root` (apps/web), but the
 * .env lives two levels up. The '' prefix is required: PUBLIC_URL carries no
 * VITE_ prefix and loadEnv defaults to 'VITE_' (which would return nothing).
 */
const REPO_ROOT = join(import.meta.dirname, '../..');
const { PUBLIC_URL = '' } = loadEnv(process.env.NODE_ENV || 'development', REPO_ROOT, '');

/** Hostname the dev server should accept/bind — '' when PUBLIC_URL is unset. */
const devHost = PUBLIC_URL ? new URL(PUBLIC_URL).hostname : '';

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
    // Loopback by default (Vite's default); public only when PUBLIC_URL names a
    // real host, so a local .env keeps the dev server private.
    host: devHost ? true : 'localhost',
    // Vite 8 rejects unknown Host headers (CVE-2025-31125/31486 hardening):
    // once bound publicly, a request with Host: <PUBLIC_URL host> would be
    // refused without this. Set dedupes when PUBLIC_URL is http://localhost.
    allowedHosts: [...new Set([devHost, 'localhost', '127.0.0.1'].filter(Boolean))],
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

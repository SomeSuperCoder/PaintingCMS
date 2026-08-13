// ESLint 9 flat config — React 19 + Vite 8 + TypeScript strict (JSX-aware).
// Core recommended + typescript-eslint v8 recommended + react (JSX rules),
// react-hooks (rules-of-hooks/exhaustive-deps), react-refresh (Vite HMR).
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import react from 'eslint-plugin-react';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  reactHooks.configs['recommended-latest'],
  reactRefresh.configs.vite,
  {
    plugins: {
      // Registered so source `eslint-disable jsx-a11y/*` directives resolve;
      // recommended config deliberately NOT enabled (a11y audit is a separate
      // review-wave decision).
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // Explicit `any` is a defect in a strict codebase — hard error.
      '@typescript-eslint/no-explicit-any': 'error',
      // TS strict already rejects unused locals/params; keep ESLint in sync.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // TypeScript replaces prop-types entirely.
      'react/prop-types': 'off',
      // shadcn/ui components export `variants` (cva factories) alongside the
      // component — the standard pattern. Warn, don't fail, on HMR-splitting.
      'react-refresh/only-export-components': 'warn',
    },
  },
);

// ESLint 9 flat config — NestJS 11 + TypeScript strict.
// typescript-eslint v8 `recommended` composes ESLint core recommended with
// TS-safe overrides; Nest-idiomatic rules are stated explicitly below.
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'drizzle/**', 'coverage/**'],
  },
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // Explicit `any` is a defect in a strict codebase — hard error.
      '@typescript-eslint/no-explicit-any': 'error',
      // TS strict already rejects unused locals/params; keep ESLint in sync.
      // Leading-underscore args (`_req`, `_next`) are idiomatic Nest middleware.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // NestJS decorator/DI style: members don't require explicit access
      // modifiers or return types on every boundary (defaults off; stated
      // explicitly so the intent survives config churn).
      '@typescript-eslint/explicit-member-accessibility': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/interface-name-prefix': 'off',
    },
  },
);

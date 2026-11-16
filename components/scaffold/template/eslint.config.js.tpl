import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { engineLint } from './kit/lint-preset/index.js';

// src/engine stays pure; src/ui and scripts reach it only through src/engine/api.ts.
export default defineConfig(
  globalIgnores(['dist', 'coverage', 'node_modules', 'docs/**', 'kit/**', 'public/**', '.claude/**', '.github/**']),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2023, globals: { ...globals.node }, parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  { files: ['**/*.{js,mjs}'], extends: [tseslint.configs.disableTypeChecked], languageOptions: { globals: { ...globals.node } } },
  { files: ['src/ui/**/*.{ts,tsx}', 'src/main.tsx'], languageOptions: { globals: { ...globals.browser } }, extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite()] },
  ...engineLint({ callers: ['src/ui', 'scripts'] }),
);

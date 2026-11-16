import { defineConfig } from 'vitest/config';

// `node` runs the shared tests; `ui` runs the components that draw (React) in jsdom.
const UI = ['components/**/*.test.tsx', 'components/bug-reporter/**/*.test.ts'];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          testTimeout: 60_000,
          include: ['tests/**/*.test.ts', 'components/**/*.test.ts', 'tools/**/*.test.mjs'],
          exclude: ['**/node_modules/**', ...UI],
        },
      },
      {
        test: {
          name: 'ui',
          environment: 'jsdom',
          pool: 'vmThreads',
          testTimeout: 30_000,
          include: UI,
          setupFiles: ['tests/setup-dom.ts'],
        },
      },
    ],
  },
});

import { defineConfig } from 'vitest/config';

// `node` runs the shared tests; `browser` the chromium ones (retry 2); `ui` runs the components that draw (React) in jsdom.
const BROWSER = ['components/**/*.e2e.test.ts'];
const UI = ['components/**/*.test.tsx', 'components/bug-reporter/**/*.test.ts'];

export default defineConfig({
  test: {
    reporters: ['default', './components/ci-templates/skip-reporter.ts'],
    maxWorkers: Number(process.env.HEAVY_WORKERS) || undefined,
    coverage: { enabled: !!process.env.CI, provider: 'v8', include: ['components/**/*.{ts,tsx}'], exclude: ['**/*.test.*', '**/node_modules/**'], reporter: ['text-summary', 'json-summary'] },
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          testTimeout: 60_000,
          include: ['tests/**/*.test.ts', 'components/**/*.test.ts', 'tools/**/*.test.mjs'],
          exclude: ['**/node_modules/**', ...UI, ...BROWSER],
        },
      },
      {
        // K238 (GAPS-3 tooling A11): the tests that launch chromium, listed apart; a flaky one gets two retries.
        test: { name: 'browser', environment: 'node', testTimeout: 60_000, retry: 2, include: BROWSER, exclude: ['**/node_modules/**'] },
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

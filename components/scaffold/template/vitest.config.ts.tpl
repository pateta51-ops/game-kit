import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', testTimeout: 60_000, include: ['tests/**/*.test.ts', 'scripts/**/*.test.ts', 'src/**/*.test.ts'] },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { ...(process.env.HEAVY_WORKERS ? { maxWorkers: Number(process.env.HEAVY_WORKERS) } : {}), environment: 'node', testTimeout: 60_000, include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'scripts/**/*.test.ts', 'src/**/*.test.ts'] },
});

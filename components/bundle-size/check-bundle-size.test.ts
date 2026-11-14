import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { initialFiles, measureBuild, run } from './check-bundle-size';

const dir = mkdtempSync(join(tmpdir(), 'size-'));
mkdirSync(join(dir, 'assets'));
writeFileSync(join(dir, 'index.html'), '<script type="module" src="/assets/app.js"></script><link rel="stylesheet" href="/assets/app.css">');
writeFileSync(join(dir, 'assets/app.js'), 'x'.repeat(2000));
writeFileSync(join(dir, 'assets/app.css'), 'a{}');
writeFileSync(join(dir, 'assets/lazy.js'), 'y'.repeat(500));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const io = { out: () => undefined, err: () => undefined };
const flags = (b: number, c: number, a: number) => ['--initial-budget', String(b), '--chunk-limit', String(c), '--asset-limit', String(a), '--dir', dir];

describe('bundle size', () => {
  it('finds what index.html loads at once', () => {
    expect(initialFiles('<script src="/a.js"></script><link rel="modulepreload" href="b.js"><script src="https://x/y.js"></script>')).toEqual(['a.js', 'b.js']);
  });

  it('passes within the limits and fails over them', () => {
    const limits = { initialBudget: 10_000, chunkLimit: 5000, assetLimit: 100 };
    const ok = measureBuild(dir, limits);
    expect(ok.pass).toBe(true);
    expect(ok.lazy.map((f) => f.path)).toEqual(['assets/lazy.js']);
    expect(measureBuild(dir, { ...limits, chunkLimit: 1000 }).oversized.map((f) => f.path)).toEqual(['assets/app.js']);
    expect(measureBuild(dir, { ...limits, initialBudget: 50 }).pass).toBe(false);
  });

  it('run takes its limits from flags and refuses to run without them', () => {
    expect(run(flags(10_000, 5000, 100), io)).toBe(0);
    expect(run(flags(10, 5000, 100), io)).toBe(1);
    expect(run(['--dir', dir], io)).toBe(2);
    expect(run(['--nope', '1'], io)).toBe(2);
  });

  it('run reads its limits from --config', () => {
    const cfg = join(dir, 'limits.json');
    writeFileSync(cfg, JSON.stringify({ initialBudget: 10_000, chunkLimit: 5000, assetLimit: 100 }));
    expect(run(['--config', cfg, '--dir', dir], io)).toBe(0);
    writeFileSync(cfg, JSON.stringify({ initialBudget: 10, chunkLimit: 5000, assetLimit: 100 }));
    expect(run(['--config', cfg, '--dir', dir], io)).toBe(1);
  });
});

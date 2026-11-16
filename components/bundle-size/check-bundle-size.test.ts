import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { cssUrls, initialFiles, measureBuild, run, staticImports } from './check-bundle-size';

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

  it('reads double-quoted, single-quoted and unquoted attributes', () => {
    expect(initialFiles("<script src='/a.js'></script><script src=/b.js></script><link rel='stylesheet' href = \"c.css\"><link rel=modulepreload href=d.js><link rel='author' href='e.js'>")).toEqual(['a.js', 'b.js', 'c.css', 'd.js']);
  });

  it('a gzip level that is not a whole number from 0 to 9 is refused', () => {
    const lines: string[] = [];
    for (const bad of ['10', '1.5', '-1']) expect(run(['--gzip-level', bad, '--initial-budget', '10000', '--dir', dir], { out: () => undefined, err: (l) => lines.push(l) })).toBe(2);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/gzipLevel must be a whole number from 0 to 9, not 10/);
    expect(() => measureBuild(dir, { gzipLevel: 1.5 })).toThrow(/gzipLevel/);
    expect(measureBuild(dir, { gzipLevel: 0, initialBudget: 10_000 }).pass).toBe(true);
  });

  it('limits can be left out: one left out is not checked, and run needs at least one', () => {
    expect(measureBuild(dir, { initialBudget: 10_000 }).pass).toBe(true);
    expect(measureBuild(dir, { chunkLimit: 1000 }).pass).toBe(false);
    expect(measureBuild(dir, {}).pass).toBe(true);
    const lines: string[] = [];
    expect(run(['--initial-budget', '10000', '--dir', dir], { out: (l) => lines.push(l), err: () => undefined })).toBe(0);
    expect(lines.join('\n')).not.toMatch(/script chunk|audio file/);
    expect(run(['--chunk-limit', '1000', '--dir', dir], io)).toBe(1);
    expect(run(['--initial-budget', 'x', '--dir', dir], io)).toBe(2);
  });

  it('a budget the game exports is the default of run, and a flag overrides it', () => {
    const BUDGET = { initialBudget: 10_000, chunkLimit: 5000 };
    expect(run(['--dir', dir], io, BUDGET)).toBe(0);
    expect(run(['--dir', dir], io, { ...BUDGET, chunkLimit: 1000 })).toBe(1);
    expect(run(['--dir', dir, '--initial-budget', '10'], io, BUDGET)).toBe(1);
  });

  describe('options', () => {
    const b = mkdtempSync(join(tmpdir(), 'size-opt-'));
    mkdirSync(join(b, 'assets'));
    writeFileSync(
      join(b, 'index.html'),
      '<link rel="icon" href="/game/icon.png"><script type="module" src="/game/assets/app.js"></script><link rel="stylesheet" href="/game/assets/app.css">',
    );
    writeFileSync(join(b, 'icon.png'), 'i');
    writeFileSync(join(b, 'assets/app.js'), 'import{a}from"./dep.js";import"react";export*from"./gone.js";x.import("./lazy.js");import("./lazy.js")');
    writeFileSync(join(b, 'assets/dep.js'), 'import"./app.js";export const a=1');
    writeFileSync(join(b, 'assets/lazy.js'), 'y');
    writeFileSync(join(b, 'assets/app.css'), '@font-face{src:url("./f.woff2?v=1")}a{background:url(data:image/png;base64,AA) url(#g) url(https://x/y.png)}');
    writeFileSync(join(b, 'assets/f.woff2'), 'f'.repeat(300));
    afterAll(() => rmSync(b, { recursive: true, force: true }));
    const paths = (l: Parameters<typeof measureBuild>[1]): string[] => measureBuild(b, l).initial.map((f) => f.path);

    it('base: a base path in the addresses is taken off, named or found', () => {
      expect(() => measureBuild(b, {})).toThrow(/does not have/);
      expect(paths({ base: '/game/' })).toEqual(['index.html', 'assets/app.js', 'assets/app.css']);
      expect(paths({ base: 'auto' })).toEqual(['index.html', 'assets/app.js', 'assets/app.css']);
      expect(() => measureBuild(b, { base: '/other/' })).toThrow(/does not have/);
      expect(run(['--dir', b, '--base', 'auto', '--initial-budget', '10000'], io)).toBe(0);
    });

    it('follow: static imports, stylesheet url(...) and icons count as the first download', () => {
      expect(staticImports('import{a}from"./a.js";import"./b.mjs";export*from\'./c.js\';x.import("./d.js");import("./e.js")')).toEqual(['./a.js', './b.mjs', './c.js']);
      expect(cssUrls('a{src:url(a.png) url( "b.woff2" )}')).toEqual(['a.png', 'b.woff2']);
      expect(paths({ base: 'auto', follow: true })).toEqual(['index.html', 'assets/app.js', 'icon.png', 'assets/app.css', 'assets/dep.js', 'assets/f.woff2']);
      const r = measureBuild(b, { base: 'auto', follow: true, assetLimit: 100 });
      expect(r.lazy.map((f) => f.path)).toEqual(['assets/lazy.js']);
      expect(r.media).toEqual([]);
      expect(measureBuild(b, { base: 'auto', assetLimit: 100 }).media.map((f) => f.path)).toEqual(['assets/f.woff2']);
      expect(run(['--dir', b, '--base', 'auto', '--follow', 'true', '--initial-budget', '10000'], io)).toBe(0);
      writeFileSync(join(b, 'assets/app.css'), `a{fill:url(%23n);background:url("data:image/svg+xml,%3Csvg fill='url(%23g)'/%3E")}`);
      expect(run(['--dir', b, '--base', 'auto', '--follow', 'true', '--initial-budget', '10000'], io)).toBe(0);
      writeFileSync(join(b, 'assets/app.css'), 'a{src:url(nope.png)}');
      expect(() => measureBuild(b, { base: 'auto', follow: true })).toThrow(/assets\/app.css loads assets\/nope.png/);
    });

    it('gzipLevel: the level the files are gzipped at', () => {
      writeFileSync(join(b, 'assets/dep.js'), Array.from({ length: 4000 }, (_, i) => String(i * 7919)).join(' '));
      const at = (gzipLevel: number): number => measureBuild(b, { base: 'auto', gzipLevel }).lazy.find((f) => f.path === 'assets/dep.js')?.gzip ?? 0;
      expect(at(9)).toBeLessThan(at(1));
      expect(run(['--dir', b, '--base', 'auto', '--gzip-level', '9', '--initial-budget', '10000'], io)).toBe(0);
    });
  });
});

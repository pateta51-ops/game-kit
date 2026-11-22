import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { run as check } from '../tooling-scripts/art-check.ts';
import { run as cache } from './art-ci-cache.ts';
import { run as extract } from './art-extract.ts';
import { fetchAll, run as fetchArt, type FetchDeps } from './art-fetch.ts';
import { buildArtIndex, run as index } from './art-index.ts';
import { run as publish } from './art-publish.ts';
import { pdfjsRender, run as renderPdf } from './art-render-pdf.ts';
import { cellBox, decodePng, encodePng, imageSize } from './lib.ts';

const solid = (w: number, h: number, rgba: number[]): Buffer => encodePng({ width: w, height: h, data: Buffer.from(Array.from({ length: w * h }, () => rgba).flat()) });
const io = () => {
  const lines: string[] = [];
  return { lines, out: (l: string) => lines.push(l), err: (l: string) => lines.push(l) };
};

let dir: string;
const w = (f: string, v: unknown): string => {
  const p = join(dir, f);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, typeof v === 'string' || v instanceof Uint8Array ? v : JSON.stringify(v));
  return p;
};
interface R { file?: string; sha256?: string; miss?: number; missing?: string[] }
const rd = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Record<string, R> & R;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'art-pipeline-'));
  w('local/a.png', solid(4, 4, [255, 0, 0, 255]));
  w('local/b.png', solid(8, 8, [0, 0, 255, 255]));
  // a 4x2 sheet: left half green, right half yellow
  const sheet = Buffer.alloc(4 * 2 * 4);
  for (let i = 0; i < 8; i += 1) sheet.set(i % 4 < 2 ? [0, 255, 0, 255] : [255, 255, 0, 255], i * 4);
  w('local/sheet.png', encodePng({ width: 4, height: 2, data: sheet }));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('art-pipeline on a fake game', () => {
  it('fetches from local folders and a file: URL into a cache with sha256, remembers misses', async () => {
    w('fetch.json', { cache: 'art', from: 'local', items: [{ id: 'c:1', source: 'web', url: 'a.png' }, { id: 'c:2', source: 'web', url: `file:///${join(dir, 'local/b.png').replace(/\\/g, '/')}` }, { id: 'c:9', source: 'web', url: 'none.png' }] });
    const o = io();
    expect(await fetchArt(['--config', join(dir, 'fetch.json')], o)).toBe(1);
    const recs = rd('art/web.json');
    expect(recs['c:1']?.file).toBe('web/c_1.png');
    expect(recs['c:1']?.sha256).toHaveLength(64);
    expect(recs['c:9']?.miss).toBe(404);
    expect(existsSync(join(dir, 'art/web/c_2.png'))).toBe(true);
  });

  it('fetch retries with backoff, times out per request, records a failed item and goes on, saves after each item', async () => {
    const calls: Record<string, number> = {};
    const png = solid(2, 2, [5, 5, 5, 255]);
    const deps: FetchDeps = {
      fetch: (url, init) => {
        calls[url] = (calls[url] ?? 0) + 1;
        expect(init.signal).toBeDefined();
        if (url.endsWith('/bad')) return Promise.reject(new Error('timed out'));
        if (url.endsWith('/flaky') && calls[url] === 1) return Promise.resolve({ ok: false, status: 503, headers: { get: () => null }, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
        return Promise.resolve({ ok: true, status: 200, headers: { get: () => 'image/png' }, arrayBuffer: () => Promise.resolve(png.buffer.slice(png.byteOffset, png.byteOffset + png.length) as ArrayBuffer) });
      },
      sleep: () => Promise.resolve(),
    };
    const cacheDir = join(dir, 'rcache');
    mkdirSync(cacheDir, { recursive: true });
    const items = ['bad', 'flaky', 'good'].map((n) => ({ id: n, source: 'net', url: `http://h/${n}` }));
    let saves = 0;
    const r = await fetchAll(cacheDir, dir, items, { userAgent: 'x', gapMs: 0, refresh: false, timeoutMs: 50, retries: 3, backoffMs: 1 }, deps, () => { saves += 1; });
    expect(calls['http://h/bad']).toBe(3);
    expect(calls['http://h/flaky']).toBe(2);
    expect(r.failed).toEqual([{ id: 'bad', error: 'timed out' }]);
    expect([r.fetched, saves, Object.keys(r.records['net'] ?? {})]).toEqual([2, 2, ['flaky', 'good']]);
  });

  it('fetch hashes a cached file again and fetches it anew when it is partial; the records file is written whole', async () => {
    w('fetch2.json', { cache: 'art2', from: 'local', items: [{ id: 'k', source: 'web', url: 'a.png' }] });
    const cfg = join(dir, 'fetch2.json');
    expect(await fetchArt(['--config', cfg], io())).toBe(0);
    const f = join(dir, 'art2/web/k.png');
    const good = readFileSync(f);
    writeFileSync(f, good.subarray(0, 10));
    const o = io();
    expect(await fetchArt(['--config', cfg], o)).toBe(0);
    expect(o.lines[0]).toContain('1 fetched');
    expect(readFileSync(f).equals(good)).toBe(true);
    expect(existsSync(join(dir, 'art2/web.json.tmp'))).toBe(false);
    const again = io();
    await fetchArt(['--config', cfg], again);
    expect(again.lines[0]).toContain('0 fetched');
  });

  it('reads the size of lossy, lossless and extended webp', () => {
    const riff = (kind: string, fill: (b: Buffer) => void): Buffer => {
      const b = Buffer.alloc(40);
      b.write('RIFF', 0, 'latin1');
      b.write('WEBP', 8, 'latin1');
      b.write(kind, 12, 'latin1');
      fill(b);
      return b;
    };
    expect(imageSize(riff('VP8 ', (b) => { b.writeUInt16LE(750, 26); b.writeUInt16LE(1050, 28); }))).toEqual([750, 1050]);
    expect(imageSize(riff('VP8L', (b) => { b[20] = 0x2f; b.writeUInt32LE(374 | (524 << 14), 21); }))).toEqual([375, 525]);
    expect(imageSize(riff('VP8X', (b) => { b.writeUIntLE(799, 24, 3); b.writeUIntLE(1199, 27, 3); }))).toEqual([800, 1200]);
  });

  it('extract cuts a sheet cell to a PNG and rejects a cell that does not fit', async () => {
    w('extract.json', { root: 'art', from: 'local', source: 'cells', items: [{ id: 'c:3', from: 'sheet.png', rect: [1, 2, 1] }, { id: 'c:4', from: 'sheet.png', rect: [5, 2, 1] }] });
    const o = io();
    expect(await extract(['--config', join(dir, 'extract.json')], o)).toBe(1);
    const r = decodePng(readFileSync(join(dir, 'art/cells/c_3.png')));
    expect([r.width, r.height, [...r.data.subarray(0, 4)]]).toEqual([2, 2, [255, 255, 0, 255]]);
    expect(cellBox(4, 2, [1, 2, 1])).toEqual({ x: 2, y: 0, w: 2, h: 2 });
    expect(rd('art/cells.json')['c:4']).toBeUndefined();
  });

  it('renders PDF faces through the renderer it is given and records the page', async () => {
    w('pdf.json', { root: 'art', source: 'pdf', faces: [{ id: 'c:5', pdf: 'x.pdf', page: 2 }] });
    const o = io();
    const seen: number[] = [];
    expect(await renderPdf(['--config', join(dir, 'pdf.json')], o, (_p, page) => { seen.push(page); return Promise.resolve(solid(3, 3, [9, 9, 9, 255])); })).toBe(0);
    expect(seen).toEqual([2]);
    expect(rd('art/pdf.json')['c:5']).toMatchObject({ file: 'pdf/c_5.png', page: 2 });
  });

  it.skipIf(!existsSync(join(process.cwd(), 'node_modules/pdfjs-dist')) || !existsSync(join(process.cwd(), 'node_modules/@napi-rs/canvas')))('renders a generated one-page PDF with pdf.js', async () => {
    const objs = ['<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R]/Count 1>>', '<</Type/Page/Parent 2 0 R/MediaBox[0 0 72 72]/Contents 4 0 R>>', '<</Length 33>>\nstream\n1 0 0 rg 0 0 72 72 re f\nendstream'];
    let pdf = '%PDF-1.4\n';
    const offs = objs.map((o, i) => { const at = pdf.length; pdf += `${String(i + 1)} 0 obj\n${o}\nendobj\n`; return at; });
    const xref = pdf.length;
    pdf += `xref\n0 5\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<</Size 5/Root 1 0 R>>\nstartxref\n${String(xref)}\n%%EOF`;
    const png = await pdfjsRender(join(process.cwd(), 'node_modules/pdfjs-dist'))(w('t.pdf', pdf), 1, { dpi: 72, format: 'png', quality: 90 });
    expect(imageSize(png)).toEqual([72, 72]);
  });

  it('indexes one image per card by order, override, never-list and degraded rule', () => {
    const rec = (file: string) => ({ file });
    const sizes: Record<string, [number, number]> = { 'a.png': [100, 100], 'b.png': [400, 400], 'c.png': [100, 100] };
    const order = [{ name: 'web', records: { x: rec('a.png'), y: rec('a.png'), z: rec('a.png') } }, { name: 'local', records: { x: rec('b.png'), q: rec('c.png'), z: rec('b.png') } }];
    const i = buildArtIndex(['x', 'y', 'q', 'z', 'm'], order, { degradedMaxSide: 200, overrides: { y: 'web' }, never: { web: ['z'] } }, (f) => sizes[f] ?? null);
    expect(i.sources['x']).toMatchObject({ source: 'local', degraded: { source: 'web' } });
    expect(i.defs).toMatchObject({ y: 'a.png', q: 'c.png', z: 'b.png' });
    expect(i.missing).toEqual(['m']);
    expect(i.counts).toMatchObject({ web: 1, local: 3, missing: 1 });
  });

  it('publishes to public with a manifest that art-check accepts, and art-check sees a changed source', async () => {
    w('index.json', { order: [], defs: {}, sources: {}, missing: [], counts: {} });
    w('idx.json', { root: 'art', ids: ['c:1', 'c:2', 'c:3', 'c:5', 'c:404'], order: [{ name: 'web', records: 'art/web.json' }, { name: 'cells', records: 'art/cells.json' }, { name: 'pdf', records: 'art/pdf.json' }], out: 'index.json' });
    const o = io();
    expect(index(['--config', join(dir, 'idx.json')], o)).toBe(0);
    expect(index(['--config', join(dir, 'idx.json'), '--strict'], o)).toBe(1);
    expect(rd('index.json').missing).toEqual(['c:404']);
    w('pub.json', { index: 'index.json', root: 'art', stage: 'chosen', out: 'public/art', manifest: 'public/art-manifest.json', ext: 'png' });
    expect(await publish(['--config', join(dir, 'pub.json')], o)).toBe(0);
    const m = rd('public/art-manifest.json');
    expect(Object.keys(m)).toEqual(['c_1', 'c_2', 'c_3', 'c_5']);
    const args = ['--manifest', join(dir, 'public/art-manifest.json'), '--sources', join(dir, 'chosen'), '--out', join(dir, 'public/art'), '--ext', 'png'];
    const c = io();
    expect(check(args, c)).toBe(0);
    writeFileSync(join(dir, 'chosen/c_1.png'), solid(2, 2, [1, 2, 3, 255]));
    expect(check(args, c)).toBe(1);
  });

  it('the CI cache key changes with an input, restore misses then hits after save', () => {
    w('in/data.txt', 'one');
    w('gen/file.txt', 'made');
    w('cache.json', { cache: 'ci', inputs: ['in'], paths: ['gen'] });
    const key = (): string => { const o = io(); cache(['key', '--config', join(dir, 'cache.json')], o); return o.lines[0]!; };
    const k1 = key();
    expect(key()).toBe(k1);
    expect(cache(['restore', '--config', join(dir, 'cache.json'), '--require'], io())).toBe(1);
    expect(cache(['save', '--config', join(dir, 'cache.json')], io())).toBe(0);
    rmSync(join(dir, 'gen'), { recursive: true });
    expect(cache(['restore', '--config', join(dir, 'cache.json'), '--require'], io())).toBe(0);
    expect(readFileSync(join(dir, 'gen/file.txt'), 'utf8')).toBe('made');
    w('in/data.txt', 'two');
    expect(key()).not.toBe(k1);
  });

  describe('K679 quality and enlarged', () => {
    // made-up codec: the size grows with the quality (a real one is the game's sharp)
    const fake = { out: (_s: Uint8Array, _e: string, _b?: unknown, q?: number) => Promise.resolve(Buffer.alloc(1000 + (q ?? 80) * 100)) };
    const setup = (cfg: object) => {
      w('q/art/a.png', solid(4, 4, [1, 2, 3, 255]));
      w('q/index.json', { order: [], defs: { a: 'a.png' }, sources: {}, missing: [], counts: {} });
      const base = { index: 'index.json', root: 'art', stage: 'chosen', out: 'public', manifest: 'm.json', ext: 'jpg' };
      return w('q/pub.json', { ...base, ...cfg });
    };
    const size = () => readFileSync(join(dir, 'q/public/a.jpg')).length;
    it('encodes at the highest quality that fits the cap, never below min', async () => {
      expect(await publish(['--config', setup({ quality: { min: 90 }, maxFileBytes: 10500 })], io(), fake)).toBe(0);
      expect(size()).toBe(10500);
      expect(await publish(['--config', setup({ quality: { min: 90 } })], io(), fake)).toBe(0);
      expect(size()).toBe(11000);
    });
    it('fails a face that cannot fit at min, naming the face, its size and the cap', async () => {
      const o = io();
      expect(await publish(['--config', setup({ quality: { min: 90 }, maxFileBytes: 9500 })], o, fake)).toBe(2);
      expect(o.lines.join(' ')).toContain('a: 10000 bytes at quality 90 is over the cap of 9500 bytes');
    });
    it('reads a per-face quality and cap', async () => {
      expect(await publish(['--config', setup({ faces: { a: { quality: { min: 95 }, maxFileBytes: 20000 } } })], io(), fake)).toBe(0);
      expect(size()).toBe(11000);
    });
    it('rejects max under min', async () => {
      const o = io();
      expect(await publish(['--config', setup({ quality: { min: 90, max: 80 } })], o, fake)).toBe(2);
      expect(o.lines.join(' ')).toContain('a: quality max 80 is under min 90');
    });
    it('a per-face quality wins over the global one, and max is the ceiling', async () => {
      expect(await publish(['--config', setup({ quality: { min: 50, max: 60 }, faces: { a: { quality: { min: 90, max: 92 } } } })], io(), fake)).toBe(0);
      expect(size()).toBe(1000 + 92 * 100);
      expect(await publish(['--config', setup({ quality: { min: 50, max: 70 } })], io(), fake)).toBe(0);
      expect(size()).toBe(1000 + 70 * 100);
    });
    it('without quality the output is the codec default', async () => {
      expect(await publish(['--config', setup({})], io(), fake)).toBe(0);
      expect(readFileSync(join(dir, 'q/public/a.jpg'))).toEqual(Buffer.alloc(1000 + 80 * 100));
    });
    it('README recipe runs', async () => {
      const md = readFileSync(join(__dirname, 'README.md'), 'utf8');
      const cfg = JSON.parse(/```json recipe-quality\r?\n([\s\S]*?)\r?\n```/.exec(md)![1]!) as Record<string, unknown>;
      expect(await publish(['--config', setup({ ...cfg, sharp: undefined })], io(), fake)).toBe(0);
      const n = readFileSync(join(dir, 'q/public/art/a.jpg')).length;
      expect(n).toBeGreaterThanOrEqual(1000 + 90 * 100);
      expect(n).toBeLessThanOrEqual(200000);
    });
    it('art-check fails an enlarged face and passes an unchanged one', () => {
      const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
      const src = solid(2, 2, [1, 2, 3, 255]);
      w('e/src/a.png', src);
      w('e/out/a.png', 'xx');
      const m = (o: object) => w('e/m.json', { a: { source: 'a.png', sha256: sha(src), bytes: 2, ...o } });
      const args = (): string[] => ['--manifest', join(dir, 'e/m.json'), '--sources', join(dir, 'e/src'), '--out', join(dir, 'e/out'), '--ext', 'png'];
      m({ width: 2, height: 2, sourceWidth: 2, sourceHeight: 2 });
      expect(check(args(), io())).toBe(0);
      m({ width: 4, height: 3, sourceWidth: 2, sourceHeight: 2 });
      const o = io();
      expect(check(args(), o)).toBe(1);
      expect(o.lines.join(' ')).toContain('a: enlarged: the output is 4x3, the source 2x2');
      expect(check([...args(), '--allow-enlarged'], io())).toBe(0);
      m({});
      const s = io();
      expect(check(args(), s)).toBe(0);
      expect(s.lines.join(' ')).toContain('enlarged check: 1 faces skipped, no source size; republish to check them');
      const s2 = io();
      expect(check([...args(), '--allow-enlarged'], s2)).toBe(0);
      expect(s2.lines.join(' ')).not.toContain('skipped');
    });
  });
});

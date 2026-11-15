import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Script } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildPrecache,
  cacheName,
  cacheVersion,
  injectPrecache,
  PLACEHOLDER,
  precacheList,
  swPrecache,
  swTemplate,
  writeServiceWorker,
} from './precache';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function fakeBuild(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'kit-sw-'));
  dirs.push(dir);
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), text);
  }
  return dir;
}

const BUILD: Record<string, string> = {
  'index.html': '<html>',
  'assets/index-abc.js': 'js',
  'assets/index-abc.css': 'css',
  'faces/C-01.jpg': 'face',
  'faces/orig/C-01.png': 'original',
  'fonts/Name[wght].ttf': 'font',
  'debug/big.bin': 'not for play',
  'manifest.webmanifest': '{}',
  'sw.js': 'old',
};
const O = { prefix: 'game-' };

describe('the offline precache', () => {
  it('keeps every file of the build but sw.js and .vite/, sorted, POSIX; the game excludes more', () => {
    expect(precacheList(['sw.js', 'index.html', './assets/a.js', '.vite/manifest.json', 'index.html', 'x/y.png'], O)).toEqual([
      'assets/a.js',
      'index.html',
      'x/y.png',
    ]);
    const p = buildPrecache(fakeBuild(BUILD), { ...O, exclude: [/^faces\/orig\//, /^debug\//] });
    expect(p.files).toEqual(['assets/index-abc.css', 'assets/index-abc.js', 'faces/C-01.jpg', 'fonts/Name[wght].ttf', 'index.html', 'manifest.webmanifest']);
    expect(p.version).toMatch(/^[0-9a-f]{16}$/);
    expect(cacheName(p)).toBe(`game-${p.version}`);
  });

  it('with an asset folder list: the root files, the app folder and the listed folders only', () => {
    const p = buildPrecache(fakeBuild(BUILD), { ...O, assets: ['faces', 'fonts/'], exclude: [/^faces\/orig\//] });
    expect(p.files).toEqual(['assets/index-abc.css', 'assets/index-abc.js', 'faces/C-01.jpg', 'fonts/Name[wght].ttf', 'index.html', 'manifest.webmanifest']);
    expect(precacheList(['index.html', 'js/a.js', 'assets/b.js', 'facesX/a.jpg'], { ...O, assets: ['faces'], appDir: 'js' })).toEqual([
      'index.html',
      'js/a.js',
    ]);
  });

  it('the version follows the kept files: same build same version; a changed, added or removed file a new one', () => {
    const v = buildPrecache(fakeBuild(BUILD), O).version;
    expect(buildPrecache(fakeBuild(BUILD), O).version).toBe(v);
    expect(buildPrecache(fakeBuild({ ...BUILD, 'assets/index-abc.js': 'js2' }), O).version).not.toBe(v);
    expect(buildPrecache(fakeBuild({ ...BUILD, 'faces/C-02.jpg': 'f' }), O).version).not.toBe(v);
    const less = { ...BUILD };
    delete less['manifest.webmanifest'];
    expect(buildPrecache(fakeBuild(less), O).version).not.toBe(v);
    const x = { ...O, exclude: [/^debug\//] };
    expect(buildPrecache(fakeBuild({ ...BUILD, 'debug/big.bin': 'other' }), x).version).toBe(buildPrecache(fakeBuild(BUILD), x).version);
    expect(cacheVersion([['a', '1'], ['b', '2']])).toBe(cacheVersion([['b', '2'], ['a', '1']]));
    expect(cacheVersion([['a', '1'], ['b', '2']])).not.toBe(cacheVersion([['a', '2'], ['b', '1']]));
  });

  it('writes the prefix, the list and the version into the kit sw.js in place of its placeholder; it stays valid JavaScript', () => {
    const source = swTemplate();
    expect(source).toMatch(PLACEHOLDER);
    expect(source).toContain('const PREFIX = PRECACHE.prefix;');
    const out = injectPrecache(source, { prefix: 'game-', version: '0123456789abcdef', files: ['index.html', 'assets/a.js'] });
    expect(out).toContain('/*PRECACHE*/ {"prefix":"game-","version":"0123456789abcdef","files":["index.html","assets/a.js"]} /*END*/');
    expect(out).not.toContain('unbuilt');
    expect(() => new Script(out)).not.toThrow();
    expect(() => injectPrecache('const PRECACHE = {};', { prefix: 'p', version: 'v', files: [] })).toThrow(/placeholder/);
    const dir = fakeBuild(BUILD);
    const p = writeServiceWorker(dir, O);
    expect(readFileSync(join(dir, 'sw.js'), 'utf8')).toContain(`"version":"${p.version}"`);
  });

  it('the Vite plugin writes sw.js after a build with the build`s assets folder, and nothing after a failed build', () => {
    const dir = fakeBuild({ 'index.html': 'x', 'static/a.js': 'a', 'faces/f.jpg': 'f', 'other/o.txt': 'o' });
    const logs: string[] = [];
    const plugin = swPrecache({ prefix: 'game-', assets: ['faces'] });
    plugin.configResolved({ root: dir, build: { outDir: '.', assetsDir: 'static' }, logger: { info: (m) => logs.push(m) } });
    plugin.closeBundle();
    const sw = readFileSync(join(dir, 'sw.js'), 'utf8');
    expect(sw).toContain('"files":["faces/f.jpg","index.html","static/a.js"]');
    expect(logs[0]).toMatch(/^sw\.js: 3 files precached, version [0-9a-f]{16}$/);
    const empty = fakeBuild({});
    plugin.configResolved({ root: empty, build: { outDir: '.', assetsDir: 'assets' }, logger: { info: (m) => logs.push(m) } });
    plugin.closeBundle();
    expect(logs).toHaveLength(1);
  });
});

// K502: gallery/effects.html is current and has a tile for every catalog.json entry.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('components/effect-library/catalog.json', root), 'utf8')) as { id: string; option?: unknown; group: string }[];
const html = readFileSync(new URL('gallery/effects.html', root), 'utf8');
const data = JSON.parse(/<script type="application\/json" id="data">(.*?)<\/script>/s.exec(html)?.[1] ?? '[]') as { group: string; tiles: { key: string; demo: unknown }[] }[];

describe('effects gallery (K502)', () => {
  it('has a tile for every catalog entry, in its group, with its demo', () => {
    const missing = catalog.filter((e) => {
      const key = e.id + (e.option ? ' ' + JSON.stringify(e.option) : '');
      return !data.find((g) => g.group === e.group)?.tiles.some((t) => t.key === key && t.demo !== undefined);
    });
    expect(missing.map((e) => e.id)).toEqual([]);
    expect(data.reduce((s, g) => s + g.tiles.length, 0)).toBe(catalog.length);
  });

  it('node gallery/build.mjs --check exits 0: the built page is current', () => {
    const r = spawnSync(process.execPath, ['gallery/build.mjs', '--check'], { cwd: root, encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
});

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { jsonDiff, transcriptionCheck } from './index';

const t = (id: string, who: 'A' | 'B', data: unknown, flags: string[] = []) => JSON.stringify({ id, source: { transcriber: who, from: 'photo', picture: `${id}.jpg`, session: 's1' }, flags, data });
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'tc-'));
  for (const d of ['a', 'b', 'pictures']) mkdirSync(join(root, d));
  const put = (d: string, id: string, s: string) => writeFileSync(join(root, d, `${id}.json`), s);
  return { root, put };
}

describe('transcription-check', () => {
  it('jsonDiff lists differing paths', () => {
    expect(jsonDiff({ a: [1, 2], b: 1 }, { a: [1, 3], c: 1 })).toEqual(['a[1]', 'b', 'c']);
  });
  it('diffs, resolves by NOTE, verifies, and undoes on edit', () => {
    const { root, put } = setup();
    const c = transcriptionCheck({ root, items: ['x', 'y'] });
    put('a', 'x', t('x', 'A', { n: 1 }));
    put('b', 'x', t('x', 'B', { n: 2 }));
    expect(c.diff().find((d) => d.id === 'x')?.status).toBe('differs');
    expect(c.diffMarkdown()).toContain('[OPEN] `n`');
    expect(c.openCount(c.diff())).toBe(1);
    expect(() => c.verify(['x'], '2026-11-16')).toThrow();
    put('a', 'x', t('x', 'A', { n: 1 }, ['NOTE: n checked']));
    expect(c.openCount(c.diff())).toBe(0);
    c.verify(['x'], '2026-11-16');
    expect(c.gate()).toEqual([{ id: 'y', message: 'transcription missing' }]);
    expect(c.progressMarkdown()).toContain('| x | - | yes | yes | differs | yes (2026-11-16) |');
    put('a', 'x', t('x', 'A', { n: 1 }, ['NOTE: n checked again']));
    expect(c.gate().map((g) => g.message)).toContain('changed since it was verified');
  });
  it('a NOTE resolves only the whole path', () => {
    const { root, put } = setup();
    const c = transcriptionCheck({ root, items: ['x'] });
    put('a', 'x', t('x', 'A', { n: 1 }, ['NOTE: n.first checked']));
    put('b', 'x', t('x', 'B', { n: 2 }));
    expect(c.openCount(c.diff())).toBe(1);
  });
  it('no-b, missing A and array length', () => {
    const { root, put } = setup();
    const c = transcriptionCheck({ root, items: ['x', 'z'] });
    put('a', 'x', t('x', 'A', { l: [1, 2] }));
    expect(c.diff().map((d) => d.status)).toEqual(['no-b', 'no-a']);
    expect(() => c.verify(['x'], 'd')).toThrow('B missing');
    put('b', 'x', t('x', 'B', { l: [1, 2, 3] }));
    expect(c.diff()[0]?.diffs).toEqual([{ path: 'l[2]', resolved: false }]);
  });
  it('picture and B changes undo the verification; check writes DIFF.md and fails while open', () => {
    const { root, put } = setup();
    const c = transcriptionCheck({ root, items: ['x'] });
    put('a', 'x', t('x', 'A', { n: 1 }));
    put('b', 'x', t('x', 'B', { n: 1 }));
    writeFileSync(join(root, 'pictures', 'x.jpg'), 'one');
    c.verify(['x'], 'd');
    expect(c.gate()).toEqual([]);
    writeFileSync(join(root, 'pictures', 'x.jpg'), 'two');
    expect(c.gate()).toHaveLength(1);
    writeFileSync(join(root, 'pictures', 'x.jpg'), 'one');
    put('b', 'x', t('x', 'B', { n: 2 }));
    expect(c.gate()).toHaveLength(1);
    process.exitCode = 0;
    expect(c.check()).toBe(1);
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
    expect(readFileSync(join(root, 'DIFF.md'), 'utf8')).toContain('Unresolved differences: 1');
  });
  it('uses a custom parse', () => {
    const { root, put } = setup();
    put('a', 'x', '{"name":"x","v":1}');
    const c = transcriptionCheck<number>({ root, items: ['x'], parse: (r) => { const o = r as { name: string; v: number }; return { id: o.name, source: { transcriber: 'A', from: 'p' }, flags: [], data: o.v }; } });
    expect(c.loadA().get('x')?.transcript.data).toBe(1);
  });
  it('uses the game schema', () => {
    const { root, put } = setup();
    put('a', 'x', '{"id":"x"}');
    expect(() => transcriptionCheck({ root, items: ['x'] }).loadA()).toThrow('not a Transcript');
  });
});

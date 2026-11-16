import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { run } from './lookup.ts';

const dir = mkdtempSync(join(tmpdir(), 'lookup-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const mod = join(dir, 'game.mjs');
writeFileSync(
  mod,
  `export const lookup = () => Promise.resolve({
  cards: [
    { id: 'A1', name: 'Alpha', pack: 'core', text: 'Draw 1.', refs: ['draw', 'gone'] },
    { id: 'B2', pack: 'core', errata: 'now draws 2', refs: ['skip'] },
  ],
  resolve: (r) => (r === 'draw' ? 'abilities/draw.ts' : null),
  skipped: { skip: 'blocked' },
  vocabulary: [{ name: 'drawCards', signature: 'drawCards(n)', doc: 'Draw n cards' }],
});`,
);
const quiet = { out: () => undefined, err: () => undefined };
const go = async (...a: string[]) => {
  const out: string[] = [];
  const io = { out: (l: string) => void out.push(l), err: (l: string) => void out.push(l) };
  return { code: await run(['--module', mod, ...a], io), text: out.join('\n') };
};

describe('lookup commands (K99)', () => {
  it('card shows text and each ref with where it resolves', async () => {
    const r = await go('card', 'a1');
    expect(r.code).toBe(0);
    expect(r.text).toContain('ref draw: resolves in abilities/draw.ts');
    expect(r.text).toContain('ref gone: NOT RESOLVED');
  });
  it('card flags errata loudly and shows skipped refs; unknown id is 1', async () => {
    const r = await go('card', 'B2');
    expect(r.text).toContain('ERRATA: script THIS: now draws 2');
    expect(r.text).toContain('skipped (blocked)');
    expect((await go('card', 'zz')).code).toBe(1);
  });
  it('dsl searches names, signatures and docs', async () => {
    expect((await go('dsl', 'cards')).text).toContain('drawCards(n)');
    expect((await go('dsl', 'nope')).code).toBe(1);
  });
  it('refs lists unscripted per pack with a skip list; --strict fails', async () => {
    const r = await go('refs');
    expect(r.code).toBe(0);
    expect(r.text).toContain('core: 2 scripted or skipped, 1 unscripted: gone');
    expect(r.text).toContain(`"gone": 'reason',`);
    expect(await run(['--module', mod, '--strict', 'refs'], quiet)).toBe(1);
  });
  it('flags may follow the command; a card id equal to the module path still parses', async () => {
    expect(await run(['--module', mod, 'refs', '--strict'], quiet)).toBe(1);
    expect(await run(['card', '--module', mod, 'A1'], quiet)).toBe(0);
    expect(await run(['--module', 'A1', 'card', 'A1'], quiet)).toBe(2);
  });
  it('usage errors are 2', async () => {
    expect(await run([], quiet)).toBe(2);
  });
});

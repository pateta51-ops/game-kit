import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { traceAbilities } from '../card-harness/trace.ts';
import { provenClauses } from './index.ts';
import { clauseTrace, proveResolved, type ClauseStep } from './prove.ts';

// A made-up game log: each entry is what the game's own engine wrote at one step.
interface Entry {
  readonly n: number;
  readonly card: string;
  readonly event: 'ran' | 'modified' | 'drew';
  readonly value?: readonly [number, number];
}
const toStep = (e: Entry): ClauseStep | undefined =>
  e.event === 'drew' ? undefined : { clause: e.card, step: e.n, kind: e.event === 'ran' ? 'resolved' : 'applied', before: e.value?.[0], after: e.value?.[1] };
const dir = mkdtempSync(join(tmpdir(), 'k666-proof-'));
const log = join(dir, 'proof.jsonl');
const recipeLog = join(dir, 'recipe.jsonl');
const IDS = ['g-resolved', 'g-static', 'g-noop', 'g-hook', 'g-fails', 'g-absent', 'g-hand', 'g-after', 'g-before', 'g-same', 'r-old'];

// These run first and write the log the next block reads.
describe('K666 proof from a game log', () => {
  it('a game-shaped log mapped to clause ids proves a resolved clause', () => {
    proveResolved(log, clauseTrace<Entry>([{ n: 1, card: 'x', event: 'drew' }, { n: 2, card: 'g-resolved', event: 'ran' }], toStep), 'g-resolved');
  });
  it('a static clause shown applied with an effect is proven', () => {
    proveResolved(log, clauseTrace<Entry>([{ n: 1, card: 'g-static', event: 'modified', value: [4, 3] }], toStep), 'g-static');
  });
  it('applied with no effect is not proven', () => {
    expect(() => proveResolved(log, clauseTrace<Entry>([{ n: 1, card: 'g-noop', event: 'modified', value: [4, 4] }], toStep), 'g-noop')).toThrow('Not resolved: g-noop (applied with no effect)');
  });
  it('the game changed rule judges an applied step', () => {
    const t = clauseTrace<Entry>([{ n: 1, card: 'g-hook', event: 'modified', value: [4, 3] }], toStep, () => false);
    expect(() => proveResolved(log, t, 'g-hook')).toThrow('Not resolved: g-hook (applied with no effect)');
  });
  it('a clause missing from the trace is refused', () => {
    expect(() => proveResolved(log, clauseTrace<Entry>([], toStep), 'g-absent')).toThrow('Not resolved: g-absent (not in the trace)');
  });
  it('a hand-built trace object is refused', () => {
    const hand = { steps: [{ clause: 'g-hand', step: 0, kind: 'resolved' as const }] };
    expect(() => proveResolved(log, hand, 'g-hand')).toThrow('proveResolved: build the trace with clauseTrace(), not by hand');
  });
  it('an applied step with only after, only before, or before equal to after is not proven', () => {
    const one = (s: ClauseStep) => () => proveResolved(log, clauseTrace([s], (x) => x), s.clause);
    expect(one({ clause: 'g-after', step: 1, kind: 'applied', after: 3 })).toThrow('Not resolved: g-after (applied without before and after)');
    expect(one({ clause: 'g-before', step: 1, kind: 'applied', before: 3 })).toThrow('Not resolved: g-before (applied without before and after)');
    expect(one({ clause: 'g-same', step: 1, kind: 'applied', before: 3, after: 3 })).toThrow('Not resolved: g-same (applied with no effect)');
  });
  it.fails('an it.fails test using the input proves nothing', () => {
    proveResolved(log, clauseTrace<Entry>([{ n: 1, card: 'g-fails', event: 'ran' }], toStep), 'g-fails');
    throw new Error('an it.fails test passes when its body fails');
  });
  it('a registry trace works as before', () => {
    const t = traceAbilities({ 'r-old': { effects: [] as unknown[] } });
    void t.registry['r-old'].effects;
    proveResolved(log, t, 'r-old');
  });
});

describe('K666 proof read back', () => {
  it('proves only the resolved clause and the static clause applied with an effect (and the registry trace)', () => {
    const p = provenClauses({ log, root: process.cwd(), clauses: IDS });
    expect(p.problems).toEqual([]);
    expect(Object.keys(p.proven).sort()).toEqual(['g-resolved', 'g-static', 'r-old']);
    expect(p.proven['g-static']).toEqual(['components/sim-pool/k666.test.ts › K666 proof from a game log > a static clause shown applied with an effect is proven']);
  });
  it('a record from the input names this project root, so a foreign root fails as K651', () => {
    const r = JSON.parse(readFileSync(log, 'utf8').split('\n')[0] ?? '') as { root: string };
    expect(r.root).toBe(process.cwd().replace(/\\/g, '/'));
    const other = provenClauses({ log, root: dir, clauses: IDS });
    expect(other.proven).toEqual({});
    expect(other.problems[0]).toContain('not this project');
  });
});

describe('K666 README recipe', () => {
  it('runs the README trace recipe', async () => {
    const md = readFileSync(new URL('./README.md', import.meta.url), 'utf8');
    const code = (/## Trace from a game's own log[^\n]*\n[\s\S]*?```ts\r?\n([\s\S]*?)```/.exec(md)?.[1] ?? '')
      .replaceAll(/(['"])\.\.\/kit\//g, '$1../')
      .replaceAll("'.cache/proof.jsonl'", JSON.stringify(recipeLog));
    expect(code).toContain('clauseTrace(');
    const file = new URL('./.k666-recipe.ts', import.meta.url);
    writeFileSync(file, code);
    try {
      await import(pathToFileURL(file.pathname.replace(/^\/([A-Za-z]:)/, '$1')).href);
    } finally {
      rmSync(file, { force: true });
    }
  });
  it('the recipe proved its two clauses', () => {
    expect(Object.keys(provenClauses({ log: recipeLog, root: process.cwd(), clauses: ['c12-1', 'c30-1'] }).proven).sort()).toEqual(['c12-1', 'c30-1']);
  });
});

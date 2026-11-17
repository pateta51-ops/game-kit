import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { posInt, type VerbTable } from '../card-language/index.ts';
import type { GameTypes } from '../engine-core/index.ts';
import { load, loadOrThrow, loadText, type PackDef } from './index.ts';

type Step = { readonly op: 'gain'; readonly amount: number };
const VERBS: VerbTable<GameTypes, Step> = {
  gain: { fields: { amount: posInt }, run: () => undefined, text: (s) => `Gain ${String(s.amount)}.` },
};

const def: PackDef = {
  kinds: {
    card: { schema: z.object({ id: z.string(), cost: z.coerce.number().int().min(0), deck: z.string(), effect: z.array(z.unknown()).optional() }), refs: { deck: 'deck' }, effects: ['effect'] },
    deck: { schema: z.object({ id: z.string() }) },
  },
  verbs: VERBS,
};
const decks = [{ id: 'red' }];

describe('content-pack (K265)', () => {
  it('loads a good pack', () => {
    const r = load(def, { deck: decks, card: [{ id: 'a', cost: 1, deck: 'red', effect: [{ op: 'gain', amount: 2 }] }] });
    expect(r.ok && r.pack.byId.get('card:a')).toMatchObject({ cost: 1 });
  });
  it('refuses a duplicate id', () => {
    const r = load(def, { deck: decks, card: [{ id: 'a', cost: 1, deck: 'red' }, { id: 'a', cost: 2, deck: 'red' }] });
    expect(!r.ok && r.problems).toEqual(['card: duplicate id "a" (at 1)']);
  });
  it('refuses a dangling reference', () => {
    const r = load(def, { deck: decks, card: [{ id: 'a', cost: 1, deck: 'blue' }] });
    expect(!r.ok && r.problems[0]).toContain('deck refers to deck "blue"');
  });
  it('refuses a schema failure and lists every problem', () => {
    const r = load(def, { deck: [{ id: 3 }], card: [{ id: 'a', cost: -1 }] });
    expect(!r.ok && r.problems.length).toBeGreaterThanOrEqual(3);
  });
  it('refuses an unknown verb', () => {
    const r = load(def, { deck: decks, card: [{ id: 'a', cost: 1, deck: 'red', effect: [{ op: 'fly' }] }] });
    expect(!r.ok && r.problems.join()).toContain('fly');
  });
  it('runs the extra effect hook', () => {
    const r = load({ ...def, check: (k, rec) => (k === 'deck' ? [`bad ${(rec as { id: string }).id}`] : []) }, { deck: decks, card: [] });
    expect(!r.ok && r.problems).toEqual(['deck[0] (id "red"): bad red']);
  });
  it('refuses a bad CSV row and loads a good one', () => {
    const csv = (cost: string) => ({ deck: { json: '[{"id":"red"}]' }, card: { csv: `id,cost,deck\na,${cost},red\n` } });
    const bad = loadText(def, csv('abc'));
    expect(!bad.ok && bad.problems[0]).toContain('card[0] (id "a"): cost');
    expect(loadText(def, csv('3')).ok).toBe(true);
  });
  it('refuses a malformed CSV file', () => {
    const r = loadText(def, { deck: { json: '[{"id":"red"}]' }, card: { csv: 'id,cost,deck\n"a,1,red' } });
    expect(r.ok).toBe(false);
  });
  it('does not call references to a schema-failed record dangling', () => {
    const r = load(def, { deck: [{ id: 'red', extra: 1 }, { id: 3 }], card: [{ id: 'a', cost: 1, deck: 'red' }] });
    const bad = load({ kinds: { ...def.kinds, deck: { schema: z.object({ id: z.string(), n: z.number() }) } } }, { deck: [{ id: 'red' }], card: [{ id: 'a', cost: 1, deck: 'red' }] });
    expect(r.ok).toBe(false);
    expect(!bad.ok && bad.problems.every((p) => !p.includes('does not exist'))).toBe(true);
  });
  it('reports a refs target missing from the kinds once', () => {
    const r = load({ kinds: { card: { schema: z.object({ id: z.string(), t: z.string() }), refs: { t: 'nope' } } } }, { card: [{ id: 'a', t: 'x' }, { id: 'b', t: 'y' }] });
    expect(!r.ok && r.problems).toEqual(['definition: card.t refers to unknown kind "nope"']);
  });
  it('refuses bad JSON', () => {
    const r = loadText(def, { deck: { json: '{' } });
    expect(!r.ok && r.problems[0]).toContain('bad JSON');
  });
  it('loads 1,000 generated cards fast', () => {
    const card = Array.from({ length: 1000 }, (_, i) => ({ id: `c${String(i)}`, cost: i % 5, deck: 'red', effect: [{ op: 'gain', amount: 1 }] }));
    const t = performance.now();
    const p = loadOrThrow(def, { deck: decks, card });
    expect(p.records.card).toHaveLength(1000);
    expect(performance.now() - t).toBeLessThan(500);
  });
});

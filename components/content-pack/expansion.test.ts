import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { PackDef } from './index.ts';
import { checkRegistry, choiceFromJson, choiceToJson, dependencyClosure, makeChoice, mergeOrder, mergePacks, tick, untick, type PackData, type Registry } from './expansion.ts';

const reg: Registry = [
  { id: 'core' },
  { id: 'a', kind: 'expansion', dependsOn: ['core'] },
  { id: 'b', kind: 'expansion', dependsOn: ['a'] },
  { id: 'c', kind: 'expansion', dependsOn: ['a'] },
  { id: 'd', kind: 'expansion', dependsOn: ['b', 'c'] },
  { id: 'v', kind: 'variant', dependsOn: ['core'] },
];
const def: PackDef = { kinds: { card: { schema: z.object({ id: z.string(), n: z.number(), printedAs: z.string().optional() }) } } };
const card = (id: string, n = 1) => ({ id, n });
const pk = (id: string, ids: string[], replaces?: PackData['replaces']): PackData => ({ id, data: { card: ids.map((i) => card(i)) }, ...(replaces ? { replaces } : {}) });

describe('dependency closure (K361)', () => {
  it('chain and diamond', () => {
    expect(dependencyClosure(reg, 'b')).toEqual(['a', 'b', 'core']);
    expect(dependencyClosure(reg, 'd')).toEqual(['a', 'b', 'c', 'core', 'd']);
  });
  it('rejects a cycle', () => {
    const cyc: Registry = [{ id: 'x', dependsOn: ['y'] }, { id: 'y', dependsOn: ['x'] }];
    expect(() => dependencyClosure(cyc, 'x')).toThrow('x -> y -> x');
    expect(checkRegistry(cyc).length).toBe(2);
  });
  it('ticks needs and unticks dependents', () => {
    expect(tick(reg, 'core', [], 'd')).toEqual(['a', 'b', 'c', 'd']);
    expect(untick(reg, ['a', 'b', 'c', 'd'], 'b')).toEqual(['a', 'c']);
    expect(untick(reg, ['a', 'b', 'c', 'd'], 'a')).toEqual([]);
  });
  it('refuses to tick over an unavailable need', () => {
    const r: Registry = [{ id: 'core' }, { id: 'a', kind: 'expansion', dependsOn: ['core'], unavailable: 'broken' }, { id: 'b', kind: 'expansion', dependsOn: ['a'] }];
    expect(tick(r, 'core', [], 'b')).toEqual([]);
  });
});

describe('choice (K361)', () => {
  it('round-trips through JSON', () => {
    const c = makeChoice('core', ['b', 'a', 'a']);
    expect(c.packs).toEqual(['a', 'b', 'core']);
    expect(choiceFromJson(reg, choiceToJson(c))).toEqual(c);
  });
  it('refuses a choice missing a need, an unknown pack or junk', () => {
    expect(choiceFromJson(reg, JSON.stringify({ base: 'core', packs: ['core', 'b'] }))).toBeNull();
    expect(choiceFromJson(reg, JSON.stringify({ base: 'core', packs: ['zz'] }))).toBeNull();
    expect(choiceFromJson(reg, 'nope')).toBeNull();
  });
});

describe('merge (K361, ER mergePacks)', () => {
  it('orders base, expansions by depth, variants last', () => {
    expect(mergeOrder(reg, [{ id: 'v' }, { id: 'd' }, { id: 'b' }, { id: 'core' }, { id: 'a' }]).map((x) => x.id)).toEqual(['core', 'a', 'b', 'd', 'v']);
  });
  it('merges into one index', () => {
    const r = mergePacks(def, reg, [pk('a', ['x2']), pk('core', ['x1'])], makeChoice('core', ['a']));
    expect(r.ok && [...r.pack.byId.keys()]).toEqual(['card:x1', 'card:x2']);
  });
  it('refuses a duplicate id across packs and inside one', () => {
    const c = makeChoice('core', ['a']);
    const x = mergePacks(def, reg, [pk('core', ['x']), pk('a', ['x'])], c);
    expect(!x.ok && x.problems[0]).toContain('E_PACK_CONFLICT');
    const y = mergePacks(def, reg, [pk('core', ['x', 'x']), pk('a', [])], c);
    expect(!y.ok && y.problems[0]).toContain('E_DUP_ID');
  });
  it('refuses a missing pack and a need not chosen', () => {
    const x = mergePacks(def, reg, [pk('core', [])], makeChoice('core', ['a']));
    expect(!x.ok && x.problems[0]).toContain('E_PACK_MISSING');
    const y = mergePacks(def, reg, [pk('core', []), pk('b', [])], makeChoice('core', ['b']));
    expect(!y.ok && y.problems.join()).toContain('needs a');
  });
  it('replaces: the by record takes the replaced id and by is dropped', () => {
    const a = pk('a', ['alt'], [{ kind: 'card', id: 'x', by: 'alt' }]);
    const core = { id: 'core', data: { card: [card('x', 1)] } };
    const r = mergePacks(def, reg, [core, { ...a, data: { card: [card('alt', 9)] } }], makeChoice('core', ['a']));
    expect(r.ok && r.pack.records['card']).toEqual([{ id: 'x', n: 9, printedAs: 'alt' }]);
  });
  it('inactive expansion replacement keeps the original and drops by; a variant stays active', () => {
    const core = { id: 'core', data: { card: [card('x', 1)] } };
    const a = { id: 'a', data: { card: [card('alt', 9)] }, replaces: [{ kind: 'card', id: 'x', by: 'alt' }] };
    const r = mergePacks(def, reg, [core, a], makeChoice('core', ['a']), { replacements: 'variantsOnly' });
    expect(r.ok && r.pack.records['card']).toEqual([{ id: 'x', n: 1 }]);
    const v = { ...a, id: 'v' };
    const r2 = mergePacks(def, reg, [core, v], makeChoice('core', ['v']), { replacements: 'variantsOnly' });
    expect(r2.ok && r2.pack.records['card']).toEqual([{ id: 'x', n: 9, printedAs: 'alt' }]);
  });
  it('refuses a replacement of a record no needed pack holds, and double replacement', () => {
    const core = { id: 'core', data: { card: [card('x')] } };
    const bad = { id: 'a', data: { card: [card('alt'), card('alt2')] }, replaces: [{ kind: 'card', id: 'nope', by: 'alt' }] };
    const r = mergePacks(def, reg, [core, bad], makeChoice('core', ['a']));
    expect(!r.ok && r.problems[0]).toContain('E_REF_RECORD');
    const dbl = { id: 'a', data: { card: [card('alt'), card('alt2')] }, replaces: [{ kind: 'card', id: 'x', by: 'alt' }, { kind: 'card', id: 'x', by: 'alt2' }] };
    const r2 = mergePacks(def, reg, [core, dbl], makeChoice('core', ['a']));
    expect(!r2.ok && r2.problems.join()).toContain('replaced by both');
  });
  it('a variant is all its records or none', () => {
    const core = { id: 'core', data: { card: [card('x')] } };
    const v = { id: 'v', data: { card: [card('alt'), card('extra')] }, replaces: [{ kind: 'card', id: 'x', by: 'alt' }] };
    const r = mergePacks(def, reg, [core, v], makeChoice('core', ['v']));
    expect(!r.ok && r.problems[0]).toContain('E_VARIANT_PARTIAL');
  });
});

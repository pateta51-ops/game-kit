import { describe, expect, it } from 'vitest';
import { cardLookup, diffCards } from './compare.ts';

describe('diffCards', () => {
  const fields = [{ name: 'cost', ours: (c: { cost: number }) => c.cost, theirs: (c: { c: number }) => c.c }];
  it('reports and honours the known list', () => {
    const ours = { a: { cost: 1 }, b: { cost: 2 }, x: { cost: 0 } };
    const theirs = { a: { c: 1 }, b: { c: 3 }, y: { c: 0 } };
    expect(diffCards(ours, theirs, fields)).toEqual({ unknown: ['x'], missing: ['y'], mismatches: [{ id: 'b', field: 'cost', ours: 2, theirs: 3 }], staleKnown: [] });
    const k = [{ id: 'b', field: 'cost', reason: 'db typo' }, { id: 'a', field: 'cost', reason: 'fixed upstream' }];
    const d = diffCards(ours, theirs, fields, k);
    expect(d.mismatches).toEqual([]);
    expect(d.staleKnown).toEqual([k[1]]);
  });
});


describe('cardLookup', () => {
  it('gives a marked stand-in and remembers it', () => {
    const get = cardLookup({ a: { name: 'A' } }, (id) => ({ name: `Missing ${id}` }));
    expect(get('a').name).toBe('A');
    expect(get('toString').name).toBe('Missing toString');
    expect([...get.missing]).toEqual(['toString']);
  });
});

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { grammarReference, strictProblems, type Grammar, type OptOut } from './index';
import { nodesOf } from './literals';

const G: Grammar = {
  nodes: {
    choose: { keys: ['from', 'as'], required: ['from', 'as'], binds: ['as'] },
    forEach: { keys: ['in', 'as', 'do'], required: ['in', 'as', 'do'], scopes: ['as'], reads: ['in'] },
    damage: { keys: ['target', 'amount'], required: ['target'], reads: ['target'], note: 'deals damage' },
    seq: { keys: ['steps'] },
  },
  ref: /^\$(\w+)$/,
  given: ['self'],
};
const rules = (def: unknown, o?: OptOut[]): string[] => strictProblems(G, def, o).map((p) => `${p.rule} ${p.message}`);

describe('strict validator (K97)', () => {
  it('passes a well-formed definition with variables bound in order', () => {
    const def = { op: 'seq', steps: [{ op: 'choose', from: 'enemies', as: 'x' }, { op: 'damage', target: 'x', amount: { per: '$self' } }, { op: 'forEach', in: 'x', as: 'y', do: [{ op: 'damage', target: 'y' }] }] };
    expect(rules(def)).toEqual([]);
  });
  it('fails unknown keys, keys in the wrong place, missing keys and unknown nodes', () => {
    expect(rules({ op: 'damage', target: 'self', amout: 2 })).toEqual(['unknown-key amout: damage has no key amout']);
    expect(rules({ op: 'damage', target: 'self', steps: [] })).toEqual(['wrong-place steps: steps belongs to seq, not damage']);
    expect(rules({ op: 'damage' })).toEqual(['missing-key (root): damage needs target']);
    expect(rules([{ op: 'heal' }])).toEqual(['unknown-node [0].op: unknown op "heal"']);
  });
  it('fails a variable read before it is bound, and a loop variable read after its loop', () => {
    expect(rules({ op: 'seq', steps: [{ op: 'damage', target: 'x' }, { op: 'choose', from: 'e', as: 'x' }] })).toEqual(['unbound steps[0].target: reads x before it is bound']);
    expect(rules({ op: 'seq', steps: [{ op: 'forEach', in: 'self', as: 'y', do: [] }, { op: 'damage', target: '$y' }] })).toEqual(['unbound steps[1].target: reads y before it is bound']);
    expect(rules({ op: 'damage', target: 'self', amount: '$z' })).toEqual(['unbound amount: reads z before it is bound']);
  });
  it('fails values that are not plain JSON', () => {
    expect(rules({ op: 'damage', target: 'self', amount: NaN })).toEqual(['json amount: NaN is not JSON']);
    expect(rules({ op: 'damage', target: 'self', amount: () => 1 })).toEqual(['json amount: a function is not plain JSON']);
    expect(rules({ op: 'damage', target: 'self', amount: new Map() })).toEqual(['json amount: a Map is not plain JSON']);
  });
  it('keeps cited opt-outs as data: a matching one silences, an uncited or stale one fails', () => {
    const def = { op: 'damage', target: 'self', amout: 2 };
    expect(rules(def, [{ rule: 'unknown-key', path: 'amout', citation: 'FAQ 1.2' }])).toEqual([]);
    expect(rules(def, [{ rule: 'unknown-key', citation: ' ' }])).toEqual(['unknown-key amout: damage has no key amout', 'opt-out-uncited opt-out unknown-key has no citation']);
    expect(rules({ op: 'damage', target: 'self' }, [{ rule: 'unbound', path: 'target', citation: 'R 4' }])).toEqual(['opt-out-stale opt-out unbound at target matches nothing']);
  });
  it('generates the grammar reference from the grammar', () => {
    const md = grammarReference(G);
    expect(md).toContain('| `damage` | `target`, `amount` | `target` |  |  | `target` | deals damage |');
    expect(md).toContain('Bound for free: `self`.');
  });
  it('reads node keys from the engine types and fails loudly on a renamed anchor', () => {
    const f = fileURLToPath(new URL('./fake/lang.ts', import.meta.url));
    expect(nodesOf(f, 'Step')).toEqual({ gain: { keys: ['n'], required: ['n'] }, roll: { keys: ['dice'], required: ['dice'] }, reroll: { keys: ['dice'], required: ['dice'] } });
    expect(() => nodesOf(f, 'Nope')).toThrow();
    expect(() => nodesOf(f, 'Formula')).toThrow();
  });
});

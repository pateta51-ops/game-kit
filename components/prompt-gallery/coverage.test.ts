import { describe, expect, it } from 'vitest';
import { checkActionCoverage, type Control } from './index';

type A = { kind: string; target?: number };
const legal = (): A[] => [{ kind: 'light', target: 1 }, { kind: 'light', target: 2 }, { kind: 'pass' }];
const run = (controls: Control<A>[]) => checkActionCoverage({ states: [{ id: 'seed-1@3', state: 0 }], legal, controls: () => controls });

describe('checkActionCoverage', () => {
  const all: Control<A>[] = [{ label: 'Lamp 1', sends: [{ kind: 'light', target: 1 }] }, { label: 'Lamp 2', sends: [{ kind: 'light', target: 2 }] }, { label: 'Pass', sends: [{ kind: 'pass' }] }];
  it('is empty when every legal action has a labelled control', () => expect(run(all)).toEqual([]));
  it('names a legal action no control sends', () => expect(run(all.slice(0, 2))).toEqual(['seed-1@3: legal action {"kind":"pass"} has no control']));
  it('names a missing label and an illegal send', () => {
    const r = run([...all, { label: ' ', sends: [] }, { label: 'Lamp 9', sends: [{ kind: 'light', target: 9 }] }]);
    expect(r).toEqual(['seed-1@3: a control has no label', 'seed-1@3: control "Lamp 9" sends {"kind":"light","target":9}, which is not legal']);
  });
});

import { describe, expect, it } from 'vitest';
import { expectNotFired, expectNotOffered, type Observed } from './index.ts';

// K661: a game's own event, option and prompt shapes map to clause ids with `clauseOf`.
const clauseOf = (x: unknown): string | undefined => {
  const e = x as { source?: string; clause?: number };
  return e.source !== undefined && e.clause !== undefined ? `${e.source}#${String(e.clause)}` : undefined;
};
const fired: Observed = { prompt: null, s: {}, events: [{ t: 'resolved', source: 'c1', clause: 0 }] };
const offered: Observed = { prompt: { options: [{ id: 'pick', source: 'c1', clause: 0 }] } as unknown as Observed['prompt'], s: {}, events: [] };
const prompted: Observed = { prompt: { source: 'c1', clause: 0, options: [] } as unknown as Observed['prompt'], s: {}, events: [] };

describe('K661 clauseOf', () => {
  it('K661 without clauseOf an event with source and clause index is not found by id (today)', () => {
    expect(() => expectNotFired(fired, 'c1#0')).not.toThrow();
  });
  it('K661 expectNotFired with clauseOf finds the event of the clause', () => {
    expect(() => expectNotFired(fired, 'c1#0', undefined, undefined, { clauseOf })).toThrow(/fired/);
    expect(() => expectNotFired(fired, 'c1#1', undefined, undefined, { clauseOf })).not.toThrow();
  });
  it('K661 expectNotFired: the field match is the fallback when clauseOf returns undefined', () => {
    const o: Observed = { prompt: null, s: {}, events: [{ type: 'scored', card: 'twin#1' }] };
    expect(() => expectNotFired(o, 'twin#1', undefined, undefined, { clauseOf })).toThrow(/fired/);
  });
  it("K661 expectNotOffered with clauseOf finds an option shaped the game's way", () => {
    expect(() => expectNotOffered(offered, 'c1#0')).not.toThrow();
    expect(() => expectNotOffered(offered, 'c1#0', () => false, { clauseOf })).toThrow(/offered in the open prompt/);
    expect(() => expectNotOffered(offered, 'c1#1', () => false, { clauseOf })).not.toThrow();
  });
  it('K661 expectNotOffered with clauseOf finds a prompt of the clause', () => {
    expect(() => expectNotOffered(prompted, 'c1#0', () => false, { clauseOf })).toThrow(/a prompt names c1#0/);
  });
  it('K661 recipe: clauseOf maps a resolved event to its clause id', () => {
    const sc: Observed = { prompt: null, s: {}, events: [{ t: 'resolved', source: 'c1', clause: 0 }] };
    const of = (x: unknown): string | undefined => {
      const e = x as { t?: string; source?: string; clause?: number };
      return e.t === 'resolved' ? `${String(e.source)}#${String(e.clause)}` : undefined;
    };
    expect(() => expectNotFired(sc, 'c1#0', undefined, undefined, { clauseOf: of })).toThrow(/fired/);
  });
});

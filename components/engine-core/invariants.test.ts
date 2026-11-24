import { describe, expect, it } from 'vitest';
import { stateInvariants } from './tools.ts';
import type { InvariantConfig } from './tools.ts';

interface State { hand: string[]; deck: string[]; count: number; supply: number; done: boolean; idle: boolean; tasks: number }
interface Content { ids: string[]; total: number }
const config: InvariantConfig<State, Content> = {
  zones: { cards: { locations: s => ({ hand: s.hand, deck: s.deck }), expected: (_s, c) => c.ids } },
  counters: s => ({ count: s.count, supply: s.supply }),
  totals: { tokens: { actual: s => s.count + s.supply, expected: (_s, c) => c.total } },
  flags: s => ({ done: s.done }),
  queues: s => ({ idle: s.idle, pending: { tasks: s.tasks } }),
};
const content = { ids: ['a','b'], total: 5 };
const initial: State = { hand: ['a'], deck: ['b'], count: 1, supply: 4, done: false, idle: true, tasks: 0 };
const check = stateInvariants(config);
describe('K592 state invariants', () => {
  it('allows legal movement, conserved spending and first setting of permanent flags', () => {
    const next = { ...initial, hand: ['a','b'], deck: [], count: 2, supply: 3, done: true };
    expect(check(initial, content, [])).toEqual([]);
    expect(check(next, content, [], initial)).toEqual([]);
  });
  it('finds duplicate, missing and foreign instances, including duplicates in a single zone', () => {
    const issues = check({ ...initial, hand: ['a','a','x'], deck: ['a'] }, content, []);
    expect(issues.filter(x => x.id === 'zone:cards')).toHaveLength(4);
    expect(issues.map(x => x.message)).toContain('missing "b"');
    expect(issues.map(x => x.message)).toContain('unexpected "x"');
  });
  it('finds invalid counters and nonconservation without relying on a previous state', () => {
    for (const count of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(check({ ...initial, count }, content, []).map(x => x.id)).toContain('counter:count');
    }
    expect(check({ ...initial, supply: 3 }, content, []).map(x => x.id)).toContain('total:tokens');
  });
  it('rejects unsetting permanent flags and a pending queue only at idle', () => {
    const prev = { ...initial, done: true };
    expect(check({ ...initial, tasks: 2 }, content, [], prev).map(x => x.id)).toEqual(['flag:done','queue:tasks']);
    expect(check({ ...prev, idle: false, tasks: 2 }, content, [], prev)).toEqual([]);
    expect(check({ ...prev, idle: false, tasks: -1 }, content, [], prev).map(x => x.id)).toEqual(['queue:tasks']);
  });
  it('accepts optional selectors and does not retain state across simulations', () => {
    expect(stateInvariants<State, Content>({})(initial, content, [])).toEqual([]);
    expect(check({ ...initial, done: true }, content, [])).toEqual([]);
    expect(check(initial, content, [])).toEqual([]);
  });
});

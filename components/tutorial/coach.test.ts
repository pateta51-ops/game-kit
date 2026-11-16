import { describe, expect, it } from 'vitest';
import { nextTip, seenStore, suggest, type Tip } from './coach';

type S = { row: number };
const tips: Tip<S, string>[] = [
  { id: 'hit', title: 'Hit', text: 'Ouch', when: (e) => e.includes('hit'), targets: ['damage'] },
  { id: 'fold', title: 'Fold', text: 'Rows fold', when: (_e, s) => s.row >= 2, situational: true },
];
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('coach (K170)', () => {
  it('shows the first unseen tip the last action made relevant, in list order', () => {
    expect(nextTip(tips, ['hit'], { row: 3 }, new Set())).toEqual({ id: 'hit', title: 'Hit', text: 'Ouch', targets: ['damage'] });
    expect(nextTip(tips, ['hit'], { row: 3 }, new Set(['hit']))?.id).toBe('fold');
    expect(nextTip(tips, [], { row: 0 }, new Set())).toBeNull();
  });
  it('holds situational tips back during a lesson', () => {
    expect(nextTip(tips, [], { row: 3 }, new Set(), true)).toBeNull();
    expect(nextTip(tips, ['hit'], { row: 3 }, new Set(), true)?.id).toBe('hit');
  });
  it('suggests the driver’s move with at most maxWhy reasons', () => {
    const coach = { choose: (s: S) => (s.row ? `go:${s.row}` : undefined), explain: (_s: S, id: string) => ({ text: id, why: ['a', 'b', 'c'], targets: ['x'] }), maxWhy: 2 };
    expect(suggest(coach, { row: 1 })).toEqual({ choiceId: 'go:1', text: 'go:1', why: ['a', 'b'], targets: ['x'] });
    expect(suggest(coach, { row: 0 })).toBeNull();
    expect(suggest({ ...coach, explain: () => null }, { row: 1 })).toBeNull();
  });
  it('keeps seen ids per key and survives bad storage', () => {
    const st = mem();
    const a = seenStore('k', st);
    a.mark('hit');
    a.mark('hit');
    expect([...seenStore('k', st).seen()]).toEqual(['hit']);
    expect(seenStore('other', st).seen().size).toBe(0);
    a.reset();
    expect(seenStore('k', st).seen().size).toBe(0);
    st.setItem('bad', '{');
    expect(seenStore('bad', st).seen().size).toBe(0);
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(() => seenStore('z', full).mark('a')).not.toThrow();
  });
});

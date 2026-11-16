import { describe, expect, it } from 'vitest';
import { calloutsFor, createEarnStore, detectFeats, emptyFeatState, feedFeats, makeSummary, type FeatDef } from './index.ts';

type Ev = { t: 'kill'; foe: string };
const track = (e: Ev) => ({ counts: { kills: 1 }, seen: { foes: [e.foe] } });
const defs: FeatDef<Ev>[] = [
  { id: 'k3', name: 'Three', text: 'Defeat 3.', family: 'f', points: 5, test: (s) => (s.counts['kills'] ?? 0) >= 3 },
  { id: 'both', name: 'Both', text: 'a and b.', family: 'f', points: 5, test: (s) => (s.seen['foes'] ?? []).length >= 2 },
];
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const g = (at: number, result: 'win' | 'loss', counts: Record<string, number> = {}) => makeSummary({ id: String(at), at, result, rounds: 1, counts, sets: {} });

describe('feats', () => {
  it('feeds counters and seen-sets without touching the old state (undo)', () => {
    const s0 = emptyFeatState();
    const s1 = feedFeats(s0, { t: 'kill', foe: 'a' }, track);
    const s2 = feedFeats(s1, { t: 'kill', foe: 'a' }, track);
    expect(s2.counts['kills']).toBe(2);
    expect(s2.seen['foes']).toEqual(['a']);
    expect(s1.counts['kills']).toBe(1);
    expect(s0.counts).toEqual({});
  });
  it('detects a feat once the state qualifies, skipping owned ones', () => {
    let s = emptyFeatState();
    const ev: Ev = { t: 'kill', foe: 'a' };
    for (const f of ['a', 'b']) s = feedFeats(s, { t: 'kill', foe: f }, track);
    expect(detectFeats(defs, s, ev, [])).toEqual(['both']);
    s = feedFeats(s, ev, track);
    expect(detectFeats(defs, s, ev, [])).toEqual(['k3', 'both']);
    expect(detectFeats(defs, s, ev, ['both'])).toEqual(['k3']);
  });
  it('stores an earn once, outside the game state, and fills checklists across games', () => {
    const st = mem();
    const a = createEarnStore(st, 'e');
    expect(a.award(['k3', 'k3'])).toEqual(['k3']);
    expect(createEarnStore(st, 'e').award(['k3', 'both'])).toEqual(['both']);
    expect(a.list()).toEqual(['k3', 'both']);
    a.tick('heroes', ['x']);
    expect(createEarnStore(st, 'e').tick('heroes', ['y', 'x'])).toEqual(['x', 'y']);
    expect(a.ticks('heroes')).toEqual(['x', 'y']);
    expect(createEarnStore(mem(), 'e').list()).toEqual([]);
  });
  it('call-outs: first defeat, streak, record', () => {
    expect(calloutsFor([g(1, 'win')], g(2, 'loss'))).toEqual([{ kind: 'firstLoss' }]);
    expect(calloutsFor([g(1, 'loss'), g(2, 'win')], g(3, 'loss'))).toEqual([]);
    expect(calloutsFor([g(1, 'win'), g(2, 'win')], g(3, 'win'))).toEqual([{ kind: 'streak', n: 3 }]);
    expect(calloutsFor([g(1, 'win'), g(2, 'loss'), g(3, 'win')], g(4, 'win'))).toEqual([]);
    expect(calloutsFor([g(1, 'win'), g(2, 'win'), g(3, 'win')], g(4, 'win'))).toEqual([{ kind: 'streak', n: 4 }]);
    expect(calloutsFor([g(1, 'win'), g(2, 'win'), g(3, 'win'), g(4, 'win'), g(5, 'loss'), g(6, 'win'), g(7, 'win'), g(8, 'win')], g(9, 'win'))).toEqual([]);
    const r = (x: { counts: Record<string, number> }) => x.counts['k'] ?? 0;
    expect(calloutsFor([g(1, 'loss', { k: 2 })], g(2, 'loss', { k: 5 }), { record: r })).toEqual([{ kind: 'record', n: 5 }]);
    expect(calloutsFor([], g(1, 'win'), { record: r })).toEqual([]);
  });
});

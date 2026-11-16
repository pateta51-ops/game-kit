import { describe, expect, it } from 'vitest';
import { countDeltas, beatsFromEvents } from './beats.ts';
import { createSlotHold, entryMotions, moveEnds, resolveRect, type Rect } from './slots.ts';
import { BUDGET, capN, hash, sparkPoints } from './particles.ts';

const R = (x: number): Rect => ({ x, y: 0, w: 10, h: 10 });
const anch = (cards: Record<string, Rect>, piles: Record<string, Rect>, hosts: Record<string, string>) => ({
  card: (id: string) => cards[id], pile: (id: string) => piles[id], host: (id: string) => hosts[id],
});

describe('K145 slots and anchors', () => {
  it('a slot is held until its latest time, tightened, or released', () => {
    const h = createSlotHold();
    h.hold('a', 500);
    expect(h.held('a', 100)).toBe(true);
    h.tighten('a', 300);
    h.tighten('a', 900);
    expect(h.held('a', 300)).toBe(false);
    h.hold('b', 500);
    h.release('b');
    expect(h.held('b', 0)).toBe(false);
  });
  it('rect chain: card, pile, host, none', () => {
    const a = anch({ c: R(1) }, { p: R(2) }, { att: 'c', ghost: 'nowhere' });
    expect(resolveRect('c', a)).toEqual(R(1));
    expect(resolveRect('p', a)).toEqual(R(2));
    expect(resolveRect('att', a)).toEqual(R(1));
    expect(resolveRect('ghost', a)).toBeUndefined();
    expect(moveEnds('c', a, anch({}, {}, {})).kind).toBe('vanish');
    expect(moveEnds('c', anch({}, {}, {}), a).kind).toBe('appear');
    expect(moveEnds('zz', a, a).kind).toBe('none');
    expect(moveEnds('c', a, a).kind).toBe('move');
  });
  it('entry description: stagger capped, flip, ghosts', () => {
    const prev = { a: { rect: R(0), faceUp: false }, gone: { rect: R(5) }, same: { rect: R(7) } };
    const next: Record<string, { rect: Rect; faceUp?: boolean }> = { a: { rect: R(20), faceUp: true }, same: { rect: R(7) } };
    for (let i = 0; i < 7; i += 1) next['n' + String(i)] = { rect: R(i + 30) };
    const { moves, ghosts } = entryMotions(prev, next, { origin: R(99), land: () => 'pop', leave: () => 'glide' });
    expect(moves.find((m) => m.id === 'same')).toBeUndefined();
    expect(moves[0]).toMatchObject({ id: 'a', flip: true, delay: 0, arc: 24, land: 'pop' });
    expect(moves.at(-1)?.delay).toBe(360);
    expect(moves.at(-1)?.from).toEqual(R(99));
    expect(ghosts).toEqual([{ id: 'gone', rect: R(5), style: 'glide' }]);
  });
  it('beats from one table, fallback word, off-screen skipped', () => {
    type E = { kind: string; n?: number; who: string };
    const ev: E[] = [{ kind: 'dmg', n: 4, who: 'a' }, { kind: 'dmg', n: 1, who: 'off' }, { kind: 'ability', who: 'a' }];
    const { beats, skipped } = beatsFromEvents<E>(ev, { dmg: (e) => ({ anchor: e.who, text: `−${String(e.n)}`, tone: 'harm' }) }, {
      fallback: (e) => ({ anchor: e.who, text: 'RESOLVED', tone: 'info' }),
      rectOf: (a) => (a === 'off' ? undefined : R(1)),
    });
    expect(beats.map((b) => b.text)).toEqual(['−4', 'RESOLVED']);
    expect(skipped).toHaveLength(1);
  });
  it('deltas by subtracting two states', () => {
    const d = countDeltas({ hp: 5, threat: 1, same: 2 }, { hp: 3, threat: 3, same: 2, fresh: 9 }, { harmWhenUp: (k) => k === 'threat' });
    expect(d.map((x) => [x.key, x.text, x.tone, x.from])).toEqual([['hp', '−2', 'harm', 5], ['threat', '+2', 'harm', 1]]);
    expect(countDeltas({ hp: 1 }, { hp: 4 })[0]?.tone).toBe('gain');
  });
});

describe('K146 particles as data with a budget', () => {
  const o = { seed: 3, n: 200, x: 10, y: 10, t0: 0, stagger: 50 };
  it('sparkPoints is a pure function of t and seed', () => {
    expect(sparkPoints(100, o)).toEqual(sparkPoints(100, o));
    expect(sparkPoints(100, o).length).toBeGreaterThan(0);
    expect(sparkPoints(5000, o)).toEqual([]);
  });
  it('budget caps alive particles', () => {
    expect(capN(500)).toBe(BUDGET);
    expect(sparkPoints(60, { ...o, max: 70 }).length).toBeLessThanOrEqual(70);
    expect(sparkPoints(60, o).length).toBeGreaterThan(70);
  });
  it('hash is stable and in range', () => {
    expect(hash(1, 2)).toBe(hash(1, 2));
    expect(hash(1, 2)).not.toBe(hash(1, 3));
    expect(hash(7, 7)).toBeGreaterThanOrEqual(0);
    expect(hash(7, 7)).toBeLessThan(1);
  });
});

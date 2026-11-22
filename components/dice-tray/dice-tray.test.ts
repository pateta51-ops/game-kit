import { describe, expect, it } from 'vitest';
import { adjust, heldDice, newTray, readRoll, remove, roll, rollWith, step, toggleHold, values } from './index.ts';

const seq = (xs: number[]) => { let i = 0; return { int: (max: number) => (xs[i++] ?? 0) % max } };

describe('dice-tray', () => {
  it('rolls through rng.int and skips held dice', () => {
    let t = newTray([6, 6, { sides: 10, kind: 'bonus' }]);
    t = roll(t, seq([0, 5, 9])).tray;
    expect(values(t)).toEqual([1, 6, 10]);
    t = toggleHold(t, 1);
    const r = roll(t, seq([2, 3]));
    expect(r.rolled).toEqual([0, 2]);
    expect(values(r.tray)).toEqual([3, 6, 4]);
    expect(heldDice(r.tray).map((d) => d.id)).toEqual([1]);
    expect(r.tray.rolls).toBe(2);
  });
  it('only rerolls the named dice', () => {
    const t = roll(newTray([6, 6]), seq([0, 0])).tray;
    expect(values(roll(t, seq([4]), [1]).tray)).toEqual([1, 5]);
  });
  it('adjusts within range, removes', () => {
    let t = roll(newTray([6, 6]), seq([5, 0])).tray;
    expect(values(adjust(t, 0, 1))).toEqual([6, 1]);
    expect(values(adjust(t, 1, -1))).toEqual([6, 1]);
    expect(values(adjust(t, 1, 1))).toEqual([6, 2]);
    t = remove(t, 0);
    expect(t.dice.length).toBe(1);
  });
  it('reads a roll with its meanings', () => {
    const t = roll(newTray([6, 6, 6]), seq([5, 5, 0])).tray;
    const r = readRoll(t, [{ id: 'pair', label: 'a pair', test: (d) => new Set(d.map((x) => x.value)).size < d.length }, { id: 'none', label: 'x', test: () => false }]);
    expect(r.sum).toBe(13);
    expect(r.first?.label).toBe('a pair');
    expect(r.meanings.length).toBe(1);
  });
  it('hook is optional and called with the rolled ids', () => {
    const seen: number[][] = [];
    rollWith(newTray([6]), seq([0]));
    rollWith(newTray([6, 6]), seq([0, 0]), { onRoll: (r) => seen.push([...r]) });
    expect(seen).toEqual([[0, 1]]);
  });
  it('roll window tap order', () => {
    expect(step(step('idle', 'pickToken'), 'pickDie')).toBe('die');
    expect(step('die', 'back')).toBe('idle');
  });
});

import { adjustId, canReroll, canTapDie, rerollSelected, selectOne, setValue, toggleSelect, winBack, winPickDie, winPickToken, winStart } from './index.ts';
describe('roll window flow (7IS)', () => {
  it('die taps are ignored before a token, then token, die, sign', () => {
    let s = winPickDie(winStart(), 1);
    expect(s).toEqual(winStart());
    expect(canTapDie(s)).toBe(false);
    s = winPickToken(s, 'adj');
    expect(adjustId(s, '+')).toBeNull();
    s = winPickDie(s, 1);
    expect(adjustId(s, '-')).toBe('adj:1:-');
    s = winBack(s);
    expect(s).toEqual({ win: 'idle', token: 'adj', die: null });
  });
  it('select dice to reroll, single select, setValue clamps', () => {
    expect(toggleSelect(toggleSelect([], 2), 2)).toEqual([]);
    expect(canReroll([], 1)).toBe(false);
    expect(selectOne(3, 3)).toBeNull();
    const t = roll(newTray([6, 6, 6]), seq([0, 0, 0])).tray;
    const r = rerollSelected(t, seq([3, 4]), [0, 2]);
    expect(values(r.tray)).toEqual([4, 1, 5]);
    expect(values(setValue(t, 1, 9))).toEqual([1, 6, 1]);
  });
  it('back at idle is a no-op', () => {
    expect(winBack(winStart())).toEqual(winStart());
  });
  it('picking a token after a die keeps the die as 7IS does; adjustId is null until a die is picked again', () => {
    const s = winPickToken(winPickDie(winPickToken(winStart(), 'adj'), 2), 'dieAdj');
    expect(s).toEqual({ win: 'token', token: 'dieAdj', die: 2 });
    expect(adjustId(s, '+')).toBeNull();
  });
  it('setValue on an unrolled die sets it, clamped', () => {
    const t = newTray([6]);
    expect(values(setValue(t, 0, 4))).toEqual([4]);
    expect(values(setValue(t, 0, 0))).toEqual([1]);
  });
  it('K692 named rolls: attack [6,2] and defense [3] are forced, unnamed stays seeded', () => {
    const forced: Record<string, number[]> = { attack: [6, 2], defense: [3] };
    const rng = { int: (max: number, name?: string) => { const q = name ? forced[name] : undefined; return q ? (q.shift() ?? 1) - 1 : max - 1 } };
    expect(values(roll(newTray([6, 6]), rng, undefined, 'attack').tray)).toEqual([6, 2]);
    expect(values(roll(newTray([6]), rng, undefined, 'defense').tray)).toEqual([3]);
    expect(values(roll(newTray([6, 6]), rng).tray)).toEqual([6, 6]);
  });
  it('K692 default path matches main values', () => {
    expect(values(roll(newTray([6, 6, 10]), seq([0, 5, 9])).tray)).toEqual([1, 6, 10]);
  });
});

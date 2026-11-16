// K111: the replacement loop: applied-set, lowest class first, the affected player picks among several, result codes.
import { describe, expect, it } from 'vitest';
import { applyAction, changeOccurrence, draftOf, type Replacement, type ReplaceResult, type TimingConfig } from './index.ts';
import { answer, startTimed, timedGame, type Timed } from './fake/timed.ts';

// fixture cards: Double (p1, x2), Halve (p2, /2 rounded down), Armor (p2, -1, later class), Mirror (heal instead), Absorb, Skip, Idle
const CARDS: Record<string, Replacement> = {
  double: { id: 102, controller: 'p1', cls: 0, label: 'Double' },
  halve: { id: 103, controller: 'p2', cls: 0, label: 'Halve' },
  armor: { id: 101, controller: 'p2', cls: 1, label: 'Armor' },
  mirror: { id: 104, controller: 'p2', cls: 0, label: 'Mirror' },
  absorb: { id: 105, controller: 'p2', cls: 0, label: 'Absorb' },
  skip: { id: 106, controller: 'p2', cls: 0, label: 'Skip' },
  idle: { id: 107, controller: 'p2', cls: 0, label: 'Idle' },
};
const game = (names: string[], extra: Partial<TimingConfig<Timed>> = {}) =>
  timedGame({
    replacementsFor: () => names.map((n) => CARDS[n] as Replacement),
    applyReplacement: (ctx, r, o): ReplaceResult => {
      const a = o.amount ?? 0;
      if (r.label === 'Double') changeOccurrence(ctx, o.id, { amount: a * 2 });
      else if (r.label === 'Halve') changeOccurrence(ctx, o.id, { amount: Math.floor(a / 2) });
      else if (r.label === 'Armor') changeOccurrence(ctx, o.id, { amount: a - 1 });
      else if (r.label === 'Mirror') {
        ctx.then({ kind: 'heal' });
        return 'replaced';
      } else if (r.label === 'Absorb') return 'prevented';
      else if (r.label === 'Skip') return 'skipped';
      else return 'kept';
      return 'updated';
    },
    preventions: () => [{ id: 'shield', prevention: { prevents: 'damage', max: 1 } }],
    ...extra,
  });
const hit = (g: ReturnType<typeof timedGame>) => {
  const s0 = startTimed(g);
  return applyAction(g, s0, answer(s0, 'hit'), null);
};

describe('replacement loop (K111)', () => {
  it('several of the lowest class: the affected player picks; each applies once; then the next class; code updated', () => {
    const g = game(['armor', 'double', 'halve']);
    const s1 = hit(g).state;
    expect(s1.prompt?.player).toBe('p2');
    expect(s1.prompt?.options.map((o) => o.id)).toEqual(['102', '103']);
    expect(s1.timing?.windows).toEqual([{ timing: 'instead', kind: 'damage', batch: 1, occurrence: 2 }]);
    const a = applyAction(g, s1, answer(s1, '102'), null).state; // 3 x2 = 6, /2 = 3, -1 = 2
    expect(a.prompt?.options.map((o) => o.id)).toEqual(['shield', 'pass']);
    expect(a.timing?.occurrences[0]).toMatchObject({ amount: 2, applied: [102, 103, 101], result: 'updated' });
    const b = applyAction(g, s1, answer(s1, '103'), null).state; // 3 /2 = 1, x2 = 2, -1 = 1
    expect(b.timing?.occurrences[0]).toMatchObject({ amount: 1, applied: [103, 102, 101] });
    const done = applyAction(g, b, answer(b, 'pass'), null).state;
    expect(done.hp).toBe(9);
  });

  it('chooser: a game may name another player', () => {
    const s1 = hit(game(['double', 'halve'], { chooser: () => 'p1' })).state;
    expect(s1.prompt?.player).toBe('p1');
  });

  it('replaced: other tasks happen instead and the loop stops', () => {
    const r = hit(game(['mirror', 'armor']));
    expect(r.state.hp).toBe(11);
    expect(r.events).toEqual([{ type: 'healed', n: 1, seq: 1 }]);
    expect(r.state.timing?.occurrences[0]).toMatchObject({ state: 'cancelled', result: 'replaced', applied: [104] });
    expect(r.state.timing?.windows).toEqual([]);
    expect(r.state.result).toEqual({ hp: 11 });
  });

  it('prevented: amount 0, no prevention window, nothing happens; skipped: cancelled', () => {
    const p = hit(game(['absorb']));
    expect(p.state.hp).toBe(10);
    expect(p.events).toEqual([]);
    expect(p.state.timing?.occurrences[0]).toMatchObject({ amount: 0, state: 'cancelled', result: 'prevented' });
    expect(hit(game(['skip'])).state.timing?.occurrences[0]).toMatchObject({ amount: 3, state: 'cancelled', result: 'skipped' });
  });

  it('kept: none applies, or one that changes nothing, applied once (no endless loop)', () => {
    expect(hit(game([])).state.timing?.occurrences[0]).toMatchObject({ result: 'kept', applied: [] });
    const s = hit(game(['idle'])).state;
    expect(s.timing?.occurrences[0]).toMatchObject({ result: 'kept', applied: [107] });
  });

  it('a one-use effect removes itself in its own apply', () => {
    const g = game(['armor'], {
      replacementsFor: (s) => ((s.used['armor'] ?? 0) > 0 ? [] : [CARDS['armor'] as Replacement]),
      applyReplacement: (ctx, _r, o) => {
        draftOf(ctx).used = { armor: 1 };
        changeOccurrence(ctx, o.id, { amount: (o.amount ?? 0) - 1 });
        return 'updated';
      },
    });
    const s1 = hit(g).state;
    expect(s1.used).toEqual({ armor: 1 });
    expect(s1.timing?.occurrences[0]).toMatchObject({ amount: 2, applied: [101] });
  });
});

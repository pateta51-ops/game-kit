// K526: a number with its parts. Cases restated from four games' modifier code on made-up numbers; "case n" is the
// number in the row's case list.
import { describe, expect, it } from 'vitest';
import { addEffect, boundary, effectModifiers, effectsOf, EngineBugError, layered, numberParts, partsDirection, removeEffect, sourceLeft, spendEffect, sumEffects, type ContinuousEffect, type Ctx, type NumberModifier, type NumberOrder, type NumberPart } from './index.ts';
import { startTimed, timedGame, type Timed } from './fake/timed.ts';

const add = (source: string, amount: number, more: Partial<NumberModifier> = {}): NumberModifier => ({ source, op: 'add', amount, ...more });
const set = (source: string, amount: number, more: Partial<NumberModifier> = {}): NumberModifier => ({ source, op: 'set', amount, ...more });
const mul = (source: string, amount: number, more: Partial<NumberModifier> = {}): NumberModifier => ({ source, op: 'multiply', amount, ...more });
const show = (parts: readonly NumberPart[]): string[] => parts.map((p) => `${p.source}:${p.op}:${String(p.amount)}:${String(p.applied)}`);
const total = (parts: readonly NumberPart[]): number => parts.reduce((n, p) => n + p.applied, 0);

const SUM: NumberOrder = { steps: ['set', 'add', 'floor', 'cap'] };
const STAT: NumberOrder = { steps: ['set', 'multiply', 'add', 'floor'] };
const COST: NumberOrder = { steps: ['increase', 'set', 'decrease', 'floor'], setters: 'lowest', setOnlyLowers: true, floor: 0 };
const MINS: NumberOrder = { steps: ['increase', 'decrease'], decreases: 'highestMin' };

describe('numberParts: adds (K526)', () => {
  it('case 1: no modifier gives the base and no parts', () => {
    expect(numberParts(3, [], SUM)).toEqual({ value: 3, base: 3, parts: [] });
  });
  it('case 2: one add', () => {
    const r = numberParts(3, [add('A', 2)], SUM);
    expect(r.value).toBe(5);
    expect(r.parts).toEqual([{ source: 'A', op: 'add', amount: 2, applied: 2 }]);
  });
  it('case 3: adds stack, parts in gather order', () => {
    expect(numberParts(2, [add('A', 1), add('B', 1)], SUM).value).toBe(4);
    const r = numberParts(2, [add('A', 1), add('B', 1), add('C', -1)], SUM);
    expect(r.value).toBe(3);
    expect(show(r.parts)).toEqual(['A:add:1:1', 'B:add:1:1', 'C:add:-1:-1']);
  });
  it('case 4: an add of zero is no part; the option lists it as unchanged', () => {
    const r = numberParts(3, [add('A', 0)], SUM);
    expect(r).toEqual({ value: 3, base: 3, parts: [] });
    expect(numberParts(3, [add('A', 0)], SUM, { unchanged: true }).unchanged).toEqual([{ source: 'A', op: 'add', amount: 0, applied: 0, why: 'same' }]);
  });
  it('case 13: a positive add has no cap unless one is named', () => {
    expect(numberParts(2, [add('A', 5)], SUM).value).toBe(7);
  });
});

describe('numberParts: a reduction with its own minimum (K526)', () => {
  it('case 5: lowers to its minimum at most, never lowers a value at or below it, never raises', () => {
    const a = add('A', -1, { min: 1 });
    expect(numberParts(3, [a], MINS).value).toBe(2);
    expect(numberParts(1, [a], MINS)).toEqual({ value: 1, base: 1, parts: [] });
    expect(numberParts(0, [a], MINS)).toEqual({ value: 0, base: 0, parts: [] });
    const r = numberParts(3, [add('A', -5, { min: 1 })], MINS);
    expect(r.value).toBe(1);
    expect(r.parts).toEqual([{ source: 'A', op: 'add', amount: -5, applied: -2 }]);
  });
  it('case 6: two minimums give the lowest value in either input order (decreases: highestMin)', () => {
    const a = add('A', -2, { min: 1 });
    const b = add('B', -1, { min: 0 });
    for (const ms of [[a, b], [b, a]]) {
      const r = numberParts(3, ms, MINS);
      expect(r.value).toBe(0);
      expect(show(r.parts)).toEqual(['A:add:-2:-2', 'B:add:-1:-1']);
    }
  });
  it('decreases knob: gather order (the default) depends on the input order', () => {
    const a = add('A', -2, { min: 1 });
    const b = add('B', -1, { min: 0 });
    const gather: NumberOrder = { steps: ['increase', 'decrease'] };
    expect(numberParts(3, [a, b], gather).value).toBe(0);
    expect(numberParts(3, [b, a], gather).value).toBe(1);
    expect(numberParts(3, [b, a], { ...gather, decreases: 'gather' }).value).toBe(1);
  });
  it('case 7: a second reduction that changes nothing is not a part', () => {
    const r = numberParts(3, [add('A', -2, { min: 1 }), add('B', -1, { min: 1 })], MINS, { unchanged: true });
    expect(r.value).toBe(1);
    expect(show(r.parts)).toEqual(['A:add:-2:-2']);
    expect(r.unchanged?.map((u) => `${u.source}:${u.why}`)).toEqual(['B:same']);
  });
  it('case 8: increases before reductions', () => {
    const r = numberParts(1, [add('A', -2, { min: 1 }), add('B', 1)], MINS);
    expect(r.value).toBe(1);
    expect(show(r.parts)).toEqual(['B:add:1:1', 'A:add:-2:-1']);
  });
  it('step knob: one add step keeps gather order, so the same input ends higher', () => {
    expect(numberParts(1, [add('A', -2, { min: 1 }), add('B', 1)], { steps: ['add'] }).value).toBe(2);
  });
});

describe('numberParts: floors and caps (K526)', () => {
  const F1: NumberOrder = { steps: ['add', 'floor'], floor: 1 };
  it('case 9: the shared floor applies once after the sum, not between steps', () => {
    const r = numberParts(2, [add('A', -1), add('B', -1), add('C', 1)], F1);
    expect(r.value).toBe(1);
    expect(r.bound).toBeUndefined();
  });
  it('case 10: opposite adds cancel under the floor', () => {
    expect(numberParts(1, [add('A', 1), add('B', -1)], F1).value).toBe(1);
  });
  it('case 11: two floors named: the highest holds once after the sum; own minimums each hold their own', () => {
    const w = numberParts(4, [add('A', -1), { source: 'A', op: 'floor', amount: 1 }, add('B', -1), { source: 'B', op: 'floor', amount: 3 }], SUM, { unchanged: true });
    expect(w.value).toBe(3);
    expect(w.bound).toEqual({ source: 'B', op: 'floor', amount: 3, applied: 1 });
    expect(w.parts.at(-1)).toEqual(w.bound);
    expect(w.unchanged).toEqual([{ source: 'A', op: 'floor', amount: 1, applied: 0, why: 'outranked' }]);
    expect(numberParts(4, [add('A', -1, { min: 1 }), add('B', -1, { min: 3 })], MINS).value).toBe(2);
  });
  it('case 12: a floor on one stat does not hold up another', () => {
    const ms: NumberModifier[] = [add('A', -3), { source: 'T', op: 'floor', amount: 1, of: 'hp' }];
    expect(numberParts(2, ms, SUM, { of: 'hp' }).value).toBe(1);
    expect(numberParts(2, ms, SUM, { of: 'speed' }).value).toBe(-1);
  });
  it('case 14: a cost cannot go below zero, and the floor is a part so the parts still sum', () => {
    const r = numberParts(2, [add('A', -4)], COST);
    expect(r.value).toBe(0);
    expect(show(r.parts)).toEqual(['A:add:-4:-4', 'floor:floor:0:2']);
    expect(r.bound).toEqual({ source: 'floor', op: 'floor', amount: 0, applied: 2 });
    expect(r.base + total(r.parts)).toBe(0);
  });
  it('a floor named by a modifier holds at every floor step, like the default floor', () => {
    const steps: NumberOrder['steps'] = ['add', 'floor', 'multiply', 'floor'];
    const ms = [add('A', -2), mul('H', 0.5)];
    const named = numberParts(3, [...ms, { source: 'F', op: 'floor', amount: 2 }], { steps, round: 'down' }, { unchanged: true });
    expect(named.value).toBe(2);
    expect(show(named.parts)).toEqual(['A:add:-2:-2', 'F:floor:2:1', 'H:multiply:0.5:-1', 'F:floor:2:1']);
    expect(named.unchanged).toEqual([]);
    expect(numberParts(3, ms, { steps, round: 'down', floor: 2 }).value).toBe(2);
    const idle = numberParts(9, [add('A', -2), { source: 'F', op: 'floor', amount: 2 }], { steps }, { unchanged: true });
    expect(idle.unchanged).toEqual([{ source: 'F', op: 'floor', amount: 2, applied: 0, why: 'same' }]);
    const late = numberParts(5, [add('A', -2), mul('H', 0.5), { source: 'F', op: 'floor', amount: 2 }], { steps, round: 'down' }, { unchanged: true });
    expect(show(late.parts)).toEqual(['A:add:-2:-2', 'H:multiply:0.5:-2', 'F:floor:2:1']);
    expect(late.unchanged).toEqual([]);
  });
  it('a floor always holds: a base under the default floor is raised with no modifier, and the floor is a part', () => {
    const r = numberParts(-1, [], COST);
    expect(r.value).toBe(0);
    expect(r.parts).toEqual([{ source: 'floor', op: 'floor', amount: 0, applied: 1 }]);
    expect(r.bound).toEqual(r.parts[0]);
  });
  it('an add of zero is accepted by either split step', () => {
    expect(numberParts(3, [add('A', 0)], { steps: ['decrease'] }, { unchanged: true })).toEqual({ value: 3, base: 3, parts: [], unchanged: [{ source: 'A', op: 'add', amount: 0, applied: 0, why: 'same' }] });
    expect(numberParts(3, [add('A', 0)], { steps: ['increase'] }).value).toBe(3);
    expect(numberParts(3, [add('A', 0)], { steps: ['increase', 'decrease'] }, { unchanged: true }).unchanged).toHaveLength(1);
  });
  it('floor knob: no default floor lets the value go below zero', () => {
    expect(numberParts(2, [add('A', -4)], SUM).value).toBe(-2);
  });
  it('a cap that bites is named in the parts, by the source that set it', () => {
    const r = numberParts(4, [add('A', 3), { source: 'Wall', op: 'cap', amount: 5 }], SUM);
    expect(r.value).toBe(5);
    expect(show(r.parts)).toEqual(['A:add:3:3', 'Wall:cap:5:-2']);
    expect(r.bound).toEqual({ source: 'Wall', op: 'cap', amount: 5, applied: -2 });
  });
  it('cap knob: the default cap bites under the name "cap"; of two caps the lowest holds; a cap that does not bite is no part', () => {
    expect(numberParts(4, [add('A', 3)], { ...SUM, cap: 6 }).bound).toEqual({ source: 'cap', op: 'cap', amount: 6, applied: -1 });
    expect(numberParts(4, [add('A', 3), { source: 'Wall', op: 'cap', amount: 5 }], { ...SUM, cap: 6 }).bound?.source).toBe('Wall');
    expect(numberParts(4, [add('A', 3), { source: 'Wall', op: 'cap', amount: 9 }], { ...SUM, cap: 6 }).bound?.source).toBe('cap');
    const r = numberParts(4, [add('A', 1), { source: 'Wall', op: 'cap', amount: 9 }], SUM, { unchanged: true });
    expect(r.parts).toHaveLength(1);
    expect(r.bound).toBeUndefined();
    expect(r.unchanged?.map((u) => `${u.source}:${u.why}`)).toEqual(['Wall:same']);
  });
  it('a default floor or cap with no such step in the order is an engine bug, and so is a modifier whose operation has no step', () => {
    expect(() => numberParts(2, [], { steps: ['add'], floor: 0 })).toThrow(EngineBugError);
    expect(() => numberParts(2, [], { steps: ['add'], cap: 9 })).toThrow(EngineBugError);
    expect(() => numberParts(2, [set('A', 1)], { steps: ['add'] })).toThrow(EngineBugError);
    expect(() => numberParts(2, [add('A', -1)], { steps: ['increase'] })).toThrow(EngineBugError);
  });
});

describe('numberParts: setters (K526)', () => {
  it('case 16: a set replaces, lower or higher', () => {
    const r = numberParts(4, [set('A', 1)], SUM);
    expect(r.value).toBe(1);
    expect(r.parts).toEqual([{ source: 'A', op: 'set', amount: 1, applied: -3 }]);
    expect(numberParts(4, [set('A', 6)], SUM).value).toBe(6);
  });
  it('case 17: set then add, whichever was gathered first', () => {
    for (const ms of [[set('A', 1), add('B', 2)], [add('B', 2), set('A', 1)]]) {
      const r = numberParts(4, ms, SUM);
      expect(r.value).toBe(3);
      expect(show(r.parts)).toEqual(['A:set:1:-3', 'B:add:2:2']);
    }
  });
  it('case 18: increase, then a set that only lowers, then decreases', () => {
    const r = numberParts(3, [add('A', 2), set('B', 1)], COST);
    expect(r.value).toBe(1);
    expect(show(r.parts)).toEqual(['A:add:2:2', 'B:set:1:-4']);
    expect(numberParts(0, [set('B', 1)], COST)).toEqual({ value: 0, base: 0, parts: [] });
    expect(numberParts(3, [set('B', 1), add('C', -1)], COST).value).toBe(0);
  });
  it('setOnlyLowers knob: off, a set may raise; on, it may not', () => {
    expect(numberParts(3, [set('A', 5)], { steps: ['set'] }).value).toBe(5);
    expect(numberParts(3, [set('A', 5)], { steps: ['set'], setOnlyLowers: false }).value).toBe(5);
    expect(numberParts(3, [set('A', 5)], { steps: ['set'], setOnlyLowers: true }).value).toBe(3);
  });
  it('case 19, setters knob: last (the default), lowest, highest', () => {
    const ab = [set('A', 5), set('B', 2)];
    const ba = [set('A', 2), set('B', 5)];
    const v = (ms: NumberModifier[], setters?: NumberOrder['setters']): number => numberParts(4, ms, { steps: ['set'], ...(setters === undefined ? {} : { setters }) }).value;
    expect([v(ab), v(ba)]).toEqual([2, 5]);
    expect([v(ab, 'last'), v(ba, 'last')]).toEqual([2, 5]);
    expect([v(ab, 'lowest'), v(ba, 'lowest')]).toEqual([2, 2]);
    expect([v(ab, 'highest'), v(ba, 'highest')]).toEqual([5, 5]);
    const r = numberParts(4, ab, { steps: ['set'], setters: 'highest' }, { unchanged: true });
    expect(show(r.parts)).toEqual(['A:set:5:1']);
    expect(r.unchanged).toEqual([{ source: 'B', op: 'set', amount: 2, applied: 0, why: 'outranked' }]);
  });
  it('two setters with "lowest wins", then adds, then a floor of 1', () => {
    const r = numberParts(5, [set('A', 3), set('B', 1), add('C', -2)], { steps: ['set', 'add', 'floor'], setters: 'lowest', floor: 1 });
    expect(r.value).toBe(1);
    expect(show(r.parts)).toEqual(['B:set:1:-4', 'C:add:-2:-2', 'floor:floor:1:2']);
    expect(r.bound?.source).toBe('floor');
  });
  it('case 22: a setter skipped by its scope or its condition does not hide an earlier one, and a set does not erase adds', () => {
    const o: NumberOrder = { steps: ['set', 'add'] };
    expect(numberParts(4, [set('A', 2), set('B', 7, { of: 'other' })], o, { of: 'hp' }).value).toBe(2);
    expect(numberParts(4, [add('C', 1), set('A', 2), set('B', 7, { when: 'never' })], o, { conditions: { never: () => false } }).value).toBe(3);
  });
});

describe('numberParts: multipliers (K526)', () => {
  it('case 23: a multiplier between set and add', () => {
    const r = numberParts(3, [add('B', 1), mul('A', 2)], STAT);
    expect(r.value).toBe(7);
    expect(show(r.parts)).toEqual(['A:multiply:2:3', 'B:add:1:1']);
  });
  it('case 24, multiplier position knob: after add and floor', () => {
    const late: NumberOrder = { steps: ['set', 'add', 'floor', 'multiply'], floor: 0, round: 'up' };
    expect(numberParts(5, [set('A', 1), add('B', -2), mul('C', 0.5)], late).value).toBe(0);
    expect(numberParts(3, [add('B', 1), mul('A', 2)], late).value).toBe(8);
  });
  it('case 25, rounding knob: up or down in the order; a modifier that names its own rounding wins; none named: no rounding', () => {
    const o: NumberOrder = { steps: ['multiply'] };
    expect(numberParts(5, [mul('A', 0.5)], { ...o, round: 'up' }).value).toBe(3);
    expect(numberParts(5, [mul('A', 0.5)], { ...o, round: 'down' }).value).toBe(2);
    expect(numberParts(5, [mul('A', 0.5, { round: 'down' })], { ...o, round: 'up' }).value).toBe(2);
    expect(numberParts(5, [mul('A', 0.5)], o).value).toBe(2.5);
  });
  it('case 26: doubling, and the parts sum', () => {
    const r = numberParts(4, [mul('A', 2)], STAT);
    expect(r.value).toBe(8);
    expect(r.base + total(r.parts)).toBe(8);
  });
});

describe('numberParts: scope, conditions, counts (K526)', () => {
  it('case 27: a reduction per counted unit, by the count it names', () => {
    const ms = [add('A', -2, { per: 'units' })];
    const counts = (n: number) => ({ counts: { units: () => n, worth: () => 99 } });
    expect(numberParts(10, ms, COST, counts(4)).value).toBe(2);
    const r = numberParts(10, ms, COST, counts(6));
    expect(r.value).toBe(0);
    expect(show(r.parts)).toEqual(['A:add:-12:-12', 'floor:floor:0:2']);
    expect(() => numberParts(10, ms, COST)).toThrow(EngineBugError);
  });
  it('cases 28, 29, 34: a modifier scoped to another line, kind or cost is neither a part nor listed as unchanged', () => {
    const cost = { X: 3, Y: 2 };
    const line = (ms: NumberModifier[]) => Object.fromEntries(Object.entries(cost).map(([of, n]) => [of, numberParts(n, ms, COST, { of, unchanged: true })]));
    const each = line([add('A', -1)]);
    expect([each.X?.value, each.Y?.value]).toEqual([2, 1]);
    const one = line([add('A', -1, { of: 'X' })]);
    expect([one.X?.value, one.Y?.value]).toEqual([2, 2]);
    expect(one.Y).toEqual({ value: 2, base: 2, parts: [], unchanged: [] });
    expect(numberParts(3, [add('A', -1, { of: 'play' })], COST)).toEqual({ value: 3, base: 3, parts: [] });
  });
  it('case 30: a modifier whose condition is false is absent from the parts, and listed as unchanged when the option asks', () => {
    const ms = [add('A', 2, { when: 'night' }), add('B', 1)];
    const conditions = { night: () => false };
    const r = numberParts(3, ms, SUM, { conditions });
    expect(r).toEqual({ value: 4, base: 3, parts: [{ source: 'B', op: 'add', amount: 1, applied: 1 }] });
    expect(numberParts(3, ms, SUM, { conditions, unchanged: true }).unchanged).toEqual([{ source: 'A', op: 'add', amount: 2, applied: 0, why: 'condition' }]);
    expect(numberParts(3, ms, SUM, { conditions: { night: (m) => m.source === 'A' } }).value).toBe(6);
    expect(() => numberParts(3, ms, SUM)).toThrow(EngineBugError);
  });
  it('case 35: payment reads the modified cost: a raised cost blocks a payer who could pay the printed one', () => {
    const have = 3;
    const cost = numberParts(3, [add('Tax', 1)], COST).value;
    expect(cost).toBe(4);
    expect(have >= cost).toBe(false);
  });
  it('case 36: direction of the parts', () => {
    expect(partsDirection(numberParts(3, [add('A', -1), add('B', -1)], SUM).parts)).toBe('lower');
    expect(partsDirection(numberParts(3, [add('A', 1)], SUM).parts)).toBe('higher');
    expect(partsDirection(numberParts(3, [add('A', 2), add('B', -1)], SUM).parts)).toBe('mixed');
    expect(partsDirection([])).toBeUndefined();
  });
  it('case 38: for every input the base plus the applied changes is the final value, and no part changed nothing', () => {
    const pool: NumberModifier[] = [add('a', 2), add('b', -3), add('c', -2, { min: 1 }), set('d', 1), set('e', 6), mul('f', 2), mul('g', 0.5), { source: 'h', op: 'floor', amount: 2 }, { source: 'i', op: 'cap', amount: 4 }];
    const orders: NumberOrder[] = [
      { steps: ['set', 'multiply', 'add', 'floor', 'cap'], round: 'up' },
      { steps: ['increase', 'set', 'decrease', 'floor', 'cap', 'multiply'], setters: 'lowest', setOnlyLowers: true, floor: 0, round: 'down' },
      { steps: ['cap', 'add', 'set', 'multiply', 'floor'], setters: 'highest', decreases: 'highestMin', cap: 7, round: 'down' },
    ];
    let n = 0;
    for (let mask = 0; mask < 1 << pool.length; mask += 1) {
      const ms = pool.filter((_, i) => (mask >> i) & 1);
      for (const order of orders) for (const base of [0, 3, 9]) {
        const r = numberParts(base, ms, order, { unchanged: true });
        expect(r.base + total(r.parts)).toBe(r.value);
        expect(r.parts.every((p) => p.applied !== 0)).toBe(true);
        expect(r.parts.length + (r.unchanged?.length ?? 0)).toBe(ms.length + r.parts.filter((p) => p.source === 'floor' || p.source === 'cap').length);
        n += 1;
      }
    }
    expect(n).toBe(512 * 9);
  });
});

describe('numberParts over the lasting effects (K526)', () => {
  const play = (f: (ctx: Ctx<Timed>) => void): void => void startTimed(timedGame({}, { turn: f }));
  const toMod = (e: ContinuousEffect): NumberModifier | undefined => (typeof e.value === 'number' ? { source: e.source, op: e.kind === 'cost.set' ? 'set' : 'add', amount: e.value } : undefined);
  const cost = (ctx: Ctx<Timed>, printed: readonly NumberModifier[] = []) => numberParts(3, [...printed, ...effectModifiers(ctx.s, toMod, undefined, (e) => e.kind.startsWith('cost'))], COST);

  it('printed modifiers first, then the active effects oldest first; effectsOf, sumEffects and layered read the same effects as before', () => {
    play((ctx) => {
      addEffect(ctx, { kind: 'cost', source: 'late', value: -1, layer: 'l', duration: { until: 'game' } });
      addEffect(ctx, { kind: 'cost.set', source: 'cheap', value: 2, duration: { until: 'game' } });
      addEffect(ctx, { kind: 'word', source: 'w', value: 'x', duration: { until: 'game' } });
      const r = cost(ctx, [add('printed', 1)]);
      expect(r.value).toBe(1);
      expect(show(r.parts)).toEqual(['printed:add:1:1', 'cheap:set:2:-2', 'late:add:-1:-1']);
      expect(effectsOf(ctx.s).map((e) => e.source)).toEqual(['late', 'cheap', 'w']);
      expect(sumEffects(ctx.s, 'cost')).toBe(-1);
      expect(layered(ctx.s, 3, { layers: ['l'], apply: (v, e) => v + (e.value as number) })).toBe(2);
    });
  });
  it('case 31: a modifier whose source left play, or whose lasting effect has ended, contributes nothing at the next read', () => {
    play((ctx) => {
      const turn = addEffect(ctx, { kind: 'cost', source: 'spell', value: -1, duration: { until: 'endOfTurn' } });
      addEffect(ctx, { kind: 'cost', source: 'unit', value: -1, duration: { while: 'sourceInPlay' } });
      const gone = addEffect(ctx, { kind: 'cost', source: 'aura', value: 2, duration: { until: 'game' } });
      expect(turn).toBeGreaterThan(0);
      expect(show(cost(ctx).parts)).toEqual(['aura:add:2:2', 'spell:add:-1:-1', 'unit:add:-1:-1']);
      sourceLeft(ctx, 'unit');
      expect(show(cost(ctx).parts)).toEqual(['aura:add:2:2', 'spell:add:-1:-1']);
      boundary(ctx, { kind: 'turnEnd' });
      expect(show(cost(ctx).parts)).toEqual(['aura:add:2:2']);
      removeEffect(ctx, gone);
      expect(cost(ctx)).toEqual({ value: 3, base: 3, parts: [] });
    });
  });
  it('case 33: a "next one" modifier is spent on first use; the second read gives the plain value', () => {
    play((ctx) => {
      const id = addEffect(ctx, { kind: 'cost', source: 'coupon', value: -2, duration: { until: 'used', uses: 1 } });
      expect(cost(ctx).value).toBe(1);
      spendEffect(ctx, id);
      expect(cost(ctx).value).toBe(3);
    });
  });
  it('a conditional effect follows the kernel\'s condition table, and a blanked source is skipped', () => {
    play((ctx) => {
      addEffect(ctx, { kind: 'cost', source: 'a', value: -1, when: 'hurt', duration: { until: 'game' } });
      addEffect(ctx, { kind: 'cost', source: 'b', value: -1, duration: { until: 'game' } });
      const v = (hurt: boolean, blanked: string[]): number =>
        numberParts(3, effectModifiers(ctx.s, toMod, 'cost', undefined, { conditions: { hurt: () => hurt }, blanked: () => blanked }), COST).value;
      expect([v(true, []), v(false, []), v(true, ['b']), v(false, ['b'])]).toEqual([1, 2, 2, 3]);
    });
  });
  it('one effect may map onto several modifiers', () => {
    play((ctx) => {
      addEffect(ctx, { kind: 'armor', source: 'plate', value: 2, duration: { until: 'game' } });
      const ms = effectModifiers(ctx.s, (e) => [{ source: e.source, op: 'add', amount: e.value as number }, { source: e.source, op: 'cap', amount: 4 }], 'armor');
      expect(show(numberParts(3, ms, SUM).parts)).toEqual(['plate:add:2:2', 'plate:cap:4:-1']);
    });
  });
});

// K582: reports made true, silent drops reported, edge values. Each case is on made-up numbers.
describe('numberParts: every bound that bit, and whether it holds (K582)', () => {
  const COUNT: NumberOrder = { steps: ['floor', 'add', 'cap'], floor: 0, cap: 6 };
  it('order floor, add, cap on a base below zero: the floor bit but does not hold on the final value', () => {
    const r = numberParts(-2, [add('R', 2)], COUNT);
    expect(r.value).toBe(2);
    expect(show(r.parts)).toEqual(['floor:floor:0:2', 'R:add:2:2']);
    expect(r.bound).toEqual({ source: 'floor', op: 'floor', amount: 0, applied: 2 });
    expect(r.bounds).toEqual([{ source: 'floor', op: 'floor', amount: 0, applied: 2, holds: false }]);
  });
  it('both bounds bit: both are listed in the order they bit, and only the cap holds', () => {
    const r = numberParts(-2, [add('R', 9)], COUNT);
    expect(r.value).toBe(6);
    expect(show(r.parts)).toEqual(['floor:floor:0:2', 'R:add:9:9', 'cap:cap:6:-3']);
    expect(r.bound?.source).toBe('cap');
    expect(r.bounds).toEqual([
      { source: 'floor', op: 'floor', amount: 0, applied: 2, holds: false },
      { source: 'cap', op: 'cap', amount: 6, applied: -3, holds: true },
    ]);
  });
  it('a bound that bit and still holds says so; no bite: no list', () => {
    expect(numberParts(-2, [], COUNT).bounds).toEqual([{ source: 'floor', op: 'floor', amount: 0, applied: 2, holds: true }]);
    expect('bounds' in numberParts(2, [add('R', 1)], COUNT)).toBe(false);
  });
});

describe('numberParts: nothing dropped or ignored silently (K582)', () => {
  it('a scoped modifier in a call that names no scope is listed as unchanged with why "scope"', () => {
    const ms = [add('A', -1, { of: 'play' })];
    const r = numberParts(3, ms, COST, { unchanged: true });
    expect(r.value).toBe(3);
    expect(r.unchanged).toEqual([{ source: 'A', op: 'add', amount: -1, applied: 0, why: 'scope' }]);
    expect(numberParts(3, ms, COST, { of: 'other', unchanged: true }).unchanged).toEqual([]);
    expect(numberParts(3, ms, COST, { of: 'play', unchanged: true }).value).toBe(2);
  });
  it('decreases: highestMin also orders the reductions of an unsplit add step, in either input order', () => {
    const o: NumberOrder = { steps: ['add'], decreases: 'highestMin' };
    const a = add('A', -2, { min: 1 });
    const b = add('B', -1, { min: 0 });
    for (const ms of [[a, b], [b, a]]) {
      const r = numberParts(3, ms, o);
      expect(r.value).toBe(0);
      expect(show(r.parts)).toEqual(['A:add:-2:-2', 'B:add:-1:-1']);
    }
    expect(show(numberParts(4, [b, add('R', 1), a], o).parts)).toEqual(['A:add:-2:-2', 'R:add:1:1', 'B:add:-1:-1']);
    expect(numberParts(3, [b, a], { steps: ['add'] }).value).toBe(1);
  });
  it('a minimum on a raise, a set, a multiply, a floor or a cap is an engine bug; on a reduction that counts to zero it is not', () => {
    expect(() => numberParts(3, [add('A', 1, { min: 2 })], SUM)).toThrow(EngineBugError);
    expect(() => numberParts(3, [set('A', 0, { min: 2 })], SUM)).toThrow(EngineBugError);
    expect(() => numberParts(3, [mul('A', 2, { min: 2 })], STAT)).toThrow(EngineBugError);
    expect(() => numberParts(3, [{ source: 'A', op: 'floor', amount: 1, min: 2 }], SUM)).toThrow(EngineBugError);
    expect(() => numberParts(3, [{ source: 'A', op: 'cap', amount: 9, min: 2 }], SUM)).toThrow(EngineBugError);
    expect(numberParts(3, [add('A', 0, { min: 2 })], SUM).value).toBe(3);
    expect(numberParts(3, [add('A', -1, { min: 2, per: 'units' })], SUM, { counts: { units: () => 0 } }).value).toBe(3);
  });
});

describe('numberParts: reports on modifiers that changed nothing (K582)', () => {
  it('the same modifier object given twice is two modifiers: the second is listed as unchanged', () => {
    const a = add('A', -2, { min: 1 });
    const r = numberParts(3, [a, a], MINS, { unchanged: true });
    expect(r.value).toBe(1);
    expect(show(r.parts)).toEqual(['A:add:-2:-2']);
    expect(r.unchanged).toEqual([{ source: 'A', op: 'add', amount: -2, applied: 0, why: 'same' }]);
    const b = add('B', 1);
    expect(show(numberParts(3, [b, b], SUM).parts)).toEqual(['B:add:1:1', 'B:add:1:1']);
    const f: NumberModifier = { source: 'F', op: 'floor', amount: 1 };
    expect(numberParts(3, [f, f], SUM, { unchanged: true }).unchanged?.map((u) => `${u.source}:${u.why}`)).toEqual(['F:outranked', 'F:same']);
  });
  it('a setter that setOnlyLowers refused says "refused"; one equal to the value says "same"', () => {
    const o: NumberOrder = { steps: ['set'], setOnlyLowers: true };
    const why = (ms: NumberModifier[], order: NumberOrder = o): string[] => numberParts(3, ms, order, { unchanged: true }).unchanged?.map((u) => `${u.source}:${u.why}`) ?? [];
    expect(why([set('A', 5)])).toEqual(['A:refused']);
    expect(why([set('A', 3)])).toEqual(['A:same']);
    expect(why([set('A', 5)], { steps: ['set'] })).toEqual([]);
  });
  it('two setters under setOnlyLowers with "lowest": the lowest lowers, the higher one is outranked, a raising one refused', () => {
    const r = numberParts(4, [set('A', 6), set('B', 2), set('C', 3)], { steps: ['set'], setters: 'lowest', setOnlyLowers: true }, { unchanged: true });
    expect(r.value).toBe(2);
    expect(show(r.parts)).toEqual(['B:set:2:-2']);
    expect(r.unchanged?.map((u) => `${u.source}:${u.why}`)).toEqual(['A:refused', 'C:outranked']);
  });
  it('setters that tie: lowest and highest keep the first given, last keeps the last', () => {
    const ms = [set('A', 2), set('B', 2)];
    const win = (setters: NonNullable<NumberOrder['setters']>): string | undefined => numberParts(4, ms, { steps: ['set'], setters }).parts[0]?.source;
    expect([win('lowest'), win('highest'), win('last')]).toEqual(['A', 'A', 'B']);
  });
  it('a modifier\'s ref is passed through to its part or its unchanged entry, untouched; none given: no key', () => {
    const tag = { id: 9 };
    const r = numberParts(1, [add('S', -1, { min: 0, ref: 7 }), add('S', -1, { min: 0, ref: tag })], MINS, { unchanged: true });
    expect(r.parts).toEqual([{ source: 'S', op: 'add', amount: -1, applied: -1, ref: 7 }]);
    expect(r.unchanged).toEqual([{ source: 'S', op: 'add', amount: -1, applied: 0, why: 'same', ref: tag }]);
    expect(r.unchanged?.[0]?.ref).toBe(tag);
    const cap = numberParts(9, [{ source: 'W', op: 'cap', amount: 5, ref: 'w1' }], SUM);
    expect(cap.bound?.ref).toBe('w1');
    expect(cap.bounds?.[0]?.ref).toBe('w1');
    const plain = numberParts(3, [add('A', 1)], SUM).parts[0];
    expect(plain !== undefined && 'ref' in plain).toBe(false);
  });
});

describe('numberParts: edge values (K582)', () => {
  it('no negative zero in the value, the base or an amount', () => {
    const half = numberParts(-1, [mul('H', 0.5)], { steps: ['multiply'], round: 'up' });
    expect(half.value).toBe(0);
    expect(half.parts).toEqual([{ source: 'H', op: 'multiply', amount: 0.5, applied: 1 }]);
    expect(numberParts(-3, [mul('Z', 0)], { steps: ['multiply'] }).value).toBe(0);
    const none = numberParts(3, [add('A', -2, { per: 'units' })], SUM, { counts: { units: () => 0 }, unchanged: true });
    expect(none.unchanged?.[0]?.amount).toBe(0);
    const zero = numberParts(-0, [], SUM);
    expect(zero.value).toBe(0);
    expect(zero.base).toBe(0);
  });
  it('a fractional multiplier is rounded from the exact product, not from its float error', () => {
    const o: NumberOrder = { steps: ['multiply'] };
    expect(numberParts(100, [mul('A', 1.1)], { ...o, round: 'up' }).value).toBe(110);
    expect(numberParts(100, [mul('A', 1.15)], { ...o, round: 'down' }).value).toBe(115);
    expect(numberParts(3, [mul('A', 0.1)], o).value).toBe(0.3);
    expect(numberParts(5, [mul('A', 0.5)], o).value).toBe(2.5);
    expect(numberParts(2 ** 52 + 1, [mul('A', 2)], { ...o, round: 'up' }).value).toBe(2 ** 53 + 2);
  });
  it('rounding up on a negative value goes toward zero, down goes away from it', () => {
    const o: NumberOrder = { steps: ['multiply'] };
    expect(numberParts(-5, [mul('A', 0.5)], { ...o, round: 'up' }).value).toBe(-2);
    expect(numberParts(-5, [mul('A', 0.5)], { ...o, round: 'down' }).value).toBe(-3);
  });
});

describe('numberParts: prior-art cases and orders that had no test (K582)', () => {
  it('case 15: a cost line reduced to zero comes out as exactly 0, so the game can drop the line', () => {
    const lines = { X: 1, Y: 2, Z: 1 };
    const ms = [add('A', -1, { of: 'X' }), add('B', -3, { of: 'Z' })];
    const out = Object.entries(lines).map(([of, n]) => [of, numberParts(n, ms, COST, { of }).value] as const);
    expect(out).toEqual([['X', 0], ['Y', 2], ['Z', 0]]);
    expect(out.filter(([, v]) => v > 0).map(([of]) => of)).toEqual(['Y']);
  });
  it('an order of only a set step, the setters kept apart by scope and condition: a set equal to the base is no part, an add is an engine bug', () => {
    const o: NumberOrder = { steps: ['set'] };
    const ms = [set('D', 2, { of: 'gain' }), set('D', -2, { of: 'loss', when: 'open' })];
    const run = (base: number, of: string, open = true) => numberParts(base, ms, o, { of, conditions: { open: () => open }, unchanged: true });
    expect(show(run(1, 'gain').parts)).toEqual(['D:set:2:1']);
    expect(run(2, 'gain')).toEqual({ value: 2, base: 2, parts: [], unchanged: [{ source: 'D', op: 'set', amount: 2, applied: 0, why: 'same' }] });
    expect(run(-1, 'loss').value).toBe(-2);
    expect(run(-1, 'loss', false)).toEqual({ value: -1, base: -1, parts: [], unchanged: [{ source: 'D', op: 'set', amount: -2, applied: 0, why: 'condition' }] });
    expect(() => numberParts(1, [add('B', 1)], o)).toThrow(EngineBugError);
  });
});

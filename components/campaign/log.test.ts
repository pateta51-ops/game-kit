import { describe, expect, it } from 'vitest';
import { addCount, count, countHistory, crossOut, emptyLog, fieldKey, forget, has, isCrossed, readLog, record, reward, rewardsByStep, rewardTotal, setCount, setCrossOut, setHas, setInsert, setOf, setRemove, visibleKeys, type FieldDef } from './index';

describe('keys', () => {
  it('records once, in order; cross-out leaves the order; recording again brings it back last', () => {
    let l = record(record(emptyLog(), 'a'), 'b');
    expect(record(l, 'a')).toBe(l);
    l = crossOut(l, 'a');
    expect(l.order).toEqual(['b']);
    expect(isCrossed(l, 'a') && !has(l, 'a')).toBe(true);
    l = record(l, 'a');
    expect(l.order).toEqual(['b', 'a']);
    expect(l.crossed).toEqual([]);
  });
  it('does not change the log it was given', () => {
    const l = emptyLog();
    record(l, 'a');
    expect(l).toEqual(emptyLog());
  });
  it('forget removes everywhere', () => {
    let l = setInsert(addCount(record(emptyLog(), 'a'), 'a', 2, 's1'), 'a', 'x');
    l = forget(l, 'a');
    expect([has(l, 'a'), count(l, 'a'), setOf(l, 'a').entries, l.order]).toEqual([false, 0, [], []]);
  });
});
describe('counts', () => {
  it('keeps (step, before, after) per count', () => {
    let l = addCount(emptyLog(), 'doom', 2, 'p');
    l = addCount(l, 'doom', -1, 's1');
    l = setCount(l, 'other', 5, 's1');
    expect(count(l, 'doom')).toBe(1);
    expect(countHistory(l, 'doom')).toEqual([{ step: 'p', before: 0, after: 2 }, { step: 's1', before: 2, after: 1 }]);
  });
});
describe('sets', () => {
  it('crosses entries out and brings them back', () => {
    let l = setInsert(setInsert(emptyLog(), 'k', 'a'), 'k', 'b');
    l = setCrossOut(l, 'k', 'a');
    expect(setOf(l, 'k')).toEqual({ entries: ['b'], crossed: ['a'] });
    expect(setHas(l, 'k', 'a')).toBe(false);
    l = setInsert(l, 'k', 'a');
    expect(setOf(l, 'k')).toEqual({ entries: ['b', 'a'], crossed: [] });
    expect(setOf(setRemove(setCrossOut(l, 'k', 'b'), 'k', 'b'), 'k').crossed).toEqual([]);
  });
});
describe('rewards', () => {
  it('groups by step; spends are negative', () => {
    let l = reward(emptyLog(), { step: 's1', label: 'win', amount: 3, who: 'p1', kind: 'xp' });
    l = reward(l, { step: 's2', label: 'win', amount: 2, who: 'p1', kind: 'xp' });
    l = reward(l, { step: 's2', label: 'upgrade', amount: -4, who: 'p1', kind: 'xp' });
    expect(rewardsByStep(l).map((g) => [g.step, g.entries.length, g.total])).toEqual([['s1', 1, 3], ['s2', 2, -2]]);
    expect(rewardTotal(l, 'p1', 'xp')).toBe(1);
    expect(rewardTotal(l, 'p2')).toBe(0);
  });
});
describe('fields', () => {
  const fields: FieldDef[] = [{ id: 'doom', kind: 'count', label: 'Doom', cite: 'p.4' }, { id: 'wound', kind: 'count', label: 'Wounds', scope: 'player' }, { id: 'secret', kind: 'key', label: 'S', hidden: true }];
  it('stores per player fields under who/id', () => {
    expect(fieldKey(fields, 'doom')).toBe('doom');
    expect(fieldKey(fields, 'wound', 'p1')).toBe('p1/wound');
    expect(fieldKey(fields, 'wound')).toBeUndefined();
    expect(fieldKey(fields, 'doom', 'p1')).toBeUndefined();
    expect(fieldKey(fields, 'nope')).toBeUndefined();
  });
  it('hides hidden fields', () => {
    const l = record(record(emptyLog(), 'secret'), 'a');
    expect(visibleKeys(l, fields).recorded).toEqual(['a']);
  });
});
describe('save', () => {
  it('is plain data that survives JSON', () => {
    const l = reward(setCount(setInsert(record(emptyLog(), 'a'), 's', 'x'), 'c', 1, 'p'), { step: 'p', label: 'l', amount: 1 });
    expect(readLog(JSON.parse(JSON.stringify(l)))).toEqual(l);
    expect(readLog({ v: 2 })).toBeUndefined();
    expect(readLog({ v: 1, recorded: ['a'] })?.counts).toEqual({});
  });
});

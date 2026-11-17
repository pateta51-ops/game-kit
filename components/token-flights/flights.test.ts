import { describe, expect, it } from 'vitest';
import {
  EMPTY_LEDGER, MAX_PER_CHANGE, book, createFlightLedger, isEmpty, land, movesBetween, shownCount, shownCounts, shownTokens, takeOff,
  type Move, type Placement,
} from './index.ts';

// the game's places: credits and threats draw from supplies, the AP mat from the set-aside spot
const supplyOf = (p: string): string | undefined =>
  p === 'credits' ? 'creditSupply' : p === 'boss' || p.startsWith('threat:') ? 'damageSupply' : p === 'apMat' ? 'apAside' : undefined;
const view = (moves: Move[]) => moves.map((m) => `${m.kind} ${String(m.value)} ${m.from}>${m.to}`);
const mv = (value: number, from: string, to: string): Move => ({ kind: from, value, from, to });

describe('movesBetween', () => {
  it('earned tokens fly from the supply, largest first', () => {
    expect(view(movesBetween({ credits: [1] }, { credits: [3, 1, 1] }, supplyOf))).toEqual([
      'creditSupply 3 creditSupply>credits',
      'creditSupply 1 creditSupply>credits',
    ]);
  });

  it('spent tokens fly back before the change comes in (4 -> 2: [3, 1] -> [1, 1])', () => {
    expect(view(movesBetween({ credits: [3, 1] }, { credits: [1, 1] }, supplyOf))).toEqual([
      'creditSupply 3 credits>creditSupply',
      'creditSupply 1 creditSupply>credits',
    ]);
  });

  it('a threat made up anew gives back what it lost and takes what it got', () => {
    const moves = movesBetween({ 'threat:a': [], 'threat:b': [5] }, { 'threat:a': [5], 'threat:b': [1, 1] }, supplyOf);
    expect(view(moves)).toEqual([
      'damageSupply 5 damageSupply>threat:a',
      'damageSupply 5 threat:b>damageSupply',
      'damageSupply 1 damageSupply>threat:b',
      'damageSupply 1 damageSupply>threat:b',
    ]);
  });

  it('a place that left the view takes its tokens back unseen; a place without a supply never flies', () => {
    expect(movesBetween({ 'threat:a': [1, 1] }, {}, supplyOf)).toEqual([]);
    expect(movesBetween({}, { shelf: [1] }, supplyOf)).toEqual([]);
  });

  it('counts discs by place, caps one place and flies nothing for no change', () => {
    expect(view(movesBetween({ apMat: [] }, { apMat: [1, 1] }, supplyOf))).toEqual(['apAside 1 apAside>apMat', 'apAside 1 apAside>apMat']);
    const many: Placement = { credits: Array<number>(30).fill(1) };
    expect(movesBetween({}, many, supplyOf)).toHaveLength(MAX_PER_CHANGE);
    expect(movesBetween(many, many, supplyOf)).toEqual([]);
  });

  it('follows the key order of the new placement', () => {
    const moves = movesBetween({}, { boss: [5], credits: [1] }, supplyOf);
    expect(moves.map((m) => m.to)).toEqual(['boss', 'credits']);
  });
});

describe('the ledger', () => {
  const credit = mv(1, 'creditSupply', 'credits');

  it('a booked token is hidden where it goes and drawn where it comes from; after take-off at neither; after landing where it went', () => {
    let l = book(EMPTY_LEDGER, credit);
    expect(shownTokens([3, 1], 'credits', l)).toEqual([3]);
    expect(shownCounts({ 3: 6, 1: 9 }, 'creditSupply', l)).toEqual({ 3: 6, 1: 10 });
    l = takeOff(l, credit);
    expect(shownCounts({ 3: 6, 1: 9 }, 'creditSupply', l)).toEqual({ 3: 6, 1: 9 });
    l = land(l, credit);
    expect(shownTokens([3, 1], 'credits', l)).toEqual([3, 1]);
    expect(isEmpty(l)).toBe(true);
  });

  it('hides the last tokens of a value, only at its own place', () => {
    const l = book(book(EMPTY_LEDGER, mv(1, 'damageSupply', 'threat:a')), mv(1, 'damageSupply', 'threat:a'));
    expect(shownTokens([5, 1, 1, 1], 'threat:a', l)).toEqual([5, 1]);
    expect(shownTokens([1], 'threat:b', l)).toEqual([1]);
  });

  it('draws a token not yet flown away where it was, even when the place now holds none', () => {
    const spend = mv(3, 'credits', 'creditSupply');
    const l = book(EMPTY_LEDGER, spend);
    expect(shownTokens([], 'credits', l)).toEqual([3]);
    expect(shownTokens([], 'credits', takeOff(l, spend))).toEqual([]);
  });

  it('counts discs within bounds and never goes below nothing', () => {
    const l = book(EMPTY_LEDGER, mv(1, 'apMat', 'apAside'));
    expect(shownTokens([], 'credits', land(EMPTY_LEDGER, credit))).toEqual([]);
    expect(shownCount(2, 'apMat', l, 6)).toBe(3);
    expect(shownCount(6, 'apMat', l, 6)).toBe(6);
    expect(isEmpty(land(EMPTY_LEDGER, credit))).toBe(true);
    expect(shownCounts({ 1: 0 }, 'credits', book(book(EMPTY_LEDGER, credit), credit))).toEqual({ 1: 0 });
  });

  it('each table has its own store; clear is the final state at once and tells subscribers', () => {
    const a = createFlightLedger();
    const b = createFlightLedger();
    let heard = 0;
    a.subscribe(() => { heard += 1; });
    a.book(credit);
    expect(isEmpty(b.get())).toBe(true);
    a.clear();
    expect(a.get()).toBe(EMPTY_LEDGER);
    expect(heard).toBe(2);
    a.clear();
    expect(heard).toBe(2);
  });
});

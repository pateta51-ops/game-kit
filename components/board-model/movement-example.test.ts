import { describe, expect, it } from 'vitest';
import { createBoard } from './index.ts';
import { directedExample, pushInOneTransition } from './examples/movement.ts';
import { displaceAlong, reachableMoves } from './movement.ts';

const corridor = createBoard(['a', 'b', 'c', 'd', 'e'].map(id => ({ id })), [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e']]);
const positions = Object.freeze({ lead: 'a', other: 'b' });
const nextSpace: Readonly<Record<string, string>> = { a: 'b', b: 'c', c: 'd', d: 'e' };
const policy = { steps: 2, next: (space: string) => nextSpace[space], canPush: () => true };

describe('documented weighted movement and atomic displacement', () => {
  it('uses a directed zero-cost transit edge through a space that cannot be an endpoint', () => {
    expect(directedExample('a')).toEqual([{ space: 'c', cost: 2, path: ['a', 'b', 'c'] }]);
    expect(directedExample('c')).toEqual([]);
  });

  it('expands the origin and applies stop independently of endpoint eligibility', () => {
    const options = { points: 2, cost: () => 1, stop: (space: string) => space === 'a' || space === 'b' };
    expect(reachableMoves(corridor, 'a', options)).toEqual([{ space: 'b', cost: 1, path: ['a', 'b'] }]);
    expect(reachableMoves(corridor, 'a', { ...options, end: space => space !== 'b' })).toEqual([]);
  });

  it('completes forced movement on the final step even if that space would interrupt a longer move', () => {
    const options = { stop: (space: string) => space === 'b' };
    expect(displaceAlong(corridor, 'a', ['b', 'c'], { ...options, steps: 1 }))
      .toEqual({ path: ['a', 'b'], destination: 'b', moved: 1, remaining: 0, stop: 'complete' });
    expect(displaceAlong(corridor, 'a', ['b', 'c'], { ...options, steps: 2 }))
      .toEqual({ path: ['a', 'b'], destination: 'b', moved: 1, remaining: 1, stop: 'interrupted' });
  });

  it('applies an entire chain together without changing board or position inputs', () => {
    const before = structuredClone(corridor);
    const pushed = pushInOneTransition(corridor, positions, 'a', policy);
    expect(pushed).toMatchObject({ positions: { lead: 'c', other: 'd' }, plan: {
      destination: 'c', moved: 2, remaining: 0, stop: 'complete',
    } });
    expect(pushed.plan.moves.toSorted((a, b) => a.piece.localeCompare(b.piece))).toEqual([
      { piece: 'lead', from: 'a', to: 'c' }, { piece: 'other', from: 'b', to: 'd' },
    ]);
    expect(corridor).toEqual(before);
    expect(positions).toEqual({ lead: 'a', other: 'b' });
  });

  it('preserves the snapshot when a later leg is blocked or the line ends early', () => {
    const blocked = pushInOneTransition(corridor, positions, 'a', { ...policy, blocked: (_piece, _from, to) => to === 'd' });
    expect(blocked.plan).toMatchObject({ destination: 'a', moved: 0, remaining: 2, stop: 'blocked', moves: [] });
    expect(blocked.positions).toBe(positions);
    const short = pushInOneTransition(corridor, positions, 'a', { ...policy, steps: 5 });
    expect(short.plan).toMatchObject({ destination: 'a', moved: 0, remaining: 5, moves: [] });
    expect(short.positions).toBe(positions);
    const ended = pushInOneTransition(corridor, { lead: 'c' }, 'c', { ...policy, steps: 3 });
    expect(ended.plan).toMatchObject({ stop: 'endOfLine', destination: 'c', remaining: 3, moves: [] });
    expect(ended.positions).toEqual({ lead: 'c' });
  });

  it('commits an interrupted prefix and replans continuation from the resulting snapshot', () => {
    const prefix = pushInOneTransition(corridor, positions, 'a', { ...policy, stop: space => space === 'b' });
    expect(prefix).toMatchObject({ positions: { lead: 'b', other: 'c' }, plan: { destination: 'b', moved: 1, remaining: 1, stop: 'interrupted' } });
    const resumed = pushInOneTransition(corridor, prefix.positions, prefix.plan.destination, { ...policy, steps: prefix.plan.remaining });
    expect(resumed).toMatchObject({ positions: { lead: 'c', other: 'd' }, plan: { moved: 1, remaining: 0, stop: 'complete' } });
    expect(prefix.positions).toEqual({ lead: 'b', other: 'c' });
  });
});

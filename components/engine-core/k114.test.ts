// K114 (batch groups by key, outcome tag and outcomePicks) and K124 (query channel).
import { describe, expect, it } from 'vitest';
import { applyAction, batchGroups, hashState, GameSetupError, outcomePicks, query, type GameRules, type KernelOption } from './index.ts';
import { bareState, CONTENT, COUNTER, playGame, type Counter, type CounterState } from './fake/counter.ts';
import { answer, HIT, startTimed, timedGame } from './fake/timed.ts';

const at = (min: number, max: number, options: KernelOption[]): CounterState => ({ ...bareState(), prompt: { id: 1, min, max, options } });

describe('K114 batch groups and outcome tags', () => {
  it('K114: one batch read per player and per source, groups in first-seen order', () => {
    const g = timedGame();
    const s0 = startTimed(g, { items: [HIT, { ...HIT, keys: { player: 'p1', source: 'p1', target: 'u2' } }, { ...HIT, keys: { player: 'p2', source: 'p3', target: 'u3' } }] });
    const s = applyAction(g, s0, answer(s0, 'hit'), null).state;
    const b = s.timing?.batches[0]?.id ?? -1;
    expect(batchGroups(s, b, 'player').map((x) => [x.key, x.occurrences.length])).toEqual([['p2', 2], ['p1', 1]]);
    expect(batchGroups(s, b, 'source').map((x) => [x.key, x.occurrences.map((o) => o.keys.target)])).toEqual([['p1', ['u1', 'u2']], ['p3', ['u3']]]);
    expect(batchGroups(s, 999, 'player')).toEqual([]);
  });

  it('K114: outcomePicks takes good options up to max, then untagged, bad only to reach min', () => {
    const o = (id: string, outcome?: 'good' | 'bad', enabled = true): KernelOption => (outcome ? { id, enabled, outcome } : { id, enabled });
    expect(outcomePicks(at(0, 2, [o('a', 'bad'), o('b', 'good'), o('c'), o('d', 'good'), o('e', 'good')]))).toEqual(['b', 'd']);
    expect(outcomePicks(at(2, 3, [o('a', 'bad'), o('b'), o('c', 'good', false)]))).toEqual(['b', 'a']);
    expect(outcomePicks(at(0, 1, [o('a', 'bad'), o('b')]))).toEqual([]);
    expect(outcomePicks(at(1, 1, [o('a', 'bad'), o('b')]))).toEqual(['b']);
  });

  it('K114: games replay byte for byte as on main (hashes recorded before K114)', () => {
    expect(['a', 'b', 'c', 'd', 'e'].map((s) => hashState(playGame(s).state))).toEqual(['735466b0f93c2f39', '5d4ffe99519c71cb', '13f0961624ca7182', '97c06c5fb00c4c1f', '3d7c52182d24578f']);
    expect(hashState(startTimed(timedGame()))).toBe('7b4d36237d3097af');
  });
});

describe('K124 query channel', () => {
  const game: GameRules<Counter> = { ...COUNTER, queries: { pileTop: (s, c, player, arg) => ({ top: s.pile.slice(0, Number(arg ?? 1)), cards: c.cards, player }) } };
  it('K124: a named query reads derived data from the state, unknown names throw', () => {
    const s = { ...bareState(), pile: [4, 5, 6] };
    expect(query(game, s, CONTENT, 'pileTop', 'p1', 2)).toEqual({ top: [4, 5], cards: 6, player: 'p1' });
    expect(() => query(game, s, CONTENT, 'nope')).toThrow(GameSetupError);
    expect(() => query(COUNTER, s, CONTENT, 'pileTop')).toThrow(GameSetupError);
  });
  it('K124: a query that mutates the content throws and the content is unchanged', () => {
    const bad: GameRules<Counter> = { ...COUNTER, queries: { grow: (_s, c) => { (c as { cards: number }).cards += 1; return c.cards; } } };
    expect(() => query(bad, bareState(), CONTENT, 'grow')).toThrow(TypeError);
    expect(CONTENT.cards).toBe(6);
  });
});

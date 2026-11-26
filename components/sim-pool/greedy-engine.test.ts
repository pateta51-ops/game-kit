import { describe, expect, it } from 'vitest';
import { applyAction, hashValue, replay, type AnswerAction } from '../engine-core/index.ts';
import { answers, bot, initialState, pick, playGreedyTurn, probe, simGame, view, type Game, type View } from './fake/public-greedy.ts';
import { botDriver, DriverRng, playOne, type SimGame } from './index.ts';

describe('engine-backed greedy preview', () => {
  it('probes real engine transitions, takes a mandatory effect and stops at hidden or other-seat branches', () => {
    const state = initialState();
    const redacted = view(state, 'a');
    expect(probe(redacted, pick(state, 'draw'))).toEqual({ kind: 'unknown' });
    expect(probe(redacted, pick(state, 'luck'))).toEqual({ kind: 'unknown' });
    expect(probe(redacted, pick(state, 'transfer'))).toEqual({ kind: 'unknown' });
    expect(probe(redacted, { ...pick(state, 'route'), promptId: 1000 })).toEqual({ kind: 'rejected' });
    const route = probe(redacted, pick(state, 'route'));
    expect(route).toMatchObject({ kind: 'choice', score: 1 });
    if (route.kind !== 'choice') throw new Error('expected a nested choice');
    const child = route.answers[0]!;
    expect(probe(route.view, child)).toEqual({ kind: 'complete', score: 7 });
    const mid = applyAction(simGame.rules, state, pick(state, 'route'), null).state;
    const after = applyAction(simGame.rules, mid, child, null).state;
    expect(after.result).toBe(7);
    expect(state.score).toBe(0);
    expect(state.deck).toEqual([20, 1, 9]);
  });

  it('makes identical choices on redacted engine worlds and under the simulator hidden shuffle', () => {
    const driver = botDriver<Game, View>(bot(), view);
    const state = initialState();
    const other = { ...state, deck: [...state.deck].reverse(), rng: { a: 1, b: 2, c: 3, d: 4 } };
    expect(other.deck).not.toEqual(state.deck);
    expect(other.rng).not.toEqual(state.rng);
    expect(view(other, 'a')).toEqual(view(state, 'a'));
    const a = driver.choose(state, answers(state), new DriverRng('same'));
    const b = driver.choose(other, answers(other), new DriverRng('same'));
    expect(a).toEqual(b);
    expect(a).toEqual(pick(state, 'route'));
    const nested = applyAction(simGame.rules, state, a as AnswerAction, null).state;
    const nestedOther = { ...nested, deck: other.deck, rng: other.rng };
    expect(driver.choose(nested, answers(nested), new DriverRng('same'))).toEqual(driver.choose(nestedOther, answers(nestedOther), new DriverRng('same')));

    let changed = 0;
    const game: SimGame<Game> = {
      ...simGame,
      reshuffleHidden: (s, seat, random, content) => {
        expect(seat).toBe('a');
        const other = simGame.reshuffleHidden!(s, seat, random, content);
        if (other.deck.some((card, i) => card !== s.deck[i])) changed += 1;
        return other;
      },
    };
    const spec = { index: 0, seed: 'shuffle', driver: 'greedy' };
    const result = playOne(game, null, spec, undefined, { hidden: true });
    expect(changed).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();
    expect(result.actions).toBe(2);
    expect(result.result).toBe(7);
    expect(result.hash).toBe(playOne(game, null, spec).hash);
  });
  it('plays the same actions through the live example and simulator', () => {
    const seed = 'test';
    const first = playGreedyTurn(initialState(), seed);
    const second = playGreedyTurn(first.state, seed);
    const record = playOne(simGame, null, { index: 0, seed, driver: 'greedy' }, undefined, { hidden: true });
    expect(second.state.result).toBe(7);
    expect(record.result).toBe(second.state.result);
    expect(record.hash).toBe(hashValue([first.action, second.action]));
    expect(replay(simGame.rules, { seed }, null, [first.action, second.action], null)).toMatchObject({ ok: true, state: second.state });
  });
});

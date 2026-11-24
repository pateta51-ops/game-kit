import { describe, expect, it } from 'vitest';
import { bySeat, fuzzMain, DriverRng, playOne, findingOf, type Driver } from './index.ts';
import { forMode } from './fake/hidden-answers.ts';
import { initialState, view, type Game } from './fake/public-greedy.ts';

const spec = { index: 0, seed: 'paired', driver: 'first' };
const run = (mode: string, driver = 'first', hidden = true) => playOne(forMode(mode), null, { ...spec, driver }, undefined, { hidden });

describe('hidden legal answers', () => {
  it.each(['order', 'payload'])('rejects an answer %s leak even with an honest redacted driver', (mode) => {
    const game = forMode(mode);
    const state = initialState();
    const other = game.reshuffleHidden!(state, 'a', new DriverRng('shuffle'), null);
    expect(view(state, 'a')).toEqual(view(other, 'a'));
    expect(state.deck[0]).not.toBe(other.deck[0]);
    const decide = (world: Game['state']) => {
      const rng = new DriverRng('matched');
      return game.driver('first', spec, null).choose(world, game.answers!(world, null, rng), rng);
    };
    expect(decide(state)).not.toEqual(decide(other));
    const record = run(mode);
    expect(findingOf(record)).toMatchObject({ kind: 'hidden-info', step: 0, seed: spec.seed, messages: [expect.stringMatching(/legal answers.*order or payload/)] });
    expect(record.actions).toBe(0);
  });

  it('returns a nonzero fuzz status with the seed, step and the legal-answer source to check', async () => {
    const lines: string[] = [];
    const module = new URL('./fake/hidden-answers.ts', import.meta.url).href;
    expect(await fuzzMain(['--seed', spec.seed, '--driver', spec.driver], module, { hidden: true }, line => lines.push(line))).toBe(1);
    expect(lines.join('\n')).toMatch(/hidden-info.*step 0/);
    expect(lines.join('\n')).toContain('SimGame.answers');
  });

  it.each(['first', 'seeded'])('keeps public-only enumeration, gameplay RNG and %s ties unchanged', (driver) => {
    const normal = run('public', driver, false);
    expect(normal).toMatchObject({ actions: 1 });
    expect(normal.error).toBeUndefined();
    expect(run('public', driver)).toEqual(normal);
    expect(run('public', driver)).toEqual(normal);
  });

  it('distinguishes a real dead end from empty answers only in the alternate world', () => {
    expect(run('empty').error).toMatch(/^dead end: no legal answer/);
    expect(findingOf(run('other-empty'))?.kind).toBe('hidden-info');
  });

  it.each([false, true])('preserves declared stateful drivers and still checks their legal answers (bySeat: %s)', (wrapped) => {
    let choices = 0;
    const makeGame = (mode: string) => {
      const current = forMode(mode);
      return { ...current, driver(name: string): Driver<Game> {
        const live = current.driver(name, spec, null);
        const driver: Driver<Game> = { ...live, stateful: true, choose(state, options, rng) { choices += 1; return live.choose(state, options, rng); } };
        return wrapped ? bySeat({ a: driver }) : driver;
      } };
    };
    expect(playOne(makeGame('public'), null, spec, undefined, { hidden: true }).error).toBeUndefined();
    expect(choices).toBe(1);
    expect(findingOf(playOne(makeGame('order'), null, spec, undefined, { hidden: true }))?.kind).toBe('hidden-info');
    expect(choices).toBe(1);
  });
});

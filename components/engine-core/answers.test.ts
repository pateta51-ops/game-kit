// K25, K30 on the fake counter game.
import { describe, expect, it } from 'vitest';
import { createGame, draftOf, enumerateAnswers, expectEvents, playUntil, randomPicks, skipEmptyProblems, validateAction, type GameRules, type KernelPrompt } from './index';
import { bareState, CONTENT, COUNTER, RULES, type Counter, type CounterState } from './fake/counter';

const prompt = (min: number, max: number): CounterState => ({
  ...bareState(),
  prompt: { id: 1, min, max, options: [{ id: 'a', enabled: true }, { id: 'b', enabled: false }, { id: 'c', enabled: true }, { id: 'd', enabled: true }] },
});

// draw is disabled once the pile is empty, so that turn has one legal answer
const DRY: GameRules<Counter> = {
  ...COUNTER,
  handlers: {
    ...COUNTER.handlers,
    turn: (ctx, task) => {
      COUNTER.handlers['turn']?.(ctx, task);
      const s = draftOf(ctx);
      if (s.prompt !== null && s.pile.length === 0)
        s.prompt = { ...s.prompt, options: s.prompt.options.map((o) => (o.id === 'draw' ? { ...o, enabled: false, why: 'empty' } : o)) };
    },
  },
};
const starts = Array.from({ length: 20 }, (_, i) => createGame(DRY, { seed: `dry${String(i)}` }, { target: 30 }, CONTENT).state);
const onlyAdd = (s: CounterState): readonly string[] | null => (s.pile.length === 0 ? ['add'] : null);

describe('K25 enumerateAnswers and the test helpers', () => {
  it('K25: every set of enabled ids from min to max, each accepted by validateAction', () => {
    const all = enumerateAnswers(prompt(1, 2)).map((a) => a.picks);
    expect(all).toEqual([['a'], ['a', 'c'], ['a', 'd'], ['c'], ['c', 'd'], ['d']]);
    expect(enumerateAnswers(prompt(0, 1)).map((a) => a.picks)).toEqual([[], ['a'], ['c'], ['d']]);
    for (const a of enumerateAnswers(prompt(1, 3))) expect(validateAction(prompt(1, 3), a).ok).toBe(true);
    expect(enumerateAnswers(bareState())).toEqual([]);
  });

  it('K25: randomPicks is seeded and legal', () => {
    const s = prompt(1, 3);
    expect(randomPicks(s, 'x')).toEqual(randomPicks(s, 'x'));
    for (let i = 0; i < 20; i += 1) expect(validateAction(s, { kind: 'answer', promptId: 1, picks: randomPicks(s, String(i)) }).ok).toBe(true);
  });

  it('K25: playUntil stops on the condition and keeps the events; expectEvents checks their order', () => {
    const r = createGame(COUNTER, { seed: 'p' }, RULES, CONTENT);
    const p = playUntil(COUNTER, r, CONTENT, (s) => s.turn === 3);
    expect(p.state.turn).toBe(3);
    expectEvents(p.events, (e) => e.type, 'added', 'added');
    expect(() => expectEvents(p.events, (e) => e.type, 'drawn')).toThrow();
    const end = playUntil(COUNTER, r, CONTENT, () => false, (s) => randomPicks(s, 'q'));
    expect(end.state.result).not.toBeNull();
  });
});

describe('K30 skip-empty invariant', () => {
  it('K30: every auto-answered prompt is the only legal answer', () => {
    const r = skipEmptyProblems(DRY, starts, CONTENT, onlyAdd);
    expect(r.problems).toEqual([]);
    expect(r.autos).toBeGreaterThan(0);
  });

  it('K30: an auto answer given while another answer is legal is reported', () => {
    const r = skipEmptyProblems(DRY, starts, CONTENT, () => ['add']);
    expect(r.problems.length).toBeGreaterThan(0);
    expect((starts[0]?.prompt as KernelPrompt).min).toBe(1);
  });
});

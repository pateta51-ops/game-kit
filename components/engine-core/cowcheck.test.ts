import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyMode, createGame, differentialApply, isFreezing, own, setCopyMode, setCowChecks, setStateFreezing } from './index.ts';
import { CONTENT, COUNTER, randomAnswer, RULES, type CounterState } from './fake/counter.ts';

beforeAll(() => setCowChecks(true));
afterAll(() => setCowChecks(false));

const withChosen = (chosen: (ctx: { s: CounterState }) => void): typeof COUNTER => ({ ...COUNTER, handlers: { ...COUNTER.handlers, chosen } });

describe('differentialApply', () => {
  it('whole games: no problem, the state and events of the frozen run, the modes put back', () => {
    for (const [freezing, mode] of [[true, 'cow'], [false, 'full']] as const) {
      setStateFreezing(freezing);
      setCopyMode(mode);
      try {
        let state: CounterState = createGame(COUNTER, { seed: 'diff' }, RULES, CONTENT).state;
        let events = 0;
        for (let n = 0; state.result === null && n < 1000; n += 1) {
          const r = differentialApply(COUNTER, state, randomAnswer(state, 'diff'), CONTENT);
          expect(r.problems).toEqual([]);
          expect(Object.isFrozen(r.state)).toBe(true);
          events += r.events.length;
          state = r.state as CounterState;
        }
        expect(state.result).not.toBeNull();
        expect(events).toBeGreaterThan(0);
        expect([isFreezing(), copyMode()]).toEqual([freezing, mode]);
      } finally {
        setStateFreezing(true);
        setCopyMode('cow');
      }
    }
  });

  it('a write that misses the barrier: the frozen run throws, the unfrozen run changes its input', () => {
    const bad = withChosen((ctx) => void (ctx.s.marks.added as number[]).push(1));
    const s = createGame(COUNTER, { seed: 'miss' }, RULES, CONTENT).state;
    const before = JSON.stringify(s);
    const r = differentialApply(bad, s, randomAnswer(s, 'miss'), CONTENT);
    expect(r.state).toBeNull();
    expect(r.events).toEqual([]);
    expect(r.problems).toHaveLength(2);
    expect(r.problems[0]).toContain('frozen: threw TypeError');
    expect(r.problems[1]).toBe('unfrozen: the input state changed');
    expect(JSON.stringify(s)).toBe(before);
    expect([isFreezing(), copyMode()]).toEqual([true, 'cow']);
  });

  it('a barrier on a shared parent throws in both copy-on-write runs (check mode)', () => {
    const shared = withChosen((ctx) => void own(ctx.s.marks as { added: number[] }, 'added'));
    const s = createGame(COUNTER, { seed: 'miss' }, RULES, CONTENT).state;
    const r = differentialApply(shared, s, randomAnswer(s, 'miss'), CONTENT);
    expect(r.problems.map((p) => p.slice(0, p.indexOf(':')))).toEqual(['frozen', 'unfrozen']);
  });

  it('a result that depends on the copy mode is reported', () => {
    const odd = withChosen((ctx) => void ((ctx.s as { counter: number }).counter += copyMode() === 'full' ? 5 : 1));
    const s = createGame(COUNTER, { seed: 'odd' }, RULES, CONTENT).state;
    expect(differentialApply(odd, s, randomAnswer(s, 'odd'), CONTENT).problems).toEqual(['copy on write differs from the full copy']);
  });

  it('an action the engine refuses is a problem of all three runs, not a throw', () => {
    const s = createGame(COUNTER, { seed: 'no' }, RULES, CONTENT).state;
    const r = differentialApply(COUNTER, s, { kind: 'answer', promptId: s.prompt?.id ?? 0, picks: [] }, CONTENT);
    expect(r.state).toBeNull();
    expect(r.problems).toHaveLength(3);
  });
});

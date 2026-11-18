// K264 (audit G03/T5): a counter fake game played through the runner; durations end with no manual boundary() call.
import { describe, expect, it } from 'vitest';
import { addEffect, applyAction, createGame, draftOf, hashValue, seedRng, sumEffects, type AnswerAction, type Ctx, type Draft, type GameRules, type KernelEvent, type KernelPrompt, type KernelState, type KernelTask } from '../engine-core/index.ts';
import { endTurn, flowHandlers, flowOf, startFlow, whoseTurn, type FlowConfig, type FlowPos, type FlowState } from './index.ts';

interface CState extends KernelState {
  readonly counter: Readonly<Record<string, number>>;
  readonly seen: readonly string[];
  readonly bonus: readonly number[];
  readonly seats: readonly string[];
  readonly flow?: FlowState;
}
interface C {
  readonly state: CState;
  readonly action: AnswerAction;
  readonly task: KernelTask;
  readonly prompt: KernelPrompt;
  readonly event: KernelEvent;
  readonly stamped: never;
  readonly content: null;
  readonly options: { readonly seed: string };
  readonly rules: { readonly rounds: number; readonly skipB?: boolean };
}

const where = (p: FlowPos): string => `${String(p.round)}:${p.seat}:${p.phase}${p.step === null ? '' : `/${p.step}`}`;
const game = (extra: Partial<FlowConfig<C>> = {}): GameRules<C> => {
  const flow: FlowConfig<C> = {
    phases: [{ id: 'start' }, { id: 'main', steps: ['act', 'check'] }, { id: 'end' }],
    seats: (st) => st.seats,
    rounds: 3,
    step: (ctx: Ctx<C>, pos) => {
      const s = draftOf(ctx);
      s.seen = [...s.seen, where(pos)];
      if (pos.phase === 'start') {
        addEffect(ctx, { kind: 'plus', source: pos.seat, value: 1, duration: { until: 'endOfTurn' } });
        addEffect(ctx, { kind: 'round', source: pos.seat, value: 1, duration: { until: 'endOfRound' } });
      }
      if (pos.step === 'act') ctx.ask({ min: 1, max: 1, options: ['add', 'pass', 'drop', 'join'].map((id) => ({ id, enabled: true })), seat: pos.seat }, { kind: 'add' });
      if (pos.step === 'check') s.bonus = [...s.bonus, sumEffects(ctx.s, 'plus')];
    },
    ...extra,
  };
  return {
    handlers: {
      ...flowHandlers(flow),
      add: (ctx: Ctx<C>, task) => {
        const s = draftOf(ctx);
        const seat = flowOf(ctx.s)?.seat as string;
        const pick = task.answer?.[0];
        if (pick === 'pass') return endTurn(ctx);
        if (pick === 'drop') s.seats = s.seats.filter((x) => x !== seat);
        if (pick === 'join') s.seats = ['z', ...s.seats];
        s.counter = { ...s.counter, [seat]: (s.counter[seat] ?? 0) + 1 + sumEffects(ctx.s, 'plus') };
      },
    },
    blank(options): Draft<CState> {
      const [a, b, c, d] = seedRng(options.seed);
      return { rng: { a, b, c, d }, counter: {}, seen: [], bonus: [], seats: ['a', 'b'], stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [] };
    },
    setup: startFlow,
    contentHash: () => hashValue('turn-flow'),
  };
};

const play = (g: GameRules<C>, pick: (s: CState, i: number) => string = () => 'add', seats?: readonly string[]): CState => {
  let s = createGame(g, { seed: 'k264' }, { rounds: 3 }, null).state;
  if (seats !== undefined) s = { ...s, seats };
  for (let i = 0; i < 100 && s.prompt !== null; i++) s = applyAction(g, s, { kind: 'answer', promptId: s.prompt.id, picks: [pick(s, i)] }, null).state;
  return s;
};

describe('turn-flow (K264)', () => {
  it('a counter game plays 3 full rounds: seats in order, phases and steps in table order, then done', () => {
    const g = game();
    const first = createGame(g, { seed: 'k264' }, { rounds: 3 }, null).state;
    expect(whoseTurn(first)).toBe('a');
    expect(flowOf(first)).toMatchObject({ round: 1, seat: 'a', phase: 'main', step: 'act' });
    const s = play(g);
    expect(s.seen.slice(0, 8)).toEqual(['1:a:start', '1:a:main/act', '1:a:main/check', '1:a:end', '1:b:start', '1:b:main/act', '1:b:main/check', '1:b:end']);
    expect(s.seen).toHaveLength(24);
    expect(s.seen.at(-1)).toBe('3:b:end');
    expect(s.counter).toEqual({ a: 6, b: 6 });
    expect(flowOf(s)?.done).toBe(true);
    expect(whoseTurn(s)).toBeUndefined();
    expect(s.prompt).toBeNull();
  });

  it('K320 roundEnds: the game ends the round (here after 3 turns); seats keep cycling inside it, and the next round starts at the first seat', () => {
    const s = play(game({ rounds: 2, roundEnds: (st) => st.seen.length % 12 === 0 }));
    const turns = s.seen.filter((x) => x.endsWith(':start')).map((x) => x.slice(0, 3));
    expect(turns).toEqual(['1:a', '1:b', '1:a', '2:a', '2:b', '2:a']);
    expect(flowOf(s)?.done).toBe(true);
    const solo = play(game({ rounds: 2, roundEnds: (st) => st.seen.length % 8 === 0 }), () => 'add', ['a']);
    expect(solo.seen.filter((x) => x.endsWith(':start'))).toEqual(['1:a:start', '1:a:start', '2:a:start', '2:a:start']);
    // a round where every turn is skipped, or with no seats, still ends (no hang) and the cap stops the game
    const never = (st: CState): boolean => st.seen.length < 0;
    const skipped = play(game({ rounds: 2, roundEnds: never, skip: (_, level) => level === 'turn' }));
    expect(skipped.seen).toEqual([]);
    expect(flowOf(skipped)?.done).toBe(true);
    const empty = play(game({ rounds: 2, roundEnds: never }), () => 'add', []);
    expect(flowOf(empty)?.done).toBe(true);
  });

  it('an end-of-turn duration expires with no manual boundary() call; end-of-round lasts the round', () => {
    const g = game();
    let s = createGame(g, { seed: 'k264' }, { rounds: 3 }, null).state;
    expect(sumEffects(s, 'plus')).toBe(1);
    s = applyAction(g, s, { kind: 'answer', promptId: (s.prompt as KernelPrompt).id, picks: ['add'] }, null).state;
    expect(whoseTurn(s)).toBe('b');
    expect(sumEffects(s, 'plus')).toBe(1);
    expect(sumEffects(s, 'round')).toBe(2);
    s = applyAction(g, s, { kind: 'answer', promptId: (s.prompt as KernelPrompt).id, picks: ['add'] }, null).state;
    expect(flowOf(s)?.round).toBe(2);
    expect(sumEffects(s, 'round')).toBe(1);
    expect(play(g).bonus).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('skip predicates jump turns, phases and steps without their boundaries; over() stops the flow', () => {
    const s = play(game({ skip: (_s, level, p) => (level === 'turn' && p.seat === 'b' && p.round === 2) || (level === 'phase' && p.phase === 'end') || (level === 'step' && p.step === 'check') }));
    expect(s.seen.filter((x) => x.startsWith('2:'))).toEqual(['2:a:start', '2:a:main/act']);
    expect(s.counter).toEqual({ a: 6, b: 4 });
    const o = play(game({ rounds: 99, over: (st) => (st.counter['b'] ?? 0) >= 4 }));
    expect(o.counter).toEqual({ a: 4, b: 4 });
    expect(flowOf(o)?.done).toBe(true);
  });

  it('seats added or removed mid-round: the turn ends for the seat that began it, the next seat follows it in the current list', () => {
    const turns = (st: CState): string[] => st.seen.filter((x) => x.endsWith(':start'));
    const dropped = play(game(), (_st, i) => (i === 1 ? 'drop' : 'add'), ['a', 'b', 'c']);
    expect(turns(dropped)).toEqual(['1:a:start', '1:b:start', '1:c:start', '2:a:start', '2:c:start', '3:a:start', '3:c:start']);
    const joined = play(game(), (_st, i) => (i === 0 ? 'join' : 'add'));
    expect(turns(joined).slice(0, 5)).toEqual(['1:a:start', '1:b:start', '2:z:start', '2:a:start', '2:b:start']);
  });

  it('endTurn passes: the rest of the turn is skipped, turnEnd and roundEnd fire on the next advance', () => {
    const g = game();
    let s = createGame(g, { seed: 'k264' }, { rounds: 3 }, null).state;
    s = applyAction(g, s, { kind: 'answer', promptId: (s.prompt as KernelPrompt).id, picks: ['pass'] }, null).state;
    expect(s.seen).toEqual(['1:a:start', '1:a:main/act', '1:b:start', '1:b:main/act']);
    expect(whoseTurn(s)).toBe('b');
    expect(sumEffects(s, 'plus')).toBe(1);
    s = applyAction(g, s, { kind: 'answer', promptId: (s.prompt as KernelPrompt).id, picks: ['pass'] }, null).state;
    expect(flowOf(s)).toMatchObject({ round: 2, seat: 'a' });
    expect(sumEffects(s, 'round')).toBe(1);
  });

  it('over() ends the pending phase, turn and round, so their durations expire', () => {
    const o = play(game({ rounds: 99, over: (st) => (st.counter['a'] ?? 0) >= 2 }));
    expect(o.seen.at(-1)).toBe('1:a:main/act');
    expect(sumEffects(o, 'plus') + sumEffects(o, 'round')).toBe(0);
  });
});

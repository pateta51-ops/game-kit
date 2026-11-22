// K653: an older engine's end-trigger latch restated on a made-up two-seat game. The latch (first reason kept, the
// earliest end round) is the game's state; turn-flow's `over` reads it at the last position of a round.
import { describe, expect, it } from 'vitest';
import { createGame, draftOf, hashValue, seedRng, type AnswerAction, type Ctx, type Draft, type GameRules, type KernelEvent, type KernelPrompt, type KernelState, type KernelTask } from '../engine-core/index.ts';
import { flowHandlers, flowOf, startFlow, type FlowConfig, type FlowState } from './index.ts';

type Trigger = { readonly round: number; readonly seat: string; readonly cond: 'A' | 'B' };
interface EState extends KernelState {
  readonly seen: readonly string[];
  readonly end?: { readonly after: number; readonly reason: string };
  readonly flow?: FlowState;
}
interface E {
  readonly state: EState;
  readonly action: AnswerAction;
  readonly task: KernelTask;
  readonly prompt: KernelPrompt;
  readonly event: KernelEvent;
  readonly stamped: never;
  readonly content: null;
  readonly options: { readonly seed: string };
  readonly rules: null;
}

const SEATS = ['a', 'b'];
const game = (triggers: readonly Trigger[]): GameRules<E> => {
  const flow: FlowConfig<E> = {
    phases: [{ id: 'main' }],
    seats: () => SEATS,
    rounds: 99,
    step: (ctx: Ctx<E>, pos) => {
      const s = draftOf(ctx);
      s.seen = [...s.seen, `${String(pos.round)}:${pos.seat}`];
      for (const t of triggers.filter((x) => x.round === pos.round && x.seat === pos.seat)) {
        const after = t.cond === 'A' ? pos.round + 1 : pos.round; // A: the game ends after the next round; B: after this one
        s.end = { after: Math.min(after, s.end?.after ?? after), reason: s.end?.reason ?? t.cond };
      }
    },
    over: (st) => {
      const f = flowOf(st);
      return st.end !== undefined && f !== undefined && f.round >= st.end.after && f.seat === SEATS.at(-1);
    },
  };
  return {
    handlers: { ...flowHandlers(flow) },
    blank(options): Draft<EState> {
      const [a, b, c, d] = seedRng(options.seed);
      return { rng: { a, b, c, d }, seen: [], stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [] };
    },
    setup: startFlow,
    contentHash: () => hashValue('k653-end'),
  };
};
const play = (t: readonly Trigger[]): EState => createGame(game(t), { seed: 'k653' }, null, null).state;

describe('K653 turn-flow: the first end trigger is latched', () => {
  it('I B25: condition A in round 3 (end after round 4), condition B in round 4 (end after this round): the game ends after round 4, reason A (the game supplies the latch read by `over`)', () => {
    const s = play([{ round: 3, seat: 'a', cond: 'A' }, { round: 4, seat: 'b', cond: 'B' }]);
    expect(s.seen.at(-1)).toBe('4:b');
    expect(s.seen).toHaveLength(8);
    expect(s.end).toEqual({ after: 4, reason: 'A' });
    expect(flowOf(s)?.done).toBe(true);
  });
  it('I B25: both in round 3: the game ends after round 3 and the first reason stays', () => {
    const s = play([{ round: 3, seat: 'a', cond: 'A' }, { round: 3, seat: 'b', cond: 'B' }]);
    expect(s.seen.at(-1)).toBe('3:b');
    expect(s.seen).toHaveLength(6);
    expect(s.end).toEqual({ after: 3, reason: 'A' });
  });
  it('I B25: no end trigger: the flow runs to its round cap', () => {
    expect(play([]).seen).toHaveLength(198);
  });
});

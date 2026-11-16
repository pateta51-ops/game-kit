import { describe, expect, it } from 'vitest';
import { createGame, draftOf, hashValue, newSteps, seedRng, undoStep, type AnswerAction, type Ctx, type Draft, type GameRules, type KernelOption, type KernelState, type StepHistory } from '../engine-core/index';
import { answerWithForced, autoAnswer, sendForced } from './index';

interface P {
  readonly id: number;
  readonly kind: 'choose' | 'confirm';
  readonly seat: number;
  readonly options: readonly KernelOption[];
  readonly min: number;
  readonly max: number;
}
interface S extends KernelState {
  readonly options: { readonly seed: string };
  readonly at: number;
  readonly cur: number;
  readonly stack: readonly { readonly kind: string; readonly answer?: readonly string[] }[];
  readonly prompt: P | null;
  readonly result: null;
  readonly log: readonly { readonly seq: number; readonly type: string }[];
}
interface T {
  readonly state: S;
  readonly action: AnswerAction;
  readonly task: { readonly kind: string; readonly answer?: readonly string[] };
  readonly prompt: P;
  readonly event: { readonly seq: number; readonly type: string };
  readonly stamped: never;
  readonly content: null;
  readonly options: { readonly seed: string };
  readonly rules: null;
}

// each round: seat `cur` chooses, then two forced confirms of its own, then a forced confirm of the other seat, who then chooses
const ask = (ctx: Ctx<T>): void => {
  const s = draftOf(ctx);
  const i = s.at % 4;
  const opts: KernelOption[] = i === 0 ? [{ id: 'a', enabled: true }, { id: 'b', enabled: true }] : [{ id: 'ok', enabled: true }, { id: 'no', enabled: false }];
  ctx.ask({ kind: i === 0 ? 'choose' : 'confirm', seat: i === 3 ? 1 - s.cur : s.cur, options: opts, min: 1, max: 1 }, { kind: 'got' });
};
const GAME: GameRules<T> = {
  handlers: {
    ask,
    got: (ctx) => {
      const s = draftOf(ctx);
      ctx.emit({ type: 'got' });
      if (s.at % 4 === 3) s.cur = 1 - s.cur;
      s.at += 1;
      ctx.then({ kind: 'ask' });
    },
  },
  blank(options): Draft<S> {
    const [a, b, c, d] = seedRng(options.seed);
    return { options, rng: { a, b, c, d }, at: 0, cur: 0, stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [] };
  },
  setup: (ctx) => ctx.then({ kind: 'ask' }),
  contentHash: (c) => hashValue(c),
};

const start = (): StepHistory<T> => newSteps<T>(createGame(GAME, { seed: 'f' }, null, null).state);
const click = (h: StepHistory<T>, id: string): AnswerAction => ({ kind: 'answer', promptId: h.state.prompt?.id ?? -1, picks: [id] });
const forced = (p: P) => autoAnswer(p, true);

describe('answerWithForced (K226, 7IS store loop)', () => {
  it('sends each forced answer once after the click and stops at the other seat’s prompt', () => {
    const calls: number[] = [];
    const r = answerWithForced(GAME, start(), click(start(), 'a'), null, (p) => (calls.push(p.id), forced(p)), { seat: 0 });
    expect(r.ok).toBe(true);
    expect(r.history.actions.map((a) => a.picks)).toEqual([['a'], ['ok'], ['ok']]);
    expect(r.events.map((e) => e.type)).toEqual(['got', 'got', 'got']);
    expect(r.history.state.prompt).toMatchObject({ kind: 'confirm', seat: 1 });
    expect(new Set(calls).size).toBe(calls.length);
  });

  it('one undo takes back the click and the forced answers it brought', () => {
    const h0 = start();
    const r = answerWithForced(GAME, h0, click(h0, 'b'), null, forced, { seat: 0 });
    expect(r.history.steps.map((s) => s.count)).toEqual([3]);
    const u = undoStep(GAME, r.history, 'safe', null);
    expect(u.ok).toBe(true);
    expect(u.history.state).toBe(h0.state);
    expect(u.history.actions).toEqual([]);
  });

  it('no auto answer for the other seat; that seat’s screen sends it and stops at its own choice', () => {
    const r = answerWithForced(GAME, start(), click(start(), 'a'), null, forced, { seat: 0 });
    expect(sendForced(GAME, r.history, null, forced, { seat: 0 }).history).toBe(r.history);
    const other = sendForced(GAME, r.history, null, forced, { seat: 1 });
    expect(other.history.actions).toHaveLength(4);
    expect(other.history.state.prompt).toMatchObject({ kind: 'choose', seat: 1 });
  });

  it('a refused click sends nothing; a kind on the never-list is asked', () => {
    const h = start();
    expect(answerWithForced(GAME, h, { kind: 'answer', promptId: 999, picks: ['a'] }, null, forced, { seat: 0 }).history).toBe(h);
    const r = answerWithForced(GAME, h, click(h, 'a'), null, (p) => autoAnswer(p, true, ['confirm']), { seat: 0 });
    expect(r.history.actions).toHaveLength(1);
  });

  it('seat all answers every seat; a chain that never stops ends at the cap with capped and an error', () => {
    const all = sendForced(GAME, answerWithForced(GAME, start(), click(start(), 'a'), null, forced, { seat: 0 }).history, null, forced, { seat: 'all' });
    expect([all.history.actions.length, all.capped, all.error]).toEqual([4, false, null]);
    const loop = sendForced(GAME, start(), null, (p) => [p.options[0]!.id], { seat: 'all', cap: 5 });
    expect(loop.history.actions).toHaveLength(5);
    expect(loop.capped).toBe(true);
    expect(loop.error).toBe('Forced answers did not stop after 5.');
  });
});

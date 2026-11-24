import { describe, expect, it } from 'vitest';
import { createSave, draftOf, hashState, hashValue, seedRng, type AnswerAction, type DebugAction, type Draft, type GameRules, type KernelPrompt, type KernelState } from '../engine-core/index.ts';
import type { CheatDef } from '../cheat-options/index.ts';
import { createGameStore, defineGame } from './index.ts';

// A fake game (tests only): each round sets 3 actions and asks `go` (of seat 0, or with `two` of seat 1 in even rounds); answering ends the round.
interface S extends KernelState {
  readonly stack: readonly { readonly kind: string }[];
  readonly prompt: (KernelPrompt & { readonly kind: string; readonly seat?: number }) | null;
  readonly flow: { readonly round: number };
  readonly actions: number;
  readonly gold: number;
  readonly two: boolean;
  readonly log: readonly { readonly seq: number; readonly type: string }[];
}
interface Opts { readonly seed: string; readonly two?: boolean; readonly allowCheats?: boolean; readonly cheats?: Readonly<Record<string, number | boolean>> }
interface G {
  readonly state: S; readonly action: AnswerAction | DebugAction; readonly task: S['stack'][number]; readonly prompt: NonNullable<S['prompt']>;
  readonly event: S['log'][number]; readonly stamped: never; readonly content: object; readonly options: Opts; readonly rules: object;
}
const RULES: GameRules<G> = {
  handlers: {
    round: (ctx) => {
      const s = draftOf(ctx);
      s.flow = { round: s.flow.round + 1 };
      s.actions = 3;
      ctx.ask({ kind: 'go', ...(s.two ? { seat: (s.flow.round + 1) % 2 } : {}), min: 1, max: 1, options: [{ id: 'ok', enabled: true }] }, { kind: 'round' });
    },
  },
  blank: ({ seed, two }): Draft<S> => {
    const [a, b, c, d] = seedRng(seed);
    return { rng: { a, b, c, d }, stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [], flow: { round: 0 }, actions: 0, gold: 1, two: two === true };
  },
  setup: (ctx) => ctx.then({ kind: 'round' }),
  contentHash: (c) => hashValue(c),
  debug: {},
};
const defs: CheatDef[] = [
  { id: 'gold', label: 'Extra gold', kind: 'number', when: 'setup', edits: [{ path: ['gold'] }] },
  { id: 'extraActions', label: 'Extra actions', kind: 'number', when: 'round', edits: [{ path: ['actions'] }] },
];
const seen: number[] = [];
const game = (o: Omit<Opts, 'seed'>) => defineGame<G, S>({ rules: RULES, content: {}, seats: [0, 1], start: (seed) => ({ options: { seed, ...o }, rules: {} }), view: (s, _seat, c) => ({ ...s, cheated: c?.cheated }) as S, cheats: { defs }, opponent: (v) => (seen.push(v.actions), ['ok']) });
const go = (st: ReturnType<typeof createGameStore<G, S, number>>) => st.answer(['ok'], st.get().state.prompt?.id ?? 0);

describe('K738 cheat options through the store', () => {
  it('K738: a set-up cheat applies once and a round cheat at every round start, as recorded debug edits joined to the step', () => {
    const st = createGameStore(game({ allowCheats: true, cheats: { gold: 2, extraActions: 1 } }), { seat: 0, seed: 's', undo: 'free' });
    expect(st.get().state).toMatchObject({ gold: 3, actions: 4, flow: { round: 1 } });
    expect(st.get().history.actions).toEqual([
      { kind: 'debug', verb: 'set', args: { path: ['gold'], value: 3, cheat: 'gold' } },
      { kind: 'debug', verb: 'set', args: { path: ['actions'], value: 4, cheat: 'extraActions' } },
    ]);
    go(st);
    expect(st.get().state).toMatchObject({ gold: 3, actions: 4, flow: { round: 2 } });
    expect(st.get().history.steps.length).toBe(1);
    expect(st.get().cheated).toBe(true);
    expect((st.get().view as unknown as { cheated: boolean }).cheated).toBe(true);
  });
  it('K738: with allowCheats off nothing applies and the game is not cheated', () => {
    const st = createGameStore(game({ allowCheats: false, cheats: { gold: 2, extraActions: 1 } }), { seat: 0, seed: 's' });
    go(st);
    expect(st.get().state).toMatchObject({ gold: 1, actions: 3 });
    expect(st.get().history.actions.every((a) => a.kind === 'answer')).toBe(true);
    expect(st.get().cheated).toBe(false);
  });
  it('K738: the cheated mark and the cheat edits survive save and load (replay reproduces them)', () => {
    const g = game({ allowCheats: true, cheats: { extraActions: 2 } });
    const st = createGameStore(g, { seat: 0, seed: 's' });
    go(st);
    const h = st.saved();
    const back = createGameStore(game({}), { seat: 0 });
    expect(back.get().cheated).toBe(false);
    expect(back.load(createSave(g.rules, { options: h.options, rules: h.rules, actions: h.actions, undoUsed: false, savedAt: '' }, {}))).toBeNull();
    expect(hashState(back.get().state)).toBe(hashState(st.get().state));
    expect(back.get().state.actions).toBe(5);
    expect(back.get().cheated).toBe(true);
    expect(back.get().history.steps.length).toBe(1);
  });
  it('K738: one answer that crosses two rounds plays the round cheat at each edge, before the opponent acts in the new round', () => {
    seen.length = 0;
    const st = createGameStore(game({ two: true, allowCheats: true, cheats: { extraActions: 2 } }), { seat: 0, seed: 's' });
    go(st);
    expect(seen).toEqual([5]);
    expect(st.get().state).toMatchObject({ actions: 5, flow: { round: 3 } });
    expect(st.get().history.actions.map((a) => a.kind)).toEqual(['debug', 'answer', 'debug', 'answer', 'debug']);
    expect(st.get().history.actions.filter((a) => a.kind === 'debug' && a.args?.['cheat'] === 'extraActions').length).toBe(3);
    expect(st.get().history.steps.length).toBe(1);
  });
  it('K738: undo and redo across a round change take back and bring back the round edits with the step', () => {
    const st = createGameStore(game({ allowCheats: true, cheats: { gold: 1, extraActions: 1 } }), { seat: 0, seed: 's' });
    const start = st.get().state;
    go(st);
    const after = st.get().history.actions;
    expect(after.length).toBe(4);
    expect(st.undo()).toBe(true);
    expect(st.get().state).toEqual(start);
    expect(st.get().history.actions.length).toBe(2);
    expect(st.redo()).toBe(true);
    expect(st.get().history.actions).toEqual(after);
    expect(st.get().state).toMatchObject({ gold: 2, actions: 4, flow: { round: 2 } });
  });
});

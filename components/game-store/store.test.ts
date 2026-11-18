import { describe, expect, it } from 'vitest';
import { createSave, draftOf, exportSave, type SaveFile, hashState, hashValue, seedRng, type AnswerAction, type DebugAction, type Ctx, type Draft, type GameRules, type History, type KernelPrompt, type KernelState } from '../engine-core/index.ts';
import { autoAnswer } from '../prompt-host/index.ts';
import { DriverRng, legalAnswers, playOne, type Bot } from '../sim-pool/index.ts';
import { botOpponent, createGameStore, defineGame } from './index.ts';
import { botDriverOf, simGameOf } from './sim.ts';

// A fake two-seat race (tests only): a turn asks `add` (1 or 2), then a `note` with one option; first to 6 wins.
type Seat = 'a' | 'b';
interface S extends KernelState {
  readonly stack: readonly { readonly kind: string; readonly answer?: readonly string[] }[];
  readonly prompt: (KernelPrompt & { readonly kind: string; readonly seat: Seat }) | null;
  readonly turn: Seat;
  readonly score: Readonly<Record<Seat, number>>;
  readonly secret: Readonly<Record<Seat, string>>;
  readonly log: readonly { readonly seq: number; readonly type: string; readonly reveal?: boolean }[];
}
interface G {
  readonly state: S;
  readonly action: AnswerAction;
  readonly task: S['stack'][number];
  readonly prompt: NonNullable<S['prompt']>;
  readonly event: S['log'][number];
  readonly stamped: never;
  readonly content: { readonly target?: number };
  readonly options: { readonly seed: string };
  readonly rules: object;
}
const opt = (id: string) => ({ id, enabled: true });
const RULES: GameRules<G> = {
  handlers: {
    turn: (ctx: Ctx<G>) => ctx.ask({ kind: 'add', seat: draftOf(ctx).turn, min: 1, max: 1, options: [opt('1'), opt('2')] }, { kind: 'added' }),
    added: (ctx, t) => {
      const s = draftOf(ctx);
      s.score = { ...s.score, [s.turn]: s.score[s.turn] + Number(t.answer?.[0]) };
      ctx.emit({ type: 'added', ...(t.answer?.[0] === '2' ? { reveal: true } : {}) });
      ctx.ask({ kind: 'note', seat: s.turn, min: 1, max: 1, options: [opt('ok')] }, { kind: 'next' });
    },
    next: (ctx) => {
      const s = draftOf(ctx);
      if (s.score[s.turn] >= (ctx.content.target ?? 6)) return void (s.result = { winner: s.turn });
      s.turn = s.turn === 'a' ? 'b' : 'a';
      ctx.then({ kind: 'turn' });
    },
  },
  blank: ({ seed }): Draft<S> => {
    const [a, b, c, d] = seedRng(seed);
    return { rng: { a, b, c, d }, stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [], turn: 'a', score: { a: 0, b: 0 }, secret: { a: 'sa', b: 'sb' } };
  },
  setup: (ctx) => ctx.then({ kind: 'turn' }),
  contentHash: (c) => hashValue(c),
};
const def = defineGame<G, { seat: Seat; mine: string; score: S['score']; prompt: G['prompt'] | null }, Seat>({
  rules: RULES,
  content: {},
  seats: ['a', 'b'],
  start: (seed) => ({ options: { seed }, rules: {} }),
  view: (s, seat) => ({ seat, mine: s.secret[seat], score: s.score, prompt: s.prompt?.seat === seat ? s.prompt : null }),
  forced: (p) => autoAnswer(p, true),
  opponent: (v, p) => [p.kind === 'note' ? 'ok' : v.mine === 'sb' ? '1' : '2'],
});

describe('game-store (K234)', () => {
  it('one click is one undo step: the forced note and the opponent turn join it; paced once', () => {
    const store = createGameStore(def, { seat: 'a', seed: 'x' });
    const p = store.get().state.prompt;
    expect(p?.kind).toBe('add');
    expect(store.answer(['1'], p?.id ?? 0)).toBe(true);
    const after = store.get();
    expect(after.state.prompt?.seat).toBe('a');
    expect(after.state.score).toEqual({ a: 1, b: 1 });
    expect(after.history.steps.length).toBe(1);
    expect(after.steps.queue.length).toBe(2);
    store.advance();
    expect(store.get().steps.queue.length).toBe(1);
    expect(store.undo()).toBe(true);
    expect(store.get().state.score).toEqual({ a: 0, b: 0 });
    expect(store.redo()).toBe(true);
    expect(store.get().state.score).toEqual({ a: 1, b: 1 });
  });

  it('K297: openingSteps paces the setup and opening opponent events of fresh(), from the blank view; instant and the default skip them', () => {
    const dealt = { ...def, rules: { ...RULES, setup: (ctx: Ctx<G>) => { ctx.emit({ type: 'dealt' }); ctx.then({ kind: 'turn' }); } } };
    const store = createGameStore(dealt, { seat: 'b', seed: 'x', openingSteps: true });
    const snap = store.get();
    expect(snap.state.log.map((e) => e.type)).toEqual(['dealt', 'added']);
    expect(snap.steps.queue.map((e) => e.type)).toEqual(['dealt', 'added']);
    expect(snap.steps.base?.score).toEqual({ a: 0, b: 0 });
    store.fresh('y');
    expect(store.get().steps.queue.length).toBe(2);
    expect(createGameStore(dealt, { seat: 'b', seed: 'x', openingSteps: true, instant: () => true }).get().steps.queue).toEqual([]);
    expect(createGameStore(dealt, { seat: 'b', seed: 'x' }).get().steps.queue).toEqual([]);
  });

  it('drops a stale prompt id; safe undo refuses a step that revealed', () => {
    const store = createGameStore(def, { seat: 'a', seed: 'y' });
    const id = store.get().state.prompt?.id ?? 0;
    expect(store.answer(['2'], id + 7)).toBe(false);
    expect(store.answer(['2'], id)).toBe(true);
    expect(store.canUndo().ok).toBe(false);
    expect(store.undo()).toBe(false);
  });

  it('autosaves after each answer; load rebuilds the same state and its undo steps', async () => {
    const saved: History<G>[] = [];
    const saves = { writeAutosave: (h: History<never>) => Promise.resolve(saved.push(h as unknown as History<G>)) };
    const store = createGameStore(def, { seat: 'a', seed: 'z', saves });
    store.answer(['1'], store.get().state.prompt?.id ?? 0);
    store.answer(['1'], store.get().state.prompt?.id ?? 0);
    await store.autosaved();
    expect(saved.length).toBe(2);
    const h = saved[1] as History<G>;
    const back = createGameStore(def, { seat: 'a' });
    expect(back.load(createSave(RULES, { options: h.options, rules: h.rules, actions: h.actions, undoUsed: false, savedAt: '' }, {}))).toBeNull();
    expect(hashState(back.get().state)).toBe(hashState(store.get().state));
    expect(back.get().history.steps.length).toBe(2);
    expect(back.undo()).toBe(true);
    expect(back.get().state.score).toEqual({ a: 1, b: 1 });
  });

  it('the opponent reads its own view only; the same def drives sim-pool', () => {
    expect(JSON.stringify(def.view(createGameStore(def, { seat: 'a' }).get().state, 'b'))).not.toContain('"sa"');
    const rec = playOne(simGameOf(def, { summary: (s) => s.result }), {}, { index: 0, seed: 's', driver: 'opponent' });
    expect(rec.result).toEqual({ winner: 'a' });
  });

  it('K356: simGameOf starts from the whole spec when the game passes start (settings reach the game)', () => {
    const seen: unknown[] = [];
    const sim = simGameOf(def, { start: (spec) => { seen.push(spec.settings); return def.start(spec.seed); } });
    playOne(sim, {}, { index: 0, seed: 's', driver: 'opponent', settings: { mode: 'campaign' } });
    expect(seen).toEqual([{ mode: 'campaign' }]);
  });

  it('K271: one Bot plays a seat in the store to game over and in the sim; same seed, same answers; it sees only the view', () => {
    type V = ReturnType<typeof def.view>;
    const seen: { view: V; picks: readonly string[] }[] = [];
    const bot: Bot<V> = { name: 'opponent', choose: (view, answers, rng) => { const a = answers[rng.int(answers.length)] as AnswerAction; seen.push({ view, picks: a.picks }); return a; } };
    const def2 = { ...def, forced: () => null, opponent: botOpponent<V, G['prompt']>(bot) };
    const store = createGameStore(def2, { seat: 'a', seed: 's' });
    for (let p = store.get().state.prompt; p !== null && store.get().state.result === null; p = store.get().state.prompt) {
      const rng = new DriverRng(`s|opponent|${String(p.id)}`);
      store.answer(bot.choose(def.view(store.get().state, 'a'), legalAnswers(p, rng), rng).picks, p.id);
    }
    expect(store.get().state.result).not.toBeNull();
    const live = seen.splice(0);
    const rec = playOne(simGameOf(def2, { drivers: { opponent: botDriverOf(def2, bot) } }), {}, { index: 0, seed: 's', driver: 'opponent' });
    expect(rec.hash).toBe(hashValue(store.saved().actions));
    expect(seen).toEqual(live);
    for (const s of seen.filter((x) => x.view.seat === 'b')) expect(Object.keys(s.view)).toEqual(['seat', 'mine', 'score', 'prompt']);
    expect(JSON.stringify(seen.filter((x) => x.view.seat === 'b'))).not.toContain('"sa"');
  });

  it('loads an older save through its migration and keeps its undo flag for the next autosave', () => {
    const store = createGameStore(def, { seat: 'a', seed: 'm' });
    store.answer(['1'], store.get().state.prompt?.id ?? 0);
    const h = store.saved();
    const v2 = createSave(RULES, { options: h.options, rules: h.rules, actions: h.actions, undoUsed: true, savedAt: '' }, {}, { version: 2 });
    const v1 = { ...v2, version: 1, actions: v2.actions.map((a) => ({ ...a, picks: a.picks.map((x) => (x === '1' ? 'one' : x)) })) };
    const fmt = { version: 2, steps: { 1: (r: Readonly<Record<string, unknown>>) => ({ ...r, actions: (r['actions'] as AnswerAction[]).map((a) => ({ ...a, picks: a.picks.map((x) => (x === 'one' ? '1' : x)) })) }) } };
    const back = createGameStore({ ...def, format: fmt }, { seat: 'a' });
    expect(back.load(JSON.parse(exportSave(v1 as SaveFile<G>)) as SaveFile<G>)).toBeNull();
    expect(hashState(back.get().state)).toBe(hashState(store.get().state));
    expect(back.saved().undoUsed).toBe(true);
  });

  it('reports the forced-answer cap and a settle that never stops', () => {
    const endless = { ...def, content: { target: 1e9 }, forced: (p: G['prompt']) => [p.options[0]?.id ?? ''], opponent: (_v: unknown, p: G['prompt']) => [p.options[0]?.id ?? ''] };
    expect(createGameStore({ rules: def.rules, seats: def.seats, start: def.start, view: def.view, content: endless.content, forced: endless.forced }, { seat: 'all' as Seat }).get().error).toMatch(/did not stop after 200/);
    expect(createGameStore(endless, { seat: 'a' }).get().error).toMatch(/1000 rounds/);
  });

  it('K302: a debug edit through the store changes state, is its own undo step, survives a save/load round-trip, and is refused when the game has no debug verbs', async () => {
    type D = Omit<G, 'action'> & { readonly action: AnswerAction | DebugAction };
    const dbg = defineGame<D, ReturnType<typeof def.view>, Seat>({ ...def, rules: { ...RULES, debug: {} } });
    const saved: History<D>[] = [];
    const saves = { writeAutosave: (h: History<never>) => Promise.resolve(saved.push(h as unknown as History<D>)) };
    const store = createGameStore(dbg, { seat: 'a', seed: 'd', saves, undo: 'free' });
    store.answer(['1'], store.get().state.prompt?.id ?? 0);
    const before = store.get().state;
    expect(store.debug({ kind: 'debug', verb: 'set', args: { path: ['score', 'a'], value: 5 } })).toBeUndefined();
    expect(store.get().state.score).toEqual({ a: 5, b: 1 });
    expect(store.get().state.prompt).toEqual(before.prompt);
    expect(store.get().history.steps.length).toBe(2);
    await store.autosaved();
    expect(saved.at(-1)?.actions.at(-1)).toEqual({ kind: 'debug', verb: 'set', args: { path: ['score', 'a'], value: 5 } });
    expect(store.debug({ kind: 'debug', verb: 'set', args: { path: ['turn'], value: 1 } })).toMatch(/not a number/);
    expect(store.get().state.score).toEqual({ a: 5, b: 1 });
    const h = store.saved();
    const back = createGameStore(dbg, { seat: 'a', undo: 'free' });
    expect(back.load(createSave(dbg.rules, { options: h.options, rules: h.rules, actions: h.actions, undoUsed: false, savedAt: '' }, {}))).toBeNull();
    expect(hashState(back.get().state)).toBe(hashState(store.get().state));
    expect(back.get().history.steps.length).toBe(2);
    expect(store.undo()).toBe(true);
    expect(back.undo()).toBe(true);
    expect(store.get().state).toEqual(before);
    expect(hashState(back.get().state)).toBe(hashState(before));
    expect(createGameStore(def as unknown as typeof dbg, { seat: 'a', seed: 'd' }).debug({ kind: 'debug', verb: 'close' })).toMatch(/DEBUG/);
  });
});

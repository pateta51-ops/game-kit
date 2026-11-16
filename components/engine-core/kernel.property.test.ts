// Properties of the kernel (ported from Warp's Edge tests/property/kernel.property.test.ts; Warp's ran them with
// fast-check, the kit has none, so the cases come from the seeded rng):
// - the legal answers of a prompt and `validateAction` agree both ways, over a fixture game whose prompts have every
//   shape (1 to 4 options, some disabled, any min and max) and over the fake counter game;
// - random legal play keeps the game's invariants and the kernel's own (a prompt is open or the game is over);
// - the same seed and actions give the same hashes, and a replay reaches the last one.
// A failure names the seed, the action number and the prompt, so the run can be played again.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyAction, createGame, draftOf, hashState, randomInt, replay, seedRng, setInvariantChecking, validateAction, type Draft, type GameRules, type GameTypes, type KernelPrompt, type KernelState, type KernelTask } from './index.ts';
import { CONTENT, COUNTER, type Counter } from './fake/counter.ts';

interface FxTask extends KernelTask {
  readonly left: number;
}
interface FxState extends KernelState {
  readonly stack: readonly FxTask[];
  readonly result: 'won' | null;
}
interface Fx extends GameTypes {
  readonly state: FxState;
  readonly task: FxTask;
  readonly stamped: never;
  readonly rules: null;
  readonly content: null;
}

const ANSWERS = 15;
let fxChecked = 0;

const FX: GameRules<Fx> = {
  handlers: {
    ask: (ctx, t) => {
      const n = 1 + ctx.rng.int(4);
      const off = Array.from({ length: n }, () => ctx.rng.int(4) === 0);
      const min = ctx.rng.int(off.filter((d) => !d).length + 1);
      const max = Math.max(min, Math.min(3, min + ctx.rng.int(n - min + 1)));
      ctx.then({ kind: 'answered', left: t.left });
      ctx.ask({ min, max, options: off.map((d, i) => (d ? { id: `o${String(i)}`, enabled: false, why: 'fixture' } : { id: `o${String(i)}`, enabled: true })) });
    },
    answered: (ctx, t) => {
      if (t.left <= 1) draftOf(ctx).result = 'won';
      else ctx.then({ kind: 'ask', left: t.left - 1 });
    },
  },
  blank(options): Draft<FxState> {
    const [a, b, c, d] = seedRng(options.seed);
    return { rng: { a, b, c, d }, stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [] };
  },
  setup(ctx) {
    ctx.then({ kind: 'ask', left: ANSWERS });
  },
  contentHash: () => 'fx',
  invariants(state) {
    fxChecked += 1;
    const p = state.prompt;
    return p !== null && (p.min > p.max || state.stack.at(-1)?.kind !== 'answered') ? [{ id: 'FX-01', message: 'a prompt with min over max, or no task to resume' }] : [];
  },
};

const BOGUS = 'bogus';

/** Every answer the prompt accepts, as picks in option order: the enabled options, min to max of them. */
function legalAnswers(p: KernelPrompt): string[][] {
  const ids = p.options.filter((o) => o.enabled).map((o) => o.id);
  const out: string[][] = [];
  const grow = (from: number, picks: string[]): void => {
    if (picks.length >= p.min) out.push(picks);
    if (picks.length < p.max) for (let i = from; i < ids.length; i += 1) grow(i + 1, [...picks, ids[i] as string]);
  };
  grow(0, []);
  return out;
}

/** Every list of up to `most` ids over the options and one bogus id, repeats included. */
function candidates(ids: readonly string[], most: number): string[][] {
  const pool = [...ids, BOGUS];
  const out: string[][] = [[]];
  let layer: string[][] = [[]];
  for (let len = 1; len <= most; len += 1) {
    layer = layer.flatMap((prefix) => pool.map((id) => [...prefix, id]));
    for (const c of layer) out.push(c);
  }
  return out;
}

/** The disagreements between `legalAnswers` and `validateAction` at the open prompt of `s`. */
function disagreements(s: KernelState): string[] {
  const p = s.prompt;
  if (p === null) return [];
  const order = new Map(p.options.map((o, i) => [o.id, i]));
  const norm = (ids: readonly string[]): string => JSON.stringify([...ids].sort((a, b) => (order.get(a) ?? -1) - (order.get(b) ?? -1)));
  const legal = legalAnswers(p);
  const set = new Set(legal.map(norm));
  const ok = (picks: readonly string[], promptId = p.id): boolean => validateAction(s, { kind: 'answer', promptId, picks }).ok;
  const out = legal.filter((picks) => !ok(picks)).map((picks) => `legal but refused: ${JSON.stringify(picks)}`);
  for (const c of candidates(p.options.map((o) => o.id), p.max + 1)) {
    if (ok(c) !== set.has(norm(c))) out.push(`${ok(c) ? 'accepted but not legal' : 'legal but refused'}: ${JSON.stringify(c)}`);
  }
  const first = legal[0];
  if (first !== undefined && ok(first, p.id + 1)) out.push('accepted for a prompt that is not open');
  return out.map((m) => `${m} at ${JSON.stringify(p)}`);
}

interface Played<G extends GameTypes> {
  readonly state: G['state'];
  readonly actions: G['action'][];
  readonly hashes: string[];
  readonly prompts: KernelPrompt[];
}

/** Random legal answers (the driver's own rng) until the game ends or `most` actions; `each` returns the problems of a state. */
function randomPlay<G extends GameTypes>(game: GameRules<G>, start: G['state'], content: G['content'], driver: string, each: (s: G['state']) => readonly string[], most = 300): Played<G> {
  const rng = seedRng(driver);
  let s = start;
  const actions: G['action'][] = [];
  const hashes: string[] = [];
  const prompts: KernelPrompt[] = [];
  const check = (problems: readonly unknown[]): void => {
    if (problems.length > 0) {
      throw new Error(`driver ${driver}, after ${String(actions.length)} action(s), answers so far ${JSON.stringify(actions.map((a) => (a.kind === 'answer' ? a.picks : a.verb)))}: ${JSON.stringify(problems.slice(0, 5))}`);
    }
  };
  check(each(s));
  for (let i = 0; i < most && s.result === null; i += 1) {
    const p = s.prompt;
    if (p === null) throw new Error(`driver ${driver}: no prompt and no result after ${String(i)} action(s)`);
    prompts.push(p);
    const legal = legalAnswers(p);
    const picks = legal[randomInt(rng, legal.length)];
    if (picks === undefined) throw new Error(`driver ${driver}: no legal answer at ${JSON.stringify(p)}`);
    const action = { kind: 'answer', promptId: p.id, picks } as G['action'];
    const r = applyAction(game, s, action, content);
    actions.push(action);
    hashes.push(hashState(r.state));
    check(r.violations);
    check([
      ...(r.state.seq < s.seq || r.state.promptSeq < s.promptSeq ? ['a sequence number went down'] : []),
      ...((r.state.prompt === null) === (r.state.result === null) ? ['a prompt is open exactly while the game is not over'] : []),
      ...(r.state.prompt !== null && (r.state.prompt.id <= p.id || r.state.stack.length === 0) ? ['the new prompt has an old id or no task to resume'] : []),
    ]);
    s = r.state;
    check(each(s));
  }
  if (s.result === null) throw new Error(`driver ${driver}: no result after ${String(most)} actions`);
  return { state: s, actions, hashes, prompts };
}

const RUNS = 60;
const seeds = (tag: string, n = RUNS): string[] => {
  const w = seedRng(tag);
  return ['', 'é 漢', ...Array.from({ length: n - 2 }, () => `${tag}${String(randomInt(w, 1_000_000_000))}`)];
};
const fxStart = (seed: string): FxState => createGame(FX, { seed }, null, null).state;
const counterRules = (seed: string): Counter['rules'] => ({ target: seed.length % 2 === 0 ? 12 : 30 });
const counterStart = (seed: string): Counter['state'] => createGame(COUNTER, { seed }, counterRules(seed), CONTENT).state;

beforeAll(() => setInvariantChecking(true));
afterAll(() => setInvariantChecking(false));

describe('properties of the kernel', { timeout: 120_000 }, () => {
  it('the legal answers and validateAction agree both ways over the fixture game, whose prompts take every shape', () => {
    const shapes = new Set<string>();
    for (const seed of seeds('fx')) {
      const g = randomPlay(FX, fxStart(seed), null, `d-${seed}`, disagreements);
      expect(g.actions).toHaveLength(ANSWERS);
      for (const p of g.prompts) shapes.add(`${String(p.options.length)}/${String(p.options.filter((o) => o.enabled).length)}/${String(p.min)}/${String(p.max)}`);
    }
    // the fixture did reach the shapes that matter: no option enabled, an empty answer, several picks, max over the enabled ones
    const has = (f: (n: number, on: number, min: number, max: number) => boolean): boolean => [...shapes].some((k) => f(...(k.split('/').map(Number) as [number, number, number, number])));
    expect([has((_n, on) => on === 0), has((_n, _on, min) => min === 0), has((_n, _on, min) => min >= 2), has((_n, on, _min, max) => max > on), has((n, on) => n === 4 && on === 4)]).toEqual([true, true, true, true, true]);
    expect(shapes.size).toBeGreaterThan(15);
  });

  it('the legal answers and validateAction agree both ways, and the invariants hold, over random legal play of the counter game', () => {
    for (const seed of seeds('counter')) randomPlay(COUNTER, counterStart(seed), CONTENT, `d-${seed}`, disagreements);
  });

  it('random legal play of the fixture game runs its invariants after every action and breaks none', () => {
    const before = fxChecked;
    for (const seed of seeds('inv', 10)) randomPlay(FX, fxStart(seed), null, `i-${seed}`, () => []);
    expect(fxChecked - before).toBeGreaterThanOrEqual(10 * ANSWERS);
  });

  it('a broken invariant stops the play with the driver seed and the answers so far', () => {
    const bad: GameRules<Fx> = { ...FX, invariants: (s) => (s.promptSeq > 3 ? [{ id: 'FX-02', message: 'made up' }] : []) };
    expect(() => randomPlay(bad, fxStart('bad'), null, 'd-bad', () => [])).toThrow(/driver d-bad, after \d+ action\(s\), answers so far \[\[.*FX-02/);
  });

  it('a validateAction that disagrees with the legal answers is reported (the check can fail)', () => {
    const s = fxStart('x');
    expect(disagreements(s)).toEqual([]);
    expect(disagreements({ ...s, result: 'won' })[0]).toContain('legal but refused');
  });

  it('determinism: the same seed and actions give the same hashes, and a replay reaches the last one', () => {
    for (const seed of seeds('det', 30)) {
      const a = randomPlay(COUNTER, counterStart(seed), CONTENT, `d-${seed}`, () => []);
      const b = randomPlay(COUNTER, counterStart(seed), CONTENT, `d-${seed}`, () => []);
      expect(b.hashes).toEqual(a.hashes);
      expect(hashState(counterStart(seed))).toBe(hashState(counterStart(seed)));
      expect(replay(COUNTER, { seed }, counterRules(seed), a.actions, CONTENT, { contentHash: COUNTER.contentHash(CONTENT), finalHash: a.hashes.at(-1) as string })).toMatchObject({ ok: true, hash: a.hashes.at(-1) });
      const f = randomPlay(FX, fxStart(seed), null, `d-${seed}`, () => []);
      expect(randomPlay(FX, fxStart(seed), null, `d-${seed}`, () => []).hashes).toEqual(f.hashes);
      expect(replay(FX, { seed }, null, f.actions, null, { contentHash: 'fx', finalHash: f.hashes.at(-1) as string })).toMatchObject({ ok: true });
    }
  });
});

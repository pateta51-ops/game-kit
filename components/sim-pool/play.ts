// The driver contract and one simulated game (warps src/engine/drivers/{types,random}.ts and scripts/sim/core.ts, made
// generic over GameRules<G>; the crash record from ebr scripts/sim/pool.ts).
import {
  applyAction,
  createGame,
  hashValue,
  isRevealing,
  newHistory,
  type History,
  type AnswerAction,
  type GameRules,
  type GameTypes,
  type InvariantViolation,
  type KernelPrompt,
} from '../engine-core/index';
import { DriverRng } from './rng';

/** Decides the answers. The engine never calls a driver: the pool asks it and applies its answer. */
export interface Driver<G extends GameTypes = GameTypes> {
  readonly name: string;
  /** One of `answers` (or another legal action) for the open prompt of `state`; draws only from `rng`. */
  choose(state: G['state'], answers: readonly G['action'][], rng: DriverRng): G['action'];
  /** Why the last `choose` answered as it did; empty before the first choice. */
  reasons(): string[];
}

/** One game of a run. `settings` are the game's own (difficulty, variant...). */
export interface GameSpec {
  readonly index: number;
  readonly seed: string;
  readonly driver: string;
  readonly settings?: Readonly<Record<string, string | number | boolean>>;
}

/** What a game gives the pool. The module a worker loads exports it as `simGame`. */
export interface SimGame<G extends GameTypes, S = unknown, O = unknown> {
  /** A new observation for each game: `onPrompt` fills it, `summary` reads it. Keep per-game notes here, never in the module. */
  observation?(spec: GameSpec, content: G['content']): O;
  /** Called at every open prompt, before the driver answers. */
  onPrompt?(seen: O, state: G['state'], answers: readonly G['action'][]): void;
  readonly rules: GameRules<G>;
  /** Loaded once per thread. */
  content(): G['content'] | Promise<G['content']>;
  start(spec: GameSpec, content: G['content']): { options: G['options']; rules: G['rules'] };
  driver(name: string, spec: GameSpec, content: G['content']): Driver<G>;
  /** The legal answers to the open prompt; default `legalAnswers`. */
  answers?(state: G['state'], content: G['content'], rng: DriverRng): readonly G['action'][];
  /** The game's own counters for a game that ended (or stopped). */
  summary?(state: G['state'], actions: readonly G['action'][], content: G['content'], seen: O): S;
  /** A game with no result after this many actions fails (default 100,000). */
  readonly maxActions?: number;
  /** K120 bad-undo: an action that drew randomness (`state.rng` changed) or carried a `reseed` without a `reveal` event fails the game (safe undo could take it back). */
  readonly undoCheck?: boolean;
  /** K120: a problem with the open prompt (a placeholder such as `TODO:`) fails the game; return the message. */
  promptProblem?(state: G['state'], content: G['content']): string | undefined;
  /** K101: the client view of a state; with `view: true` it is built and serialized after setup and every action, and a throw or a view that cannot be serialized fails the game. */
  view?(state: G['state'], content: G['content']): unknown;
  /** K101: the action that moves the game on fast (defeat the boss, fill a track) at the open prompt; with `hasten: N` it is applied instead of the driver's answer after every N actions, so late stages are reached. Return undefined to let the driver answer. */
  hasten?(state: G['state'], content: G['content']): G['action'] | undefined;
}

/** K101 options of one game; both are off by default. */
export interface PlayOptions {
  readonly view?: boolean | undefined;
  readonly hasten?: number | undefined;
  /** Called after each step (also the one that threw) with its milliseconds and the largest view so far in JSON characters. */
  readonly onStep?: ((step: number, ms: StepMs, viewBytes?: number) => void) | undefined;
}
export interface StepMs {
  readonly answers: number;
  readonly choose: number;
  readonly apply: number;
  readonly view: number;
}

export interface SimRecord<S = unknown> {
  readonly index: number;
  readonly seed: string;
  readonly driver: string;
  readonly settings?: GameSpec['settings'];
  /** `state.result`; null when the game failed. */
  readonly result: unknown;
  readonly actions: number;
  /** The hash of the action list: equal hashes, equal games. */
  readonly hash: string;
  readonly error?: string;
  /** The thrown error's name, when it is not plain `Error`. */
  readonly errorName?: string;
  readonly violations?: readonly InvariantViolation[];
  /** The actions, kept only when the game failed (for replay). */
  readonly log?: readonly unknown[];
  readonly summary?: S;
  /** K101: the largest view in JSON characters, when views were rendered. */
  readonly viewBytes?: number;
}

export const ANSWER_CAP = 512;

const choose = (n: number, k: number): number => {
  let c = 1;
  for (let i = 0; i < k; i += 1) c = (c * (n - i)) / (i + 1);
  return c;
};

/** Every answer to `prompt` (subsets of its enabled options, in option order, of size min..max); over `cap`, `cap` samples. */
export function legalAnswers(prompt: KernelPrompt, rng: DriverRng, cap = ANSWER_CAP): AnswerAction[] {
  const ids = prompt.options.filter((o) => o.enabled).map((o) => o.id);
  const lo = Math.max(0, prompt.min);
  const hi = Math.min(prompt.max, ids.length);
  const of = (picks: string[]): AnswerAction => ({ kind: 'answer', promptId: prompt.id, picks });
  let total = 0;
  for (let k = lo; k <= hi; k += 1) total += choose(ids.length, k);
  if (total > cap) return Array.from({ length: cap }, () => of(rng.sample(ids, lo + rng.int(hi - lo + 1))));
  const out: AnswerAction[] = [];
  const walk = (from: number, picks: string[]): void => {
    if (picks.length >= lo) out.push(of(picks));
    if (picks.length === hi) return;
    for (let i = from; i < ids.length; i += 1) walk(i + 1, [...picks, ids[i] as string]);
  };
  walk(0, []);
  return out;
}

/** Picks among the answers at random, in proportion to `weight` (default 1 each). */
export function randomDriver<G extends GameTypes>(weight?: (a: G['action'], state: G['state']) => number): Driver<G> {
  let why = '';
  return {
    name: 'random',
    reasons: () => (why === '' ? [] : [why]),
    choose(state, answers, rng) {
      if (answers.length === 0) throw new RangeError('no legal answer');
      why = 'random: a weighted legal answer';
      const w = answers.map((a) => (weight ? weight(a, state) : 1));
      let x = (rng.int(1_000_000) / 1_000_000) * w.reduce((s, v) => s + v, 0);
      for (let i = 0; i < answers.length; i += 1) {
        x -= w[i] as number;
        if (x < 0) return answers[i] as G['action'];
      }
      return answers[answers.length - 1] as G['action'];
    },
  };
}

/** Play `spec` to its end, or for `until` actions (the driver still answers at that step, so what fails there fails again). Never throws: an error or an invariant violation ends the game as a failed record. */
export function playOne<G extends GameTypes, S, O = unknown>(game: SimGame<G, S, O>, content: G['content'], spec: GameSpec, until?: number, opts: PlayOptions = {}): SimRecord<S> {
  let seen: O | undefined;
  const actions: G['action'][] = [];
  const violations: InvariantViolation[] = [];
  let state: G['state'] | undefined;
  let error: string | undefined;
  let errorName: string | undefined;
  let viewBytes: number | undefined;
  const ms = { answers: 0, choose: 0, apply: 0, view: 0 };
  const render = (st: G['state']): void => {
    if (!opts.view || !game.view) return;
    const t = performance.now();
    try {
      viewBytes = Math.max(viewBytes ?? 0, (JSON.stringify(game.view(st, content)) ?? '').length);
    } catch (e) {
      throw new Error(`view after ${String(actions.length)} action(s): ${e instanceof Error ? e.message : String(e)}`, { cause: e });
    } finally {
      ms.view += performance.now() - t;
    }
  };
  try {
    const start = game.start(spec, content);
    seen = game.observation?.(spec, content);
    const first = createGame(game.rules, start.options, start.rules, content);
    let s: G['state'] = first.state;
    state = s;
    violations.push(...first.violations);
    render(s);
    const driver = game.driver(spec.driver, spec, content);
    const cap = game.maxActions ?? 100_000;
    while (s.result === null && violations.length === 0) {
      const p = s.prompt;
      if (p === null) throw new Error('no prompt is open and the game has no result');
      if (actions.length >= cap) throw new Error(`no result after ${String(cap)} actions`);
      ms.answers = ms.choose = ms.apply = ms.view = 0;
      let t = performance.now();
      const rng = new DriverRng(`${spec.seed}|${spec.driver}|${String(p.id)}`);
      const answers = game.answers ? game.answers(s, content, rng) : (legalAnswers(p, rng) as G['action'][]);
      if (answers.length === 0) throw new Error(`dead end: no legal answer to prompt ${String(p.id)}`);
      const bad = game.promptProblem?.(s, content);
      if (bad !== undefined) throw new Error(`placeholder prompt ${String(p.id)}: ${bad}`);
      game.onPrompt?.(seen as O, s, answers);
      ms.answers = performance.now() - t;
      t = performance.now();
      const fast = opts.hasten && actions.length > 0 && actions.length % opts.hasten === 0 ? game.hasten?.(s, content) : undefined;
      const a = fast ?? driver.choose(s, answers, rng);
      ms.choose = performance.now() - t;
      if (until !== undefined && actions.length >= until) break;
      actions.push(a);
      t = performance.now();
      const r = applyAction(game.rules, s, a, content);
      ms.apply = performance.now() - t;
      const w = s.rng;
      const n = r.state.rng;
      if (game.undoCheck && ((a.kind === 'answer' && a.reseed !== undefined) || n.a !== w.a || n.b !== w.b || n.c !== w.c || n.d !== w.d) && !isRevealing(r.events))
        violations.push({ id: 'bad-undo', message: `action ${String(actions.length)} drew randomness without a reveal event: safe undo could take it back` });
      s = r.state;
      state = s;
      violations.push(...r.violations);
      render(s);
      opts.onStep?.(actions.length - 1, { ...ms }, viewBytes);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    if (e instanceof Error && e.name !== 'Error') errorName = e.name;
    opts.onStep?.(actions.length - 1, { ...ms }, viewBytes);
  }
  const failed = error !== undefined || violations.length > 0;
  let summary: S | undefined;
  try {
    if (state !== undefined && game.summary) summary = game.summary(state, actions, content, seen as O);
  } catch (e) {
    error ??= `summary: ${e instanceof Error ? e.message : String(e)}`;
  }
  return {
    index: spec.index,
    seed: spec.seed,
    driver: spec.driver,
    ...(spec.settings ? { settings: spec.settings } : {}),
    result: failed ? null : (state?.result ?? null),
    actions: actions.length,
    hash: hashValue(actions),
    ...(error !== undefined ? { error } : {}),
    ...(errorName !== undefined ? { errorName } : {}),
    ...(violations.length ? { violations } : {}),
    ...(failed ? { log: actions } : {}),
    ...(summary !== undefined ? { summary } : {}),
    ...(viewBytes !== undefined ? { viewBytes } : {}),
  };
}

/** The hash of a crashed game: never checkpointed, so a resumed run plays it again. */
export const CRASH_HASH = 'crashed';

/** A game whose worker died: a failed record naming the game, so the rest of the run still counts. */
export const crashRecord = (spec: GameSpec, why: unknown): SimRecord<never> => ({
  index: spec.index,
  seed: spec.seed,
  driver: spec.driver,
  ...(spec.settings ? { settings: spec.settings } : {}),
  result: null,
  actions: 0,
  hash: CRASH_HASH,
  error: `crash in game ${String(spec.index)} (seed ${spec.seed}): ${why instanceof Error ? why.message : String(why)}`,
});

/** K120 breakpoint: play `spec` until `stop(state, actions)` is true before an action (or `stop` actions are played), and hand back the game there as an engine-core `History` (cursor at the end) with its state: import it to look at that exact point. */
export function breakAt<G extends GameTypes, S, O = unknown>(
  game: SimGame<G, S, O>,
  content: G['content'],
  spec: GameSpec,
  stop: number | ((state: G['state'], actions: readonly G['action'][]) => boolean),
): { history: History<G>; state: G['state'] } {
  const start = game.start(spec, content);
  let s: G['state'] = createGame(game.rules, start.options, start.rules, content).state;
  const actions: G['action'][] = [];
  const driver = game.driver(spec.driver, spec, content);
  while (s.result === null && s.prompt !== null && !(typeof stop === 'number' ? actions.length >= stop : stop(s, actions))) {
    const rng = new DriverRng(`${spec.seed}|${spec.driver}|${String(s.prompt.id)}`);
    const answers = game.answers ? game.answers(s, content, rng) : (legalAnswers(s.prompt, rng) as G['action'][]);
    const a = driver.choose(s, answers, rng);
    actions.push(a);
    s = applyAction(game.rules, s, a, content).state;
  }
  return { history: { ...newHistory<G>(start.options, start.rules), actions, cursor: actions.length }, state: s };
}

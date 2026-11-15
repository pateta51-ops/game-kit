// The driver contract and one simulated game (warps src/engine/drivers/{types,random}.ts and scripts/sim/core.ts, made
// generic over GameRules<G>; the crash record from ebr scripts/sim/pool.ts).
import {
  applyAction,
  createGame,
  hashValue,
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
export interface SimGame<G extends GameTypes, S = unknown> {
  readonly rules: GameRules<G>;
  /** Loaded once per thread. */
  content(): G['content'] | Promise<G['content']>;
  start(spec: GameSpec, content: G['content']): { options: G['options']; rules: G['rules'] };
  driver(name: string, spec: GameSpec, content: G['content']): Driver<G>;
  /** The legal answers to the open prompt; default `legalAnswers`. */
  answers?(state: G['state'], content: G['content'], rng: DriverRng): readonly G['action'][];
  /** The game's own counters for a game that ended (or stopped). */
  summary?(state: G['state'], actions: readonly G['action'][], content: G['content']): S;
  /** A game with no result after this many actions fails (default 100,000). */
  readonly maxActions?: number;
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
  readonly violations?: readonly InvariantViolation[];
  /** The actions, kept only when the game failed (for replay). */
  readonly log?: readonly unknown[];
  readonly summary?: S;
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

/** Play `spec` to its end. Never throws: an error or an invariant violation ends the game as a failed record. */
export function playOne<G extends GameTypes, S>(game: SimGame<G, S>, content: G['content'], spec: GameSpec): SimRecord<S> {
  const actions: G['action'][] = [];
  const violations: InvariantViolation[] = [];
  let state: G['state'] | undefined;
  let error: string | undefined;
  try {
    const start = game.start(spec, content);
    const first = createGame(game.rules, start.options, start.rules, content);
    let s: G['state'] = first.state;
    state = s;
    violations.push(...first.violations);
    const driver = game.driver(spec.driver, spec, content);
    const cap = game.maxActions ?? 100_000;
    while (s.result === null && violations.length === 0) {
      const p = s.prompt;
      if (p === null) throw new Error('no prompt is open and the game has no result');
      if (actions.length >= cap) throw new Error(`no result after ${String(cap)} actions`);
      const rng = new DriverRng(`${spec.seed}|${spec.driver}|${String(p.id)}`);
      const answers = game.answers ? game.answers(s, content, rng) : (legalAnswers(p, rng) as G['action'][]);
      const a = driver.choose(s, answers, rng);
      actions.push(a);
      const r = applyAction(game.rules, s, a, content);
      s = r.state;
      state = s;
      violations.push(...r.violations);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const failed = error !== undefined || violations.length > 0;
  let summary: S | undefined;
  try {
    if (state !== undefined && game.summary) summary = game.summary(state, actions, content);
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
    ...(violations.length ? { violations } : {}),
    ...(failed ? { log: actions } : {}),
    ...(summary !== undefined ? { summary } : {}),
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

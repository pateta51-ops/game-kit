// The driver contract and one simulated game (warps src/engine/drivers/{types,random}.ts and scripts/sim/core.ts, made
// generic over GameRules<G>; the crash record from ebr scripts/sim/pool.ts).
import {
  seatKey,
  applyAction,
  canonicalJson,
  createGame,
  formatTriggerCap,
  hashValue,
  isRevealing,
  newHistory,
  StateInvariantError,
  type History,
  type AnswerAction,
  type DebugAction,
  type GameRules,
  type GameTypes,
  type InvariantViolation,
  type KernelPrompt,
  type TriggerCapDiagnostic,
  type LocatedTriggerCap,
} from '../engine-core/index.ts';
import { DriverRng } from './rng.ts';
import { isPortSimGame, playPortOne, type PortSimGame } from './port.ts';
import type { PortTypes } from '../engine-core/index.ts';

/** Decides the answers. The engine never calls a driver: the pool asks it and applies its answer. */
export interface Driver<G extends GameTypes = GameTypes> {
  readonly name: string;
  /** One of `answers` (or another legal action) for the open prompt of `state`; draws only from `rng`. */
  choose(state: G['state'], answers: readonly G['action'][], rng: DriverRng): G['action'] | DebugAction;
  /** Why the last `choose` answered as it did; empty before the first choice. */
  reasons(): string[];
  /** K274: mark drivers whose decisions depend on previous calls. Hidden checks still compare their legal answers. */
  readonly stateful?: boolean;
}

/** One game of a run. `settings` are the game's own (difficulty, variant...). */
export interface GameSpec {
  readonly index: number;
  readonly seed: string;
  readonly driver: string;
  readonly settings?: Readonly<Record<string, string | number | boolean>>;
}

interface ViewAssertions {
  readonly secrets?: readonly string[];
  readonly leakKeys?: readonly string[];
}

/** A public view and its secrecy assertions for one seat. */
export interface ViewObservation {
  readonly seat: string | number;
  read(): { view: unknown } & ViewAssertions;
}

type DriverViewValidation = <V>(state: unknown, seat: ViewObservation['seat'] | undefined, read: () => V) => V;
const driverViewScope = Symbol.for('game-kit.sim-pool.driver-view/v1');
const scope = globalThis as typeof globalThis & { [driverViewScope]?: DriverViewValidation };

/** Read the real policy input, checking it when the synchronous choice is under validation. */
export function readDriverView<V, S extends ViewObservation['seat'] | undefined>(state: unknown, seat: S, read: (seat: S) => V): V {
  const validate = scope[driverViewScope];
  return validate ? validate(state, seat, () => read(seat)) : read(seat);
}

export function withDriverViewValidation<T>(choose: () => T, validate?: DriverViewValidation): T {
  // A bundled simulator and an imported game can have separate module instances.
  const previous = scope[driverViewScope];
  if (!previous && !validate) return choose();
  if (validate) scope[driverViewScope] = validate;
  else delete scope[driverViewScope];
  try {
    return choose();
  } finally {
    if (previous) scope[driverViewScope] = previous;
    else delete scope[driverViewScope];
  }
}

const registrationBrand = Symbol.for('game-kit.sim-pool.driver-registration/v1');

/** An invalid driver registration makes a batch fail preflight. */
export class DriverRegistrationError extends Error {
  override readonly name = 'DriverRegistrationError';
  readonly [registrationBrand] = true;
}

export const isDriverRegistrationError = (error: unknown): error is DriverRegistrationError =>
  error instanceof Error && Object.hasOwn(error, registrationBrand) && Reflect.get(error, registrationBrand) === true && typeof error.message === 'string';

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
  /** Reject invalid registrations before setup or driver creation. May return the canonical registration, used if the driver has no name. Must only depend on the declared registry. */
  validateDriver?(name: string): string | void;
  /** The legal answers to the open prompt; default `legalAnswers`. For hidden checks, enumerate only seat-visible choices and keep this callback pure apart from draws from `rng`. */
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
  /** Seat-aware validation after setup and each action. A legacy view callback takes precedence when present. */
  observeViews?(state: G['state'], content: G['content'], context: { readonly cheated: boolean }): readonly ViewObservation[];
  /** Seat assertions for the view a driver consumes. A legacy view retains its own assertions. */
  driverViewAssertions?(state: G['state'], seat: ViewObservation['seat'], content: G['content']): ViewAssertions;
  /** K238 (GAPS-3 A10): with `view: true`, the strings the view must not show (hidden card ids, names); a view that holds one as a value, a key or a whole word fails the game (`view leak: ...`). */
  secrets?(state: G['state'], content: G['content']): readonly string[];
  /** K238: key names the view must not hold (opt-in, like viewLeaks `keys`: e.g. `['rng']`; `stack` may be a real zone); each fails the game as `key:<name>`. Works with or without `secrets`. */
  leakKeys?(state: G['state'], content: G['content']): readonly string[];
  /** K101: the action that moves the game on fast (defeat the boss, fill a track) at the open prompt; with `hasten: N` it is applied instead of the driver's answer after every N actions, so late stages are reached. Return undefined to let the driver answer. */
  hasten?(state: G['state'], content: G['content']): G['action'] | DebugAction | undefined;
  /** K737: one random debug edit (an engine-core `DebugAction`) for a game with `GameRules.debug`; with `debug: N` it is applied instead of the driver's answer after every N play actions, and recorded like any action. Draw only from `rng` (seeded, so a replay repeats it). Return undefined for none. */
  randomDebug?(state: G['state'], content: G['content'], rng: DriverRng): DebugAction | undefined;
  /** K274 (G06/T9): return a consistent alternate world with the same public information, drawing only from `rng`. Hidden checks use it to compare the legal answers and choice. */
  reshuffleHidden?(state: G['state'], seat: KernelPrompt['seat'], rng: DriverRng, content: G['content']): G['state'];
  /** K490: the game's ability trace (card-harness `traceAbilities` fits): cleared before each game; its `resolved` ids are stored on the record as `resolved`, so a run merges them across workers. */
  trace?(content: G['content']): ResolvedTrace | undefined;
  /** K651: did the effect do something? With `trace`, each resolve counts (`resolved`) only when this returns true, else it goes to the record's `noOp`: per effect when the trace gives `effects` (the state around that one effect), else over the whole action (a no-op clause then counts when another effect of the same action moves the part it reads). Ids without an effect entry resolved in setup or between actions count unchecked. */
  changed?(clause: string, before: G['state'], after: G['state'], content: G['content']): boolean;
}

/** K490: what `SimGame.trace` returns. */
export interface ResolvedTrace {
  readonly resolved: Iterable<string>;
  /** K651: one entry per effect resolved, with the state just before and just after that effect (the game's engine knows the boundary); `SimGame.changed` judges each, and only ids without an entry are judged over the whole action. `clear()` empties it. */
  readonly effects?: Iterable<{ readonly clause: string; readonly before: unknown; readonly after: unknown }>;
  clear(): void;
}

export function leaks(view: unknown, secrets: readonly string[], keys: readonly string[]): string[] {
  const out = new Set<string>();
  const hit = (t: string): void => {
    for (const x of secrets) if (x !== '' && (t === x || new RegExp(`(?<![A-Za-z0-9_])${x.replace(/\W/g, '\\$&')}(?![A-Za-z0-9_])`).test(t))) out.add(x);
  };
  const walk = (v: unknown): void => {
    if (typeof v === 'string') hit(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v !== null && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (keys.includes(k)) out.add(`key:${k}`); hit(k); walk(x); }
  };
  walk(view);
  return [...out];
}

type JsonView = null | boolean | number | string | JsonView[] | { [key: string]: JsonView };

export function jsonView(value: unknown, parents = new Set<object>()): JsonView {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return value;
  const invalid = () => new TypeError('view must be JSON data without lossy values, accessors, or cycles');
  if (typeof value !== 'object' || parents.has(value)) throw invalid();
  const array = Array.isArray(value);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) throw invalid();
  const keys = Reflect.ownKeys(value);
  if (array && keys.length !== value.length + 1) throw invalid();
  if (typeof Reflect.get(value, 'toJSON') === 'function') throw invalid();
  parents.add(value);
  const entries: [string, JsonView][] = [];
  for (const key of keys) {
    if (array && key === 'length') continue;
    if (typeof key !== 'string' || (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))) throw invalid();
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (!property?.enumerable || !Object.hasOwn(property, 'value') || !Object.is(Reflect.get(value, key), property.value)) throw invalid();
    entries.push([key, jsonView(property.value, parents)]);
  }
  parents.delete(value);
  if (!array) return Object.fromEntries(entries);
  const items: JsonView[] = [];
  for (const [key, item] of entries) items[Number(key)] = item;
  return items;
}

/** K101 options of one game; both are off by default. */
export interface PlayOptions {
  readonly view?: boolean | undefined;
  readonly hasten?: number | undefined;
  /** K737: apply the game's `randomDebug` edit after every N play actions (games with `GameRules.debug`). */
  readonly debug?: number | undefined;
  /** K274: check actual and `reshuffleHidden` worlds at every decision (`true`) or at this share (0..1; sampled independently of game RNG). Different legal answers or choices fail as `hidden-info`. Off by default. */
  readonly hidden?: boolean | number | undefined;
  /** Called after each step (also the one that threw) with its milliseconds and the largest view so far in JSON characters. */
  readonly onStep?: ((step: number, ms: StepMs, viewBytes?: number) => void) | undefined;
}
export interface StepMs {
  readonly answers: number;
  readonly choose: number;
  readonly apply: number;
  readonly view: number;
}

const viewValidationScope = 'snapshots-and-driver-views';

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
  /** The first trigger cap that stopped validation. Captured with the seed and replay log. */
  readonly triggerCap?: LocatedTriggerCap;
  /** Evidence that the run could detect trigger truncation. Older checkpoints must replay. */
  readonly triggerCapChecked?: true;
  /** Current foreign-port execution protocol; does not claim kernel trigger-cap diagnostics. */
  readonly portExecution?: 1;
  /** Requested validation modes for port checkpoint eligibility. Executed view evidence is separate. */
  readonly portChecks?: { readonly invariants: boolean; readonly view: boolean };
  /** The actions, kept only when the game failed (for replay). */
  readonly log?: readonly unknown[];
  readonly summary?: S;
  /** K101: the largest view in JSON characters, when views were rendered. */
  readonly viewBytes?: number;
  /** Evidence for this run. Historical records may lack it. */
  readonly viewValidation?: {
    readonly status: 'skipped' | 'not-run' | 'unavailable' | 'executed' | 'failed';
    readonly checked: number;
    readonly scope?: typeof viewValidationScope;
  };
  /** The selected policy identity. Driver still records the requested registration and keys replay randomness. */
  readonly resolvedDriver?: string;
  /** K490: the ids `SimGame.trace` saw resolved in this game, sorted. */
  readonly resolved?: readonly string[];
  /** K651: ids resolved in this game only by actions after which `SimGame.changed` said nothing changed, sorted. */
  readonly noOp?: readonly string[];
}

type ViewValidationEvidence = NonNullable<SimRecord['viewValidation']>;

export const viewEvidence = (status: ViewValidationEvidence['status'], checked: number): ViewValidationEvidence =>
  status === 'executed' ? { status, checked, scope: viewValidationScope } : { status, checked };

export function hasExecutedViewValidation(record: SimRecord): boolean {
  const evidence = record.viewValidation;
  return evidence?.status === 'executed' && evidence.scope === viewValidationScope &&
    Number.isSafeInteger(evidence.checked) && evidence.checked > 0;
}

export const ANSWER_CAP = 512;

const choose = (n: number, k: number): number => {
  let c = 1;
  for (let i = 0; i < k; i += 1) c = (c * (n - i)) / (i + 1);
  return c;
};

/** Every answer to `prompt` (subsets of its enabled options, in option order, of size min..max); over `cap`, `cap` samples. A prompt of kind `order` (A8) also gets every other order of each subset. */
export function legalAnswers(prompt: KernelPrompt, rng: DriverRng, cap = ANSWER_CAP): AnswerAction[] {
  const alone: AnswerAction[] = prompt.options.filter((o) => o.enabled && o.alone === true).map((o) => ({ kind: 'answer', promptId: prompt.id, picks: [o.id] }));
  return [...combos(prompt, rng, cap), ...alone];
}

function combos(prompt: KernelPrompt, rng: DriverRng, cap: number): AnswerAction[] {
  const ids = prompt.options.filter((o) => o.enabled && o.alone !== true).map((o) => o.id);
  const lo = Math.max(0, prompt.min);
  const hi = Math.min(prompt.max, ids.length);
  const of = (picks: string[]): AnswerAction => ({ kind: 'answer', promptId: prompt.id, picks });
  const ordered = prompt.kind === 'order';
  let total = 0;
  for (let k = lo; k <= hi; k += 1) total += ordered ? choose(ids.length, k) * Array.from({ length: k }, (_, i) => i + 1).reduce((a, b) => a * b, 1) : choose(ids.length, k);
  if (total > cap) {
    return Array.from({ length: cap }, () => {
      const picks = rng.sample(ids, lo + rng.int(hi - lo + 1));
      if (ordered) for (let i = picks.length - 1; i > 0; i -= 1) { const j = rng.int(i + 1); [picks[i], picks[j]] = [picks[j] as string, picks[i] as string]; }
      return of(picks);
    });
  }
  const out: AnswerAction[] = [];
  const walk = (from: number, picks: string[]): void => {
    if (picks.length >= lo) out.push(of(picks));
    if (picks.length === hi) return;
    for (let i = ordered ? 0 : from; i < ids.length; i += 1) if (!picks.includes(ids[i] as string)) walk(i + 1, [...picks, ids[i] as string]);
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

/** K222: one driver per seat, chosen by the open prompt's `seat`; `other` answers a prompt with no seat or an unlisted one (else it throws). */
export function bySeat<G extends GameTypes>(drivers: Readonly<Record<string, Driver<G>>>, other?: Driver<G>): Driver<G> {
  let last: Driver<G> | undefined;
  return {
    name: Object.entries(drivers).map(([k, d]) => `${k}:${d.name}`).join(','),
    ...(other?.stateful || Object.values(drivers).some(d => d.stateful) ? { stateful: true } : {}),
    reasons: () => last?.reasons() ?? [],
    choose(state, answers, rng) {
      const seat = state.prompt?.seat;
      const k = seatKey(seat);
      const d = (k === undefined ? undefined : drivers[k]) ?? other;
      if (d === undefined) throw new RangeError(`bySeat: no driver for seat ${String(seat)}`);
      last = d;
      return d.choose(state, answers, rng);
    },
  };
}

function evaluateAlternate<T>(context: string, source: string, run: () => T): T {
  try {
    return run();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`${context} ${source} failed in the alternate world: ${message}`, { cause });
  }
}

/** Play `spec` to its end, or for `until` actions (the driver still answers at that step, so what fails there fails again). Never throws: an error or an invariant violation ends the game as a failed record. */
export function playOne<G extends GameTypes, S, O = unknown>(game: SimGame<G, S, O>, content: G['content'], spec: GameSpec, until?: number, opts?: PlayOptions): SimRecord<S>;
export function playOne<G extends PortTypes, S, O = unknown>(game: PortSimGame<G, S, O>, content: G['content'], spec: GameSpec, until?: number, opts?: PlayOptions): SimRecord<S>;
export function playOne(game: SimGame<GameTypes> | PortSimGame<PortTypes>, content: unknown, spec: GameSpec, until?: number, opts?: PlayOptions): SimRecord;
export function playOne(game: unknown, content: unknown, spec: GameSpec, until?: number, opts: PlayOptions = {}): SimRecord {
  return isPortSimGame(game) ? playPortOne(game, content, spec, until, opts) : playKernelOne(game as SimGame<GameTypes>, content, spec, until, opts);
}

function playKernelOne<G extends GameTypes, S, O = unknown>(game: SimGame<G, S, O>, content: G['content'], spec: GameSpec, until: number | undefined, opts: PlayOptions): SimRecord<S> {
  let seen: O | undefined;
  const actions: (G['action'] | DebugAction)[] = [];
  let sinceDebug = 0;
  const violations: InvariantViolation[] = [];
  let state: G['state'] | undefined;
  let error: string | undefined;
  let errorName: string | undefined;
  let triggerCap: LocatedTriggerCap | undefined;
  const rejectTriggerCap = (found: TriggerCapDiagnostic | undefined, actionIndex: number | null): void => {
    if (found === undefined) return;
    triggerCap = { ...found, actionIndex };
    throw new Error(formatTriggerCap(triggerCap));
  };
  let viewBytes: number | undefined;
  let viewStatus: NonNullable<SimRecord['viewValidation']>['status'] = opts.view ? 'not-run' : 'skipped';
  let viewsChecked = 0;
  let cheated = false;
  let resolvedDriver: string | undefined;
  const snapshotAssertions = new Map<ViewObservation['seat'], ViewAssertions[]>();
  const ms = { answers: 0, choose: 0, apply: 0, view: 0 };
  const trace = game.trace?.(content);
  trace?.clear();
  const counted = trace && game.changed ? new Set<string>() : undefined;
  const noOp = new Set<string>();
  const judge = (before?: G['state'], after?: G['state']): void => {
    if (!counted || !trace || !game.changed) return;
    const effects = [...(trace.effects ?? [])];
    for (const e of effects) (game.changed(e.clause, e.before as G['state'], e.after as G['state'], content) ? counted : noOp).add(e.clause);
    const each = new Set(effects.map((e) => e.clause));
    for (const id of trace.resolved) if (!each.has(id)) (before === undefined || after === undefined || game.changed(id, before, after, content) ? counted : noOp).add(id);
    trace.clear();
  };
  const validating = <T>(read: (validate: (view: unknown, secrets?: readonly string[], keys?: readonly string[]) => void) => T,
    location: () => string): T => {
    const t = performance.now();
    const validate = (view: unknown, secrets: readonly string[] = [], keys: readonly string[] = []): void => {
      const json = jsonView(view);
      viewBytes = Math.max(viewBytes ?? 0, JSON.stringify(json).length);
      const bad = secrets.length || keys.length ? leaks(json, secrets, keys) : [];
      if (bad.length) throw new Error(`view leak: ${bad.join(', ')}`);
      viewsChecked += 1;
    };
    try {
      const value = read(validate);
      if (viewStatus !== 'failed') viewStatus = 'executed';
      return value;
    } catch (e) {
      if (viewStatus !== 'unavailable') viewStatus = 'failed';
      throw new Error(`view after ${String(actions.length)} action(s)${location()}: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
    } finally {
      ms.view += performance.now() - t;
    }
  };
  const render = (st: G['state']): void => {
    if (!opts.view) return;
    snapshotAssertions.clear();
    let seat: ViewObservation['seat'] | undefined;
    validating((validate) => {
      if (game.view) validate(game.view(st, content), game.secrets?.(st, content), game.leakKeys?.(st, content));
      else {
        const observations = game.observeViews?.(st, content, { cheated }) ?? [];
        if (observations.length === 0) {
          viewStatus = 'unavailable';
          throw new Error('view validation unavailable: no seats to observe');
        }
        for (const observation of observations) {
          seat = observation.seat;
          const { view, secrets, leakKeys } = observation.read();
          validate(view, secrets, leakKeys);
          if (!game.driverViewAssertions) {
            const assertions = snapshotAssertions.get(seat) ?? [];
            assertions.push({ ...(secrets === undefined ? {} : { secrets }), ...(leakKeys === undefined ? {} : { leakKeys }) });
            snapshotAssertions.set(seat, assertions);
          }
        }
      }
    }, () => seat === undefined ? '' : ` (seat ${String(seat)})`);
  };
  const driverAssertions = (st: G['state'], seat: ViewObservation['seat'] | undefined): ViewAssertions => {
    if (game.view) return { secrets: game.secrets?.(st, content) ?? [], leakKeys: game.leakKeys?.(st, content) ?? [] };
    if (seat === undefined) return {};
    if (game.driverViewAssertions) return game.driverViewAssertions(st, seat, content);
    const assertions = st === state ? snapshotAssertions.get(seat)
      : game.observeViews?.(st, content, { cheated }).filter((observation) => observation.seat === seat).map((observation) => observation.read());
    return { secrets: assertions?.flatMap((a) => a.secrets ?? []) ?? [], leakKeys: assertions?.flatMap((a) => a.leakKeys ?? []) ?? [] };
  };
  const chooseAction = (driver: Driver<G>, st: G['state'], answers: readonly G['action'][], rng: DriverRng): G['action'] | DebugAction => {
    const choose = () => driver.choose(st, answers, rng);
    if (!opts.view) return withDriverViewValidation(choose);
    let rejection: Error | undefined;
    const action = withDriverViewValidation(choose, (viewState, seat, read) => {
      try {
        return validating((validate) => {
          const view = read();
          const { secrets, leakKeys } = driverAssertions(viewState as G['state'], seat);
          validate(view, secrets, leakKeys);
          return view;
        }, () => seat === undefined ? ' (driver)' : ` (driver seat ${String(seat)})`);
      } catch (error) {
        rejection ??= error instanceof Error ? error : new Error(String(error));
        throw error;
      }
    });
    if (rejection !== undefined) throw rejection;
    return action;
  };
  try {
    if (opts.view && !game.view && !game.observeViews) {
      viewStatus = 'unavailable';
      throw new Error('view validation unavailable: the game has no view adapter');
    }
    if (opts.hidden && !game.reshuffleHidden) throw new Error('hidden: the game has no reshuffleHidden, so the hidden-shuffle check cannot run');
    const registration = game.validateDriver?.(spec.driver);
    const start = game.start(spec, content);
    seen = game.observation?.(spec, content);
    const first = createGame(game.rules, start.options, start.rules, content);
    judge();
    let s: G['state'] = first.state;
    state = s;
    violations.push(...first.violations);
    rejectTriggerCap(first.triggerCap, null);
    render(s);
    const driver = game.driver(spec.driver, spec, content);
    resolvedDriver = driver.name || registration || spec.driver;
    let hiddenDriver: Driver<G> | undefined;
    const cap = game.maxActions ?? 100_000;
    while (s.result === null && violations.length === 0) {
      const p = s.prompt;
      if (p === null) throw new Error('no prompt is open and the game has no result');
      if (actions.length >= cap) throw new Error(`no result after ${String(cap)} actions`);
      ms.answers = ms.choose = ms.apply = ms.view = 0;
      let t = performance.now();
      const key = `${spec.seed}|${spec.driver}|${String(p.id)}`;
      const rng = new DriverRng(key);
      const answers = game.answers ? game.answers(s, content, rng) : (legalAnswers(p, rng) as G['action'][]);
      if (answers.length === 0) throw new Error(`dead end: no legal answer to prompt ${String(p.id)}`);
      const bad = game.promptProblem?.(s, content);
      if (bad !== undefined) throw new Error(`placeholder prompt ${String(p.id)}: ${bad}`);
      game.onPrompt?.(seen as O, s, answers);
      ms.answers = performance.now() - t;
      t = performance.now();
      const fast = opts.hasten && actions.length > 0 && actions.length % opts.hasten === 0 ? game.hasten?.(s, content) : undefined;
      const dbg = opts.debug && game.rules.debug !== undefined && sinceDebug >= opts.debug ? game.randomDebug?.(s, content, new DriverRng(`${spec.seed}|${spec.driver}|debug|${String(actions.length)}`)) : undefined;
      let a: G['action'] | DebugAction | undefined = dbg ?? fast;
      if (opts.hidden && game.reshuffleHidden && (opts.hidden === true || new DriverRng(`${spec.seed}|${spec.driver}|hidden-sample|${String(actions.length)}`).chance(opts.hidden))) {
        const context = `hidden-info: at step ${String(actions.length)} seat ${String(p.seat)} prompt ${String(p.id)}`;
        const reshuffle = game.reshuffleHidden.bind(game);
        const other = evaluateAlternate(context, 'SimGame.reshuffleHidden', () =>
          reshuffle(structuredClone(s), p.seat, new DriverRng(`${spec.seed}|${spec.driver}|hidden|${String(p.id)}|shuffle`), content));
        const otherPrompt = other.prompt;
        if (otherPrompt?.id !== p.id || seatKey(otherPrompt.seat) !== seatKey(p.seat)) throw new Error(`${context} the alternate world changed the deciding prompt; check SimGame.reshuffleHidden`);
        const otherRng = new DriverRng(key);
        const otherAnswers = evaluateAlternate(context, game.answers ? 'SimGame.answers' : 'legalAnswers', () =>
          game.answers ? game.answers(other, content, otherRng) : legalAnswers(otherPrompt, otherRng) as G['action'][]);
        if (canonicalJson(answers) !== canonicalJson(otherAnswers)) throw new Error(`${context} legal answers changed in order or payload when only hidden state changed; check SimGame.answers and the prompt options`);
        if (!driver.stateful && a === undefined) {
          const otherChoice = evaluateAlternate(context, 'driver choice', () => {
            hiddenDriver ??= game.driver(spec.driver, spec, content);
            return chooseAction(hiddenDriver, other, otherAnswers, otherRng);
          });
          a = chooseAction(driver, s, answers, rng);
          if (canonicalJson(a) !== canonicalJson(otherChoice)) throw new Error(`${context} the driver answered differently when only hidden state changed; check the seat view and driver callbacks`);
        }
      }
      const action = a ?? chooseAction(driver, s, answers, rng);
      if (dbg) sinceDebug = 0;
      else sinceDebug += 1;
      ms.choose = performance.now() - t - ms.view;
      if (until !== undefined && actions.length >= until) break;
      actions.push(action);
      if (action.kind === 'debug') cheated = true;
      t = performance.now();
      judge();
      const r = applyAction(game.rules, s, action, content);
      ms.apply = performance.now() - t;
      judge(s, r.state);
      const w = s.rng;
      const n = r.state.rng;
      if (game.undoCheck && ((action.kind === 'answer' && action.reseed !== undefined) || n.a !== w.a || n.b !== w.b || n.c !== w.c || n.d !== w.d) && !isRevealing(r.events))
        violations.push({ id: 'bad-undo', message: `action ${String(actions.length)} drew randomness without a reveal event: safe undo could take it back` });
      s = r.state;
      state = s;
      violations.push(...r.violations);
      rejectTriggerCap(r.triggerCap, actions.length - 1);
      render(s);
      opts.onStep?.(actions.length - 1, { ...ms }, viewBytes);
    }
  } catch (e) {
    if (e instanceof StateInvariantError) {
      for (const violation of e.violations) violations.push(violation);
    } else {
      error = e instanceof Error ? e.message : String(e);
      if (e instanceof Error && e.name !== 'Error') errorName = e.name;
    }
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
    ...(triggerCap === undefined ? {} : { triggerCap }),
    triggerCapChecked: true,
    ...(summary !== undefined ? { summary } : {}),
    ...(viewBytes !== undefined ? { viewBytes } : {}),
    viewValidation: viewEvidence(viewStatus, viewsChecked),
    ...(resolvedDriver === undefined ? {} : { resolvedDriver }),
    ...(counted ? { resolved: [...counted].sort() } : trace ? { resolved: [...new Set(trace.resolved)].sort() } : {}),
    ...(counted && [...noOp].some((id) => !counted.has(id)) ? { noOp: [...noOp].filter((id) => !counted.has(id)).sort() } : {}),
  };
}

/** The hash of a crashed game: never checkpointed, so a resumed run plays it again. */
export const CRASH_HASH = 'crashed';

/** A game whose worker died: a failed record naming the game, so the rest of the run still counts. */
export const crashRecord = (spec: Pick<SimRecord, 'index' | 'seed' | 'driver' | 'settings'>, why: unknown): SimRecord<never> => ({
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
    const a = withDriverViewValidation(() => driver.choose(s, answers, rng));
    actions.push(a);
    s = applyAction(game.rules, s, a, content).state;
  }
  return { history: { ...newHistory<G>(start.options, start.rules), actions, cursor: actions.length }, state: s };
}

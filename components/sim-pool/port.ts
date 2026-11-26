import { canonicalJson, hashValue, isChecking, StateInvariantError, type EnginePort, type InvariantViolation, type PortAnswer, type PortTypes } from '../engine-core/index.ts';
import type { Bot } from './bot.ts';
import { jsonView, leaks, readDriverView, viewEvidence, withDriverViewValidation, type GameSpec, type PlayOptions, type ResolvedTrace, type SimRecord } from './play.ts';
import type { DriverRng } from './rng.ts';
import { DriverRng as Rng } from './rng.ts';

/** A legal-answer driver for a foreign engine; answers keep the port's string or numeric prompt id. */
export interface PortDriver<G extends PortTypes> {
  readonly name: string;
  choose(state: G['state'], answers: readonly PortAnswer[], rng: DriverRng): PortAnswer;
  reasons(): string[];
}

/** An additive simulation module for an engine with its own state and prompt semantics. */
export interface PortSimGame<G extends PortTypes, S = unknown, O = unknown> {
  content(): G['content'] | Promise<G['content']>;
  /** A fresh full-game port per spec, not a Scenario fixture. Its result is null/undefined until genuinely terminal. */
  port(spec: GameSpec, content: G['content']): EnginePort<G> & Required<Pick<EnginePort<G>, 'result'>>;
  /** The game enumerates its own cardinality, ordering, repeated-pick and pass rules. No policy is inferred from options. */
  answers(state: G['state'], content: G['content'], rng: DriverRng): readonly PortAnswer[];
  driver(name: string, spec: GameSpec, content: G['content']): PortDriver<G>;
  validateDriver?(name: string): string | void;
  readonly maxActions?: number;
  observation?(spec: GameSpec, content: G['content']): O;
  onPrompt?(seen: O, state: G['state'], answers: readonly PortAnswer[]): void;
  summary?(state: G['state'], actions: readonly PortAnswer[], content: G['content'], seen: O): S;
  /** `before` is a snapshot even when the port mutates its input. Non-cloneable states cannot use this hook. */
  transitionInvariants?(before: G['state'], after: G['state'], answer: PortAnswer, content: G['content']): readonly InvariantViolation[];
  trace?(content: G['content']): ResolvedTrace | undefined;
  changed?(clause: string, before: G['state'], after: G['state'], content: G['content']): boolean;
  view?(state: G['state'], content: G['content']): unknown;
  secrets?(state: G['state'], content: G['content']): readonly string[];
  leakKeys?(state: G['state'], content: G['content']): readonly string[];
  driverViewAssertions?(state: G['state'], seat: string | number | undefined, content: G['content']): { readonly secrets?: readonly string[]; readonly leakKeys?: readonly string[] };
}

export const isPortSimGame = (game: unknown): game is PortSimGame<PortTypes> =>
  game !== null && typeof game === 'object' && 'port' in game && typeof game.port === 'function'
  && !('rules' in game && 'start' in game && typeof game.start === 'function');

export const UNSUPPORTED_PORT_OPTION = 'UnsupportedPortOptionError';

export function portOptionProblem(game: object, opts: PlayOptions): string | undefined {
  if ('undoCheck' in game && game.undoCheck) return 'EnginePort simulation does not support undoCheck';
  if (opts.hidden || opts.debug || opts.hasten) return 'EnginePort simulation does not support hidden, debug or hasten options';
  return undefined;
}

/** The legal-move pilot chooses only among the supplied answers; its RNG never comes from the engine. */
export function randomPortDriver<G extends PortTypes>(weight?: (answer: PortAnswer, state: G['state']) => number): PortDriver<G> {
  let why = '';
  return {
    name: 'random', reasons: () => why ? [why] : [],
    choose(state, answers, rng) {
      if (answers.length === 0) throw new RangeError('no legal answer');
      why = 'random: a weighted legal answer';
      const weights = answers.map(answer => weight ? weight(answer, state) : 1);
      let remaining = rng.int(1_000_000) / 1_000_000 * weights.reduce((sum, value) => sum + value, 0);
      for (let i = 0; i < answers.length; i++) {
        remaining -= weights[i]!;
        if (remaining < 0) return answers[i]!;
      }
      return answers[answers.length - 1]!;
    },
  };
}

/** A public-view bot for a port. The game explicitly maps its deciding seat; no foreign state field is assumed. */
export function portBotDriver<G extends PortTypes, V>(bot: Bot<V, PortAnswer>, view: (state: G['state'], seat: string | number | undefined) => V,
  seat: (state: G['state']) => string | number | undefined): PortDriver<G> {
  return {
    name: bot.name, reasons: () => bot.reasons?.() ?? [],
    choose: (state, answers, rng) => bot.choose(readDriverView(state, seat(state), deciding => view(state, deciding)), answers, rng),
  };
}

/** Internal port path for playOne; records use the same pool, reports and command exit handling. */
export function playPortOne<G extends PortTypes, S, O>(game: PortSimGame<G, S, O>, content: G['content'], spec: GameSpec,
  until: number | undefined, opts: PlayOptions): SimRecord<S> {
  const actions: PortAnswer[] = [], violations: InvariantViolation[] = [];
  let state: G['state'] | undefined, started = false, result: unknown = null, seen: O | undefined, summary: S | undefined;
  let error: string | undefined, errorName: string | undefined, resolvedDriver: string | undefined;
  let viewBytes: number | undefined, checked = 0;
  let viewStatus: NonNullable<SimRecord['viewValidation']>['status'] = opts.view ? 'not-run' : 'skipped';
  let trace: ResolvedTrace | undefined;
  const resolved = new Set<string>(), noOp = new Set<string>();
  const ms = { answers: 0, choose: 0, apply: 0, view: 0 };
  const judge = (transition?: readonly [G['state'], G['state']]): void => {
    if (!trace) return;
    const effects = [...(trace.effects ?? [])];
    const each = new Set(effects.map(effect => effect.clause));
    for (const effect of effects) (game.changed && !game.changed(effect.clause, effect.before, effect.after, content) ? noOp : resolved).add(effect.clause);
    for (const clause of trace.resolved) if (!each.has(clause))
      (game.changed && transition !== undefined && !game.changed(clause, transition[0], transition[1], content) ? noOp : resolved).add(clause);
    trace.clear();
  };
  const validate = <V>(read: () => V, current: G['state'], seat?: string | number, driver = false): V => {
    const t = performance.now();
    try {
      const value = read(), json = jsonView(value);
      const assertions = driver ? game.driverViewAssertions?.(current, seat, content) : undefined;
      const bad = leaks(json, assertions?.secrets ?? game.secrets?.(current, content) ?? [], assertions?.leakKeys ?? game.leakKeys?.(current, content) ?? []);
      if (bad.length) throw new Error(`view leak: ${bad.join(', ')}`);
      viewBytes = Math.max(viewBytes ?? 0, JSON.stringify(json).length);
      checked++;
      if (viewStatus !== 'failed') viewStatus = 'executed';
      return value;
    } catch (cause) {
      viewStatus = 'failed';
      throw new Error(`view after ${String(actions.length)} action(s)${seat === undefined ? '' : ` (driver seat ${String(seat)})`}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    } finally { ms.view += performance.now() - t; }
  };
  const render = (current: G['state']): void => { if (opts.view) validate(() => game.view!(current, content), current); };
  try {
    const unsupported = portOptionProblem(game, opts);
    if (unsupported !== undefined) throw Object.assign(new Error(unsupported), { name: UNSUPPORTED_PORT_OPTION });
    if (opts.view && !game.view) { viewStatus = 'unavailable'; throw new Error('view validation unavailable: the port game has no view adapter'); }
    if (typeof game.answers !== 'function') throw new Error('EnginePort simulation requires an explicit legal answers callback');
    const registration = game.validateDriver?.(spec.driver);
    const port = game.port(spec, content);
    if (typeof port.result !== 'function') throw new Error('EnginePort simulation requires a full-game result callback');
    trace = game.trace?.(content); trace?.clear();
    seen = game.observation?.(spec, content);
    let s = port.settle(port.start(spec.seed));
    state = s; started = true; judge();
    if (isChecking()) violations.push(...(port.invariants?.(s, port.content) ?? []));
    result = port.result(s) ?? null; render(s);
    const driver = game.driver(spec.driver, spec, content);
    resolvedDriver = driver.name || registration || spec.driver;
    const cap = game.maxActions ?? 100_000;
    while (result === null && violations.length === 0) {
      const prompt = port.prompt(s);
      if (!prompt) throw new Error('no prompt is open and the game has no result');
      if (actions.length >= cap) throw new Error(`no result after ${String(cap)} actions`);
      ms.answers = ms.choose = ms.apply = ms.view = 0;
      let t = performance.now();
      const rng = new Rng(`${spec.seed}|${spec.driver}|${String(prompt.id)}`);
      const answers = game.answers(s, content, rng);
      if (answers.length === 0) throw new Error(`dead end: no legal answer to prompt ${String(prompt.id)}`);
      game.onPrompt?.(seen as O, s, answers);
      ms.answers = performance.now() - t; t = performance.now();
      let rejection: Error | undefined;
      const action = withDriverViewValidation(() => driver.choose(s, answers, rng), opts.view ? (current, seat, read) => {
        try { return validate(read, current as G['state'], seat, true); }
        catch (cause) { rejection ??= cause instanceof Error ? cause : new Error(String(cause)); throw cause; }
      } : undefined);
      if (rejection !== undefined) throw rejection;
      if (action.kind !== 'answer') throw new Error('EnginePort simulation only supports PortAnswer actions');
      ms.choose = performance.now() - t - ms.view;
      if (until !== undefined && actions.length >= until) break;
      const recorded = structuredClone(action);
      canonicalJson(recorded);
      actions.push(recorded);
      t = performance.now(); judge();
      const before = (isChecking() && game.transitionInvariants) || game.changed ? structuredClone(s) : undefined;
      const applied = port.apply(s, action);
      if (applied instanceof Error) throw applied;
      s = port.settle(applied); state = s;
      if (isChecking()) {
        violations.push(...(port.invariants?.(s, port.content) ?? []));
        if (game.transitionInvariants) violations.push(...game.transitionInvariants(before, s, recorded, content));
      }
      judge([before, s]); result = port.result(s) ?? null;
      ms.apply = performance.now() - t; render(s);
      opts.onStep?.(actions.length - 1, { ...ms }, viewBytes);
    }
  } catch (cause) {
    if (cause instanceof StateInvariantError) violations.push(...cause.violations);
    else { error = cause instanceof Error ? cause.message : String(cause); if (cause instanceof Error && cause.name !== 'Error') errorName = cause.name; }
    opts.onStep?.(actions.length - 1, { ...ms }, viewBytes);
  }
  try { if (started && game.summary) summary = game.summary(state, actions, content, seen as O); }
  catch (cause) { error ??= `summary: ${cause instanceof Error ? cause.message : String(cause)}`; }
  const failed = error !== undefined || violations.length > 0;
  return {
    index: spec.index, seed: spec.seed, driver: spec.driver, ...(spec.settings ? { settings: spec.settings } : {}),
    result: failed ? null : result, actions: actions.length, hash: hashValue(actions), portExecution: 1,
    ...(failed ? { log: actions } : {}), ...(error === undefined ? {} : { error }), ...(errorName === undefined ? {} : { errorName }),
    ...(violations.length ? { violations } : {}), ...(summary === undefined ? {} : { summary }),
    ...(viewBytes === undefined ? {} : { viewBytes }), viewValidation: viewEvidence(viewStatus, checked),
    ...(resolvedDriver === undefined ? {} : { resolvedDriver }),
    ...(trace ? { resolved: [...resolved].sort() } : {}),
    ...([...noOp].some(clause => !resolved.has(clause)) ? { noOp: [...noOp].filter(clause => !resolved.has(clause)).sort() } : {}),
  };
}

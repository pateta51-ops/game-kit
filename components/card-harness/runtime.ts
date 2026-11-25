import { isDeepStrictEqual } from 'node:util';
import { applyAction, createGame, formatTriggerCap, type ApplyResult, type GameRules, type GameTypes } from '../engine-core/index.ts';
import { runClauseMutations, type ClauseMutation, type MutationOptions, type MutationReport } from './mutations.ts';
import type { Probe, RanNote } from './probe.ts';
import { linesOf, type SpecGame, type SpecRow } from './spec.ts';

export interface RuntimeClause {
  readonly id: string;
  readonly conditional?: boolean;
}

export type RuntimeAssertion =
  | { readonly key: string; readonly delta: number }
  | { readonly key: string; readonly equals: string | number | boolean | null };

export interface RuntimeCardSetup<L> {
  readonly layout: L;
  readonly answers: readonly (readonly string[])[];
  /** Name of a routine boundary to verify with the game's settled check. */
  readonly end?: string;
  /** Option taken in the full resolve and watched in its paired not-offered case. */
  readonly optionId?: string;
}

export interface RuntimeCardCase<L> extends RuntimeCardSetup<L> {
  readonly name: string;
  readonly kind: 'resolve' | 'not-offered' | 'not-fired';
  readonly expect: readonly RuntimeAssertion[];
}

export interface RuntimeCardNote extends RanNote {
  /** An observation snapshot from a real clause-begin or clause-end marker. */
  readonly observation?: Readonly<Record<string, unknown>>;
}

interface RuntimeEngine<G extends GameTypes> {
  readonly rules: GameRules<G>;
  readonly options: G['options'];
  readonly setup: G['rules'];
  readonly content: G['content'];
  readonly probe: Probe<RuntimeCardNote>;
}

export interface RuntimeCardSuite<C extends RuntimeClause, R, L, G extends GameTypes> {
  /** The independent printed inventory for the packs under test. */
  readonly clauses: readonly C[];
  /** The current validated records used for play. */
  readonly records: readonly R[];
  readonly lineOf?: (record: R) => string | readonly string[] | undefined;
  familyOf(clause: C, records: readonly R[]): string | undefined;
  readonly families: Readonly<Record<string, (clause: C, records: readonly R[]) => readonly RuntimeCardCase<L>[]>>;
  start(layout: L, records: readonly R[]): RuntimeEngine<G>;
  observe(state: G['state']): Readonly<Record<string, unknown>>;
  /** Verify that a named routine boundary is open and no clause choice is pending. */
  settled?(state: G['state'], end: string): boolean;
  readonly exempt?: Readonly<Record<string, string>>;
  readonly mutations?: { readonly trials: readonly ClauseMutation<R>[]; readonly validate: MutationOptions<R>['validate'] };
}

export type RuntimeCaseStatus =
  | 'passed' | 'missing-record' | 'unsupported' | 'missing-case' | 'missing-evidence'
  | 'assertion-failed' | 'engine-error' | 'exempt';

export interface RuntimeCaseResult {
  readonly line: string;
  readonly name: string;
  readonly status: RuntimeCaseStatus;
  readonly detail?: string;
}

export interface RuntimeCardReport {
  readonly cases: readonly RuntimeCaseResult[];
  /** Clauses with all required runtime cases run and asserted successfully. */
  readonly covered: readonly string[];
  readonly problems: readonly string[];
  readonly mutations?: MutationReport;
}

type Script = Pick<RuntimeCardSetup<unknown>, 'answers' | 'end' | 'optionId'> & { readonly line: string };
type Expectations = Pick<RuntimeCardCase<unknown>, 'kind' | 'expect'>;
type Observation = Readonly<Record<string, unknown>>;
interface Comparison {
  readonly before: Observation;
  readonly after: Observation;
}
interface Evidence extends Comparison {
  readonly scope?: Comparison;
  readonly attempted: boolean;
  readonly dispatched: boolean;
  readonly offered: boolean;
  readonly pickedOption: boolean;
}

const message = (error: unknown): string => error instanceof Error ? error.message : String(error);
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.trim() === value;
const passed = (status: RuntimeCaseStatus): boolean => status === 'passed' || status === 'exempt';
const MAX_ANSWERS = 64;

function cleanStep<G extends GameTypes>(step: ApplyResult<G>, actionIndex: number | null): void {
  if (step.triggerCap !== undefined) throw new Error(formatTriggerCap({ ...step.triggerCap, actionIndex }));
  if (step.violations.length) throw new Error(step.violations.map(v => `${v.id}: ${v.message}`).join('; '));
}

function specGame<C extends RuntimeClause, R, L, G extends GameTypes>(input: RuntimeCardSuite<C, R, L, G>): SpecGame<R, L, Script, Expectations, Evidence> {
  return {
    records: input.records,
    ...(input.lineOf === undefined ? {} : { lineOf: input.lineOf.bind(input) }),
    play(layout, script, records) {
      const game = input.start(layout, records);
      const initial = createGame(game.rules, game.options, game.setup, game.content);
      cleanStep(initial, null);
      let state = initial.state;
      const before = structuredClone(input.observe(state));
      let begins: Observation | undefined;
      let ends: Observation | undefined;
      let invalidScope = false;
      let pickedOption = false;
      let attempted = false;
      let dispatched = false;
      let offered = false;
      const watch = (): void => {
        offered ||= state.prompt?.options.some(o => o.enabled && o.id === script.optionId) === true;
      };
      watch();
      for (const [index, picks] of script.answers.entries()) {
        if (state.prompt === null) throw new Error(`unused answer ${String(index + 1)}: no prompt is open`);
        const picked = script.optionId !== undefined && picks.includes(script.optionId)
          && state.prompt.options.some(o => o.enabled && o.id === script.optionId);
        const action = { kind: 'answer', promptId: state.prompt.id, picks } as G['action'];
        const { result, notes } = game.probe.trace(() => applyAction(game.rules, state, action, game.content));
        cleanStep(result, index);
        for (const note of notes) {
          if (note.id !== script.line) continue;
          if (note.kind === 'clause-attempt') attempted = true;
          if (note.kind === 'clause-begin') {
            pickedOption ||= picked;
            if (begins !== undefined || note.observation === undefined) invalidScope = true;
            else begins = structuredClone(note.observation);
          }
          if (note.kind === 'clause') {
            dispatched = true;
            if (begins === undefined || ends !== undefined) invalidScope = true;
          }
          if (note.kind === 'clause-end') {
            if (!dispatched || ends !== undefined || note.observation === undefined) invalidScope = true;
            else ends = structuredClone(note.observation);
          }
        }
        state = result.state;
        watch();
      }
      if (script.end === undefined ? state.prompt !== null : state.prompt === null || input.settled?.(state, script.end) !== true) {
        throw new Error(`unexpected prompt after last answer: ${state.prompt?.kind ?? (state.prompt === null ? 'none' : String(state.prompt.id))}`);
      }
      const scope = !invalidScope && begins !== undefined && ends !== undefined ? { before: begins, after: ends } : undefined;
      return { before, after: structuredClone(input.observe(state)), attempted, dispatched, offered, pickedOption,
        ...(scope === undefined ? {} : { scope }),
      };
    },
    check(result, { kind, expect }) {
      const compared = kind === 'resolve' ? result.scope : result;
      if (compared === undefined) throw new Error('no complete clause-scoped observation');
      for (const assertion of expect) {
        const { key } = assertion;
        if (!Object.hasOwn(compared.before, key) || !Object.hasOwn(compared.after, key)) return `missing observation "${key}"`;
        const before = compared.before[key];
        const after = compared.after[key];
        if ('delta' in assertion) {
          if (typeof before !== 'number' || typeof after !== 'number' || !Number.isFinite(before) || !Number.isFinite(after))
            return `"${key}" must provide numbers before and after`;
          if (after - before !== assertion.delta) return `"${key}" expected delta ${String(assertion.delta)}, got ${String(after - before)}`;
        } else if (!isDeepStrictEqual(after, assertion.equals)) {
          return `"${key}" expected ${JSON.stringify(assertion.equals)}, got ${JSON.stringify(after) ?? 'undefined'}`;
        }
      }
      if (kind !== 'resolve' && result.dispatched) return 'the clause dispatched in the refusal case';
      if (kind === 'not-offered' && result.offered) return 'the clause option was offered';
      return undefined;
    },
  };
}

function valid<L>(test: RuntimeCardCase<L>): boolean {
  return id(test.name)
    && (test.kind === 'resolve' || test.kind === 'not-fired' || (test.kind === 'not-offered' && id(test.optionId)))
    && test.answers.length > 0 && test.answers.length <= MAX_ANSWERS
    && (test.end === undefined || id(test.end))
    && test.expect.length > 0
    && test.expect.every(a => id(a.key) && ('delta' in a
      ? Number.isFinite(a.delta)
      : a.equals === null || typeof a.equals === 'boolean' || typeof a.equals === 'string' || Number.isFinite(a.equals)));
}

/** Derive and run current-pack cases. No test sources or inventory files are written. */
export function runCardSuite<C extends RuntimeClause, R, L, G extends GameTypes>(input: RuntimeCardSuite<C, R, L, G>): RuntimeCardReport {
  const game = specGame(input);
  const cases: RuntimeCaseResult[] = [];
  const covered: string[] = [];
  const rows: SpecRow<L, Script, Expectations>[] = [];
  const printed = new Map<string, C>();
  for (const clause of input.clauses) {
    if (!id(clause.id) || printed.has(clause.id)) throw new Error('invalid or duplicate printed clause: ' + clause.id);
    printed.set(clause.id, clause);
  }
  if (!printed.size) throw new Error('printed clause inventory is empty');
  const byLine = new Map<string, R[]>();
  const lineOf = input.lineOf?.bind(input);
  for (const record of input.records) {
    const lines = linesOf(record, lineOf);
    if (!lines.length || new Set(lines).size !== lines.length) throw new Error('a runtime card record has missing or duplicate clause IDs');
    for (const line of lines) {
      if (!printed.has(line)) throw new Error(`record refers to unknown printed clause "${line}"`);
      const group = byLine.get(line);
      if (group) group.push(record);
      else byLine.set(line, [record]);
    }
  }

  const waived: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [line, reason] of Object.entries(input.exempt ?? {})) {
    if (!printed.has(line) || !reason.trim()) throw new Error(`exemption needs a known clause and a reason: ${line}`);
  }
  for (const line of [...printed.keys()].sort()) {
    const clause = printed.get(line)!;
    const group = byLine.get(line);
    const add = (name: string, status: RuntimeCaseStatus, detail?: string): void => {
      cases.push({ line, name, status, ...(detail === undefined ? {} : { detail }) });
    };
    const gap = (status: 'missing-record' | 'unsupported' | 'missing-case', detail: string): void => {
      const exemption = Object.hasOwn(input.exempt ?? {}, line) ? input.exempt?.[line] : undefined;
      if (exemption === undefined) add('coverage', status, detail);
      else {
        waived[line] = exemption;
        add('coverage', 'exempt', `${status}: ${detail} (${exemption})`);
      }
    };
    if (group === undefined) { gap('missing-record', 'no current record'); continue; }
    const family = input.familyOf(structuredClone(clause), structuredClone(group));
    const build = family === undefined || !Object.hasOwn(input.families, family) ? undefined : input.families[family];
    if (build === undefined) { gap('unsupported', `no case adapter for ${family ?? 'this record set'}`); continue; }
    const defined = build(structuredClone(clause), structuredClone(group));
    if (!defined.some(t => t.kind === 'resolve') || (clause.conditional && !defined.some(t => t.kind !== 'resolve'))) {
      gap('missing-case', 'need a full resolve and, for a guarded clause, a refusal case');
      continue;
    }
    if (Object.hasOwn(input.exempt ?? {}, line)) throw new Error(`stale runtime exemption for ${line}: executable cases exist`);
    if (new Set(defined.map(t => t.name)).size !== defined.length || defined.some(t => !valid(t))) {
      add('coverage', 'missing-case', `invalid case layout, name, answer script (max ${String(MAX_ANSWERS)}) or empty assertions`);
      continue;
    }
    const start = cases.length;
    const taken = new Set<string>();
    const poorOptions: { index: number; id: string }[] = [];
    for (const test of defined) {
      const { name, kind, expect, layout, ...script } = structuredClone(test);
      const act: Script = { line, ...script };
      const optionId = script.optionId;
      const expectations = { kind, expect };
      try {
        const observed = game.play(structuredClone(layout), structuredClone(act), structuredClone(input.records), false);
        if (kind === 'resolve' && observed.scope === undefined) {
          add(name, 'missing-evidence', 'need one clause begin/dispatch/end sequence with observations');
        } else {
          const problem = game.check(observed, expectations);
          const scope = observed.scope;
          const assertedChange = scope !== undefined && expect.some(e => !isDeepStrictEqual(scope.before[e.key], scope.after[e.key]));
          if (problem !== undefined) add(name, 'assertion-failed', problem);
          else if (kind === 'resolve' ? !assertedChange : !observed.attempted)
            add(name, 'missing-evidence', kind === 'resolve' ? 'need an asserted change inside the clause' : 'need an observed attempt at this clause');
          else {
            if (kind === 'resolve' && observed.pickedOption && optionId !== undefined) taken.add(optionId);
            if (kind === 'not-offered' && optionId !== undefined) poorOptions.push({ index: cases.length, id: optionId });
            add(name, 'passed');
          }
        }
      } catch (error) {
        add(name, 'engine-error', message(error));
      }
      rows.push({ line, name, layout, act, expect: expectations });
    }
    for (const option of poorOptions) {
      if (!taken.has(option.id)) cases[option.index] = {
        ...cases[option.index]!,
        status: 'missing-evidence',
        detail: `no successful full resolve took option "${option.id}" for this clause (option witness)`,
      };
    }
    if (cases.slice(start).every(c => c.status === 'passed')) covered.push(line);
  }

  const problems = cases.filter(c => !passed(c.status)).map(c => `${c.line} ${c.name}: ${c.status}: ${c.detail ?? ''}`);
  const options = input.mutations;
  if (options === undefined || problems.length > 0) return { cases, covered, problems };
  const mutations = runClauseMutations(game, rows, options.trials, { requiredLines: [...printed.keys()], exempt: waived, validate: options.validate });
  return { cases, covered, problems: mutations.problems, mutations };
}

export function runtimeCardMain<C extends RuntimeClause, R, L, G extends GameTypes>(input: RuntimeCardSuite<C, R, L, G>, log: (line: string) => void): number {
  try {
    const result = runCardSuite(input);
    for (const c of result.cases) log(`${c.line} ${c.name}: ${c.status}${c.detail === undefined ? '' : `: ${c.detail}`}`);
    for (const problem of result.mutations?.problems ?? []) log(problem);
    return result.problems.length === 0 ? 0 : 1;
  } catch (error) {
    log(message(error));
    return 1;
  }
}

export type StandardCardRule =
  | { readonly kind: 'gain'; readonly meter: string; readonly amount: number }
  | { readonly kind: 'draw'; readonly deck: string; readonly hand: string; readonly count: number }
  | { readonly kind: 'paid-draw'; readonly meter: string; readonly cost: number; readonly deck: string; readonly hand: string; readonly count: number };

/** Independent printed amounts and game-owned layouts for a gain, draw or single resource cost followed by a draw. */
export function standardCardCases<L>(
  rule: StandardCardRule,
  setup: (need: { readonly path: 'resolve' | 'poor'; readonly cards?: number; readonly balance?: number }) => RuntimeCardSetup<L>,
): RuntimeCardCase<L>[] {
  const positive = (n: number): boolean => Number.isSafeInteger(n) && n > 0;
  if (rule.kind === 'gain') {
    if (!positive(rule.amount)) throw new Error('expected a positive printed gain');
    return [{ ...setup({ path: 'resolve' }), name: 'full resolve', kind: 'resolve', expect: [{ key: rule.meter, delta: rule.amount }] }];
  }
  if (!positive(rule.count) || (rule.kind === 'paid-draw' && !positive(rule.cost))) throw new Error('expected positive printed draw and cost counts');
  const draw = [{ key: rule.deck, delta: -rule.count }, { key: rule.hand, delta: rule.count }];
  if (rule.kind === 'draw') return [{ ...setup({ path: 'resolve', cards: rule.count }), name: 'full resolve', kind: 'resolve', expect: draw }];
  return [
    { ...setup({ path: 'resolve', cards: rule.count, balance: rule.cost }), name: 'full resolve', kind: 'resolve', expect: [...draw, { key: rule.meter, delta: -rule.cost }] },
    { ...setup({ path: 'poor', cards: rule.count, balance: rule.cost - 1 }), name: 'insufficient resource', kind: 'not-offered', expect: [rule.deck, rule.hand, rule.meter].map(key => ({ key, delta: 0 })) },
  ];
}

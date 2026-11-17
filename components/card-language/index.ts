// K206: the card-language shell. Effects are data (`{ op, ...fields }` steps); each verb has a field check, a handler
// that runs on engine-core and a text generator that prints the card's words from the same step. Shape from Jarl's
// OPS / DESCRIBE (registry, validator, field checks), STCC's op table (`null` = not built yet) and middle-earth-player's
// family manifests (one verb per family). The game owns every verb.
import { EngineBugError, type Ctx, type GameTypes, type KernelTask } from '../engine-core/index.ts';
import { strictProblems, type Grammar } from '../card-harness/strict.ts';
import { ruleIdFilter, type RuleIdFilter } from '../plain-text/index.ts';

/** A field's check: null when it holds, else what it must be. `optional` fields may be absent. */
export type Field = ((v: unknown) => string | null) & { readonly optional?: true };

export interface Step {
  readonly op: string;
}

/** One check per field of the step, no more, no fewer: a typo or a missing field fails to compile. */
export type FieldsOf<S> = { readonly [K in Exclude<keyof S, 'op'>]-?: Field };

export interface Verb<G extends GameTypes, S, E = unknown> {
  readonly fields: FieldsOf<S>;
  /** Runs the step on the engine (push tasks, ask, emit, `would`...). `null`: not built yet; running it throws. */
  readonly run: ((ctx: Ctx<G>, step: S, env: E | undefined) => void) | null;
  /** The card's words for this step, from the same data the handler reads. `null`: not written yet. */
  readonly text: ((step: S) => string) | null;
  /** K232: runs when the verb's own prompt is answered (`askVerb`): the task comes back with the answer. */
  readonly resume?: (ctx: Ctx<G>, step: S, env: E | undefined, answer: readonly string[]) => void;
}

/** One row per verb of the game's step union: a missing verb fails to compile. */
export type VerbTable<G extends GameTypes, S extends Step, E = unknown> = {
  readonly [K in S['op']]: Verb<G, Extract<S, { op: K }>, E>;
};

/** Any verb table (what the functions below take). */
export type AnyVerbTable = Readonly<Record<string, { readonly fields: object; readonly run: unknown; readonly text: unknown }>>;
/** The step union of a verb table. */
export type StepOf<T> = { [K in keyof T]: T[K] extends { readonly text: ((step: infer S) => string) | null } ? S : never }[keyof T];

/** The task a step runs as; put it in the game's task union. `env`: the game's context (source card, player...). */
export interface VerbTask<S extends Step = Step, E = unknown> extends KernelTask {
  readonly kind: 'verb';
  readonly step: S;
  readonly env?: E;
}

export const posInt: Field = (v) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? null : 'a positive integer');
export const int: Field = (v) => (typeof v === 'number' && Number.isInteger(v) ? null : 'an integer');
export const str: Field = (v) => (typeof v === 'string' && v !== '' ? null : 'a non-empty string');
export const bool: Field = (v) => (typeof v === 'boolean' ? null : 'true or false');
export const oneOf = (set: readonly unknown[], what = `one of ${set.join(', ')}`): Field => (v) => (set.includes(v) ? null : what);
export const listOf = (set: readonly unknown[], what: string): Field => (v) =>
  Array.isArray(v) && v.length > 0 && v.every((x) => set.includes(x)) && new Set(v).size === v.length ? null : `a non-empty list of distinct ${what}`;
export const optional = (f: Field): Field => Object.assign((v: unknown) => (v === undefined ? null : f(v)), { optional: true as const });
/** A nested effect (a choice's branch, a cost's payment): a non-empty list of steps whose fields hold. Keys and verbs are checked by the grammar. */
export const effectOf = (table: () => AnyVerbTable): Field => (v) => {
  if (!Array.isArray(v) || v.length === 0) return 'a non-empty list of steps';
  return v.flatMap((s, i) => fieldProblems(table(), s, `[${String(i)}]`))[0] ?? null;
};

const fieldsOf = (table: AnyVerbTable, op: string): Readonly<Record<string, Field>> => (table[op]?.fields ?? {}) as Readonly<Record<string, Field>>;

/** The card-harness grammar of a verb table: keys from `fields`, required unless `optional`. */
export function grammarOf(table: AnyVerbTable): Grammar {
  const nodes: Record<string, { keys: string[]; required: string[] }> = Object.create(null) as Record<string, { keys: string[]; required: string[] }>;
  for (const op of Object.keys(table)) {
    const f = Object.entries(fieldsOf(table, op));
    nodes[op] = { keys: f.map(([k]) => k), required: f.filter(([, c]) => !c.optional).map(([k]) => k) };
  }
  return { nodes };
}

function fieldProblems(table: AnyVerbTable, step: unknown, at: string): string[] {
  if (typeof step !== 'object' || step === null || Array.isArray(step)) return [];
  const o = step as Record<string, unknown>;
  if (typeof o.op !== 'string' || !Object.hasOwn(table, o.op)) return [];
  const out: string[] = [];
  for (const [name, check] of Object.entries(fieldsOf(table, o.op))) {
    if (!(name in o)) continue;
    const why = check(o[name]);
    if (why !== null) out.push(`${at ? `${at}.` : ''}${name}: ${o.op} ${name} must be ${why}`);
  }
  return out;
}

// K295: only objects in a step position (the root, or an element of a list in a step's field) are steps; any other
// object (a value expression such as `{ a: 'calc', op: 'add' }`) keeps its keys but hides its `op` from the grammar.
const plain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const asValue = (v: unknown): unknown => (Array.isArray(v) ? v.map(asValue) : plain(v) ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'op').map(([k, x]) => [k, asValue(x)])) : v);
const inList = (v: unknown): unknown => (Array.isArray(v) ? v.map(inList) : plain(v) ? asStep(v) : v);
const asStep = (v: unknown): unknown => (plain(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'op' ? x : Array.isArray(x) ? inList(x) : asValue(x)])) : v);

const shapeProblems = (table: AnyVerbTable, step: unknown, at: string): string[] => {
  if (typeof step !== 'object' || step === null || Array.isArray(step)) return [`${at || '(root)'}: a step must be an object`];
  const op = (step as Record<string, unknown>).op;
  if (typeof op !== 'string' || !Object.hasOwn(table, op)) return [`${at ? `${at}.` : ''}op: unknown verb ${JSON.stringify(op)}`];
  return [];
};

/** The problems of one step: card-harness `strictProblems` over `grammarOf(table)` (unknown verb, missing or extra key, nested steps), then the field checks. [] when valid. */
export function validateStep(table: AnyVerbTable, step: unknown): string[] {
  const shape = shapeProblems(table, step, '');
  if (shape.length > 0) return shape;
  return [...strictProblems(grammarOf(table), asStep(step)).map((p) => p.message), ...fieldProblems(table, step, '')];
}

/** The problems of an effect (a non-empty list of steps); paths start with the step's index. */
export function validateEffect(table: AnyVerbTable, steps: unknown): string[] {
  if (!Array.isArray(steps) || steps.length === 0) return ['an effect must be a non-empty list of steps'];
  const shape = steps.flatMap((s, i) => shapeProblems(table, s, `[${String(i)}]`));
  if (shape.length > 0) return shape;
  return [...strictProblems(grammarOf(table), inList(steps)).map((p) => p.message), ...steps.flatMap((s, i) => fieldProblems(table, s, `[${String(i)}]`))];
}

const verbOf = (table: AnyVerbTable, step: Step): AnyVerbTable[string] => {
  const v = Object.hasOwn(table, step.op) ? table[step.op] : undefined;
  if (v === undefined) throw new EngineBugError(`unknown verb ${JSON.stringify(step.op)}`);
  return v;
};

/** The card's words: each step's text in order, joined. Throws for a verb with no text generator. */
export function describeEffect<T extends AnyVerbTable>(table: T, steps: readonly StepOf<T>[], join = ' '): string {
  return steps
    .map((s) => {
      const text = verbOf(table, s as Step).text as ((s: unknown) => string) | null;
      if (typeof text !== 'function') throw new EngineBugError(`verb ${(s as Step).op} has no text generator`);
      return text(s);
    })
    .join(join);
}

/** The tasks that run an effect, first step first: `ctx.then(...effectTasks(steps, env))`. */
export const effectTasks = <S extends Step, E>(steps: readonly S[], env?: E): VerbTask<S, E>[] =>
  steps.map((step) => (env === undefined ? { kind: 'verb', step } : { kind: 'verb', step, env }));

/** K232: a verb asks; the answer comes back to the same step through its `resume` (saves in the middle resume too). */
export function askVerb<G extends GameTypes>(ctx: Ctx<G>, prompt: Omit<G['prompt'], 'id'>, step: Step, env?: unknown): void {
  ctx.ask(prompt, effectTasks([step], env)[0]);
}

/** The `verb` task handler: spread `{ verb: verbHandler<G>(VERBS) }` into the game's handlers. */
export function verbHandler<G extends GameTypes>(table: AnyVerbTable): (ctx: Ctx<G>, task: G['task']) => void {
  return (ctx, task) => {
    const t = task as unknown as VerbTask;
    if (t.answer !== undefined) {
      const resume = (verbOf(table, t.step) as { resume?: (ctx: Ctx<G>, s: Step, e: unknown, a: readonly string[]) => void }).resume;
      if (typeof resume !== 'function') throw new EngineBugError(`verb ${t.step.op} was answered but has no resume`);
      resume(ctx, t.step, t.env, t.answer);
      return;
    }
    const run = verbOf(table, t.step).run as ((ctx: Ctx<G>, s: Step, e: unknown) => void) | null;
    if (typeof run !== 'function') throw new EngineBugError(`verb ${t.step.op} has no handler`);
    run(ctx, t.step, t.env);
  };
}

/** Default rule-id filter: any capital family with 2 to 4 digits (TURN-07, AR-026); "A-5 cards" stays. Pass the game's own. */
export const RULE_IDS: RuleIdFilter = ruleIdFilter({ short: ['[A-Z]{1,6}'] });

/**
 * Every verb has a handler and a text generator. With `examples` (one or more valid steps per verb): every verb has one,
 * each validates, and its text is non-empty with no rule id (plain-text filter `ids`, default `RULE_IDS`). [] when all hold.
 */
export function verbProblems<T extends AnyVerbTable>(table: T, examples?: readonly StepOf<T>[], ids: RuleIdFilter = RULE_IDS): string[] {
  const out: string[] = [];
  for (const [op, v] of Object.entries(table)) {
    if (typeof v.run !== 'function') out.push(`${op}: no handler`);
    if (typeof v.text !== 'function') out.push(`${op}: no text generator`);
    if (examples !== undefined && !examples.some((e) => (e as Step).op === op)) out.push(`${op}: no example`);
  }
  for (const e of (examples ?? []) as readonly Step[]) {
    const bad = validateStep(table, e);
    if (bad.length > 0) {
      out.push(...bad.map((b) => `example ${e.op} ${b}`));
      continue;
    }
    const text = table[e.op]?.text;
    if (typeof text !== 'function') continue;
    const words = (text as (s: Step) => string)(e);
    if (words.trim() === '') out.push(`${e.op}: empty text`);
    const id = new RegExp(ids.pattern).exec(words);
    if (id) out.push(`${e.op}: rule id ${id[0]} in text "${words}"`);
  }
  return out;
}

/** Test helper: throws listing every problem of `verbProblems`. */
export function expectVerbs<T extends AnyVerbTable>(table: T, examples?: readonly StepOf<T>[], ids?: RuleIdFilter): void {
  const p = verbProblems(table, examples, ids);
  if (p.length > 0) throw new Error(`card language:\n${p.join('\n')}`);
}

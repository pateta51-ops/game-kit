// Explicit state machines (docs/decisions/SM-explicit-state-machines.md). The map of every machine, generated from
// this registry, is docs/architecture/STATE_MACHINES.md (`npm run machines:doc`; `npm run machines -- <id>` prints one).
//
// A machine is one plain table: { id, initial, states: { [state]: { on: { [event]: target } } }, describe }.
// `transition(machine, state, event)` returns the target. An illegal event throws an IllegalTransitionError in dev and
// test builds (and under vitest), and in production logs the same message and stays in `state`.
// Never add a boolean flag for a state: add a state to the table.

export let MACHINES_DOC = 'docs/architecture/STATE_MACHINES.md';
export const setMachinesDoc = (p: string): void => {
  MACHINES_DOC = p;
};

/** What the generated doc and the error messages say about a machine. */
export interface MachineInfo {
  /** One or two sentences: what the machine models. */
  readonly purpose: string;
  /** The repository path of the file that holds the table (where to edit it). */
  readonly source: string;
  /** Where the state lives at run time (the field, store or variable a state is read from). */
  readonly stateLivesIn?: string;
  /** Rule ids the transitions implement (engine machines). */
  readonly rules?: readonly string[];
  /** Extra lines for the doc: what each event means, what is not modelled. */
  readonly notes?: readonly string[];
}

export interface StateDef<S extends string, E extends string> {
  readonly on: Readonly<Partial<Record<E, S>>>;
}

export interface MachineConfig<S extends string, E extends string> {
  readonly id: string;
  readonly initial: S;
  /** Every state, each with the events it accepts and their targets. A state with `on: {}` is terminal. */
  readonly states: Readonly<Record<S, StateDef<S, E>>>;
  readonly describe: MachineInfo;
}

export interface Machine<S extends string, E extends string> extends MachineConfig<S, E> {
  /** The states in table order. */
  readonly stateNames: readonly S[];
  /** Every event used by the table, in first-use order. */
  readonly eventNames: readonly E[];
  /** The line of the defineMachine call in `describe.source`, when the runtime's stack trace shows it (null otherwise). */
  readonly line: number | null;
}

/** A machine whose state and event types are erased (the registry and the tools). */
export type AnyMachine = Machine<string, string>;

export interface Edge {
  readonly from: string;
  readonly event: string;
  readonly to: string;
}

const registry = new Map<string, AnyMachine>();

/**
 * Define and register a machine. Write the type parameters out (`defineMachine<Phase, PhaseEvent>({...})`) so the
 * table is checked against them: a missing state, an unknown target or an unknown event does not compile.
 */
export function defineMachine<S extends string, E extends string>(
  config: MachineConfig<S, E>,
): Machine<S, E> {
  if (registry.has(config.id))
    throw new Error(`[machine] duplicate machine id "${config.id}" (${config.describe.source})`);
  const stateNames = Object.keys(config.states) as S[];
  if (!stateNames.includes(config.initial)) {
    throw new Error(
      `[machine ${config.id}] initial state "${config.initial}" is not in the table (${config.describe.source})`,
    );
  }
  const eventNames: E[] = [];
  for (const s of stateNames) {
    const on = config.states[s].on as Record<string, string | undefined>;
    for (const [e, to] of Object.entries(on)) {
      if (to === undefined) continue;
      if (!stateNames.includes(to as S)) {
        throw new Error(
          `[machine ${config.id}] "${s}" --${e}--> "${to}": the target is not a state (${config.describe.source})`,
        );
      }
      if (!eventNames.includes(e as E)) eventNames.push(e as E);
    }
  }
  const machine: Machine<S, E> = {
    ...config,
    stateNames,
    eventNames,
    line: callerLine(config.describe.source),
  };
  registry.set(config.id, machine);
  return machine;
}

/**
 * The line in `source` of the frame that called defineMachine or defineTable, read from a stack trace (node, vitest,
 * tsx, browsers). One rule for every location shown to agents: errors, `npm run machines` and machines:check all cite
 * the line of the `defineMachine(` / `defineTable(` call (scripts/machines-doc.ts tableLine finds the same line).
 */
function callerLine(source: string): number | null {
  const stack = new Error().stack ?? '';
  for (const frame of stack.split('\n')) {
    if (!frame.replace(/\\/g, '/').includes(source)) continue;
    const m = /:(\d+):\d+\)?\s*$/.exec(frame);
    if (m?.[1] !== undefined) return Number(m[1]);
  }
  return null;
}

/** A data table that is not a machine (e.g. the engine's prompt positions), with where it is defined. */
export interface TableRef {
  readonly id: string;
  readonly source: string;
  readonly line: number | null;
}

const tables = new Map<string, TableRef>();

/**
 * Register a data table that the machines or the invariants read, so their messages can cite its line. Returns `value`
 * unchanged: `export const X = defineTable<Type>('X', 'src/path.ts', { ... });`.
 */
export function defineTable<T>(id: string, source: string, value: T): T {
  if (tables.has(id)) throw new Error(`[machine] duplicate table id "${id}" (${source})`);
  tables.set(id, { id, source, line: callerLine(source) });
  return value;
}

/** Every registered table, sorted by id. */
export function listTables(): TableRef[] {
  return [...tables.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Where a registered table lives, for error messages. */
export function tableWhere(id: string): string {
  const t = tables.get(id);
  if (t === undefined) return `Table: ${id} (not registered with defineTable).`;
  return [
    `Table: ${t.source}${t.line === null ? '' : `:${String(t.line)}`} (search: defineTable('${id}')).`,
    `Map: ${MACHINES_DOC} (the machines that read it list it in their notes). Query: npm run machines`,
  ].join('\n');
}

/** Every registered machine, sorted by id. */
export function listMachines(): AnyMachine[] {
  return [...registry.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** The registered machine with this id, or undefined. */
export function getMachine(id: string): AnyMachine | undefined {
  return registry.get(id);
}

/** The target of `event` from `state`, or undefined when the table has no such transition. */
export function targetOf(m: AnyMachine, state: string, event: string): string | undefined {
  const def = (m.states as Record<string, StateDef<string, string> | undefined>)[state];
  if (def === undefined) return undefined;
  return (def.on as Record<string, string | undefined>)[event];
}

/** May `event` happen in `state`? */
export function can<S extends string, E extends string>(m: Machine<S, E>, state: S, event: E): boolean {
  return targetOf(m, state, event) !== undefined;
}

/** The events allowed from `state`, with their targets, in table order (none for an unknown state). */
export function allowedFrom(m: AnyMachine, state: string): { event: string; to: string }[] {
  const def = (m.states as Record<string, StateDef<string, string> | undefined>)[state];
  if (def === undefined) return [];
  return Object.entries(def.on as Record<string, string | undefined>)
    .filter((x): x is [string, string] => x[1] !== undefined)
    .map(([event, to]) => ({ event, to }));
}

/** Every transition of the table, in table order. */
export function edgesOf(m: AnyMachine): Edge[] {
  return m.stateNames.flatMap((from) => allowedFrom(m, from).map(({ event, to }) => ({ from, event, to })));
}

/** Is `state` a state of the table? */
export function isState(m: AnyMachine, state: string): boolean {
  return m.stateNames.includes(state);
}

/** Does any event lead from `from` straight to `to`? (A check over observed states, where the event is not known.) */
export function hasEdge(m: AnyMachine, from: string, to: string): boolean {
  return allowedFrom(m, from).some((x) => x.to === to);
}

/** The doc anchor of a machine id (GitHub's heading slug of "## <id>"). */
export const docAnchor = (id: string): string =>
  id
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/ /g, '-');

/** Where to read and edit a machine, for error messages. */
export function whereIs(m: AnyMachine): string {
  return [
    `Table: ${m.describe.source}${m.line === null ? '' : `:${String(m.line)}`} (search: id: '${m.id}').`,
    `Map: ${MACHINES_DOC}#${docAnchor(m.id)}. Query: npm run machines -- ${m.id}`,
  ].join('\n');
}

export class IllegalTransitionError extends Error {
  readonly machine: string;
  readonly state: string;
  readonly event: string;
  readonly allowed: readonly string[];
  constructor(
    machine: string,
    state: string,
    event: string,
    allowed: readonly string[],
    message: string,
  ) {
    super(message);
    this.machine = machine;
    this.state = state;
    this.event = event;
    this.allowed = allowed;
    this.name = 'IllegalTransitionError';
  }
}

export type MachineMode = 'auto' | 'throw' | 'log';
let mode: MachineMode = 'auto';

/** Force throwing or logging (tests of the production path); 'auto' decides from the build. */
export function setMachineMode(m: MachineMode): void {
  mode = m;
}

/** Dev builds, test builds and vitest throw on an illegal event; production logs and stays put. */
function throws(): boolean {
  if (mode !== 'auto') return mode === 'throw';
  const env = (import.meta as { env?: { DEV?: boolean; MODE?: string } }).env;
  if (env?.DEV === true || env?.MODE === 'test') return true;
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.['NODE_ENV'] === 'test' || proc?.env?.['VITEST'] !== undefined;
}

/** The message of an illegal event: what happened, what is allowed, and where the table lives. */
export function illegalMessage(m: AnyMachine, state: string, event: string): string {
  const allowed = allowedFrom(m, state);
  const list =
    allowed.length === 0
      ? `none: "${state}" is terminal`
      : allowed.map((a) => `${a.event} -> ${a.to}`).join(', ');
  return [
    `[machine ${m.id}] illegal event "${event}" in state "${state}".`,
    `Allowed from "${state}": ${list}.`,
    whereIs(m),
    'Fix: send one of the allowed events, or (if the rules really allow it) add the transition to the table and run npm run machines:doc.',
  ].join('\n');
}

/**
 * The state after `event`. Illegal events throw an IllegalTransitionError in dev/test; in production they log the same
 * message with console.error and return `state` unchanged.
 */
export function transition<S extends string, E extends string>(m: Machine<S, E>, state: S, event: E): S {
  const any: AnyMachine = m;
  const to = targetOf(any, state, event);
  if (to !== undefined) return to as S;
  const message = illegalMessage(any, state, event);
  if (throws()) {
    throw new IllegalTransitionError(
      m.id,
      state,
      event,
      allowedFrom(any, state).map((a) => a.event),
      message,
    );
  }
  console.error(message);
  return state;
}

/**
 * A step whose target the caller already knows from its data (the state after an engine call, a derived position).
 * Sends `event` from `from`; returns the target when it equals `observed`. An illegal event throws as in `transition`;
 * a legal event whose target differs from `observed` throws (dev/test) or logs (production) a mismatch that names both.
 */
export function transitionTo<S extends string, E extends string>(m: Machine<S, E>, from: S, event: E, observed: S): S {
  const to = transition(m, from, event);
  if (to === observed) return to;
  const any: AnyMachine = m;
  const message = [
    `[machine ${m.id}] event "${event}" from "${from}" leads to "${to}" in the table, but the data is in "${observed}".`,
    whereIs(any),
    'Fix: send the event that matches the data, or (if the data is right) correct the table and run npm run machines:doc.',
  ].join('\n');
  if (throws()) throw new IllegalTransitionError(m.id, from, event, allowedFrom(any, from).map((a) => a.event), message);
  console.error(message);
  return observed;
}

/**
 * A check over observed states, where the event is not known (a machine derived from data, checked rather than
 * driven): staying in a state is always fine; moving needs an edge `from` -> `to`. Throws in dev/test, logs in production.
 */
export function expectEdge(m: AnyMachine, from: string, to: string, what: string): void {
  if (from === to || hasEdge(m, from, to)) return;
  const allowed = allowedFrom(m, from);
  const message = [
    `[machine ${m.id}] ${what}: "${from}" -> "${to}" is not an edge of the table.`,
    `Allowed from "${from}": ${allowed.length === 0 ? `none: "${from}" is terminal` : allowed.map((a) => `${a.event} -> ${a.to}`).join(', ')}.`,
    whereIs(m),
    'Fix: find the code that moved the data this way, or (if the move is right) add the edge to the table and run npm run machines:doc.',
  ].join('\n');
  if (throws()) throw new IllegalTransitionError(m.id, from, `(to ${to})`, allowed.map((a) => a.event), message);
  console.error(message);
}

/** State that is deliberately not a machine (a lone boolean, a timer, a form field): listed in the map with one line. */
export interface LocalState {
  /** A short name, unique, e.g. 'ui.settings'. */
  readonly id: string;
  /** The repository path of the file that holds it. */
  readonly source: string;
  /** One line: what it is and why it is not a machine. */
  readonly why: string;
}

const locals = new Map<string, LocalState>();

/** List state in the map as "local state, not a machine". */
export function declareLocalState(entries: readonly LocalState[]): void {
  for (const e of entries) {
    if (locals.has(e.id) || registry.has(e.id)) throw new Error(`[machine] duplicate id "${e.id}" (${e.source})`);
    locals.set(e.id, e);
  }
}

/** Every declared local state, sorted by id. */
export function listLocalState(): LocalState[] {
  return [...locals.values()].sort((a, b) => a.id.localeCompare(b.id));
}

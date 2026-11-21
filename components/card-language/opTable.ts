// K507: the op table for games on their own engine (shape from a game's opTable.ts, option b1 of its port assessment).
// One row per op, `{ fields, run, text }`: `run` works on the game's own state through the game's EnginePort, and
// `text` is read by card-language's `describeEffect`, so the card's words and the op cannot drift apart.
import { EngineBugError } from '../engine-core/index.ts';
import { describeEffect, type FieldsOf, type Field, type Step } from './index.ts';

/** What `run` gets: the game's state plus the few calls its ops need (the game extends it). */
export interface EnginePort<State> {
  readonly state: State;
}

export interface OpRow<P, S> {
  readonly fields: FieldsOf<S>;
  readonly run: (port: P, op: S) => void;
  /** The short wording (prompts, placeholders). `view.say` writes a nested op in the same mode. */
  readonly text: (op: S, view: TextView) => string;
  /** Optional rule wording (`describeOps(..., { mode: 'rules' })`); falls back to `text`. */
  readonly rules?: (op: S, view: TextView) => string;
}

/** How a text is asked for: `short` (`text`) or `rules` (`rules`, else `text`); `spent` names what a cost spent; `say` writes a nested op. */
export interface TextView {
  readonly mode: 'short' | 'rules';
  readonly spent: string;
  readonly say: (op: Step, spent?: string) => string;
}
export interface DescribeOptions {
  readonly mode?: 'short' | 'rules';
  readonly spent?: string;
}

/** One row per op of the game's op union: a missing op or field check fails to compile. */
export type OpTable<P, S extends Step> = { readonly [K in S['op']]: OpRow<P, Extract<S, { op: K }>> };

type AnyRow = { readonly fields: object; readonly run: unknown; readonly text: unknown; readonly rules?: unknown };
type AnyOpTable = Readonly<Record<string, AnyRow>>;
type PortOf<T> = T[keyof T] extends { readonly run: (port: infer P, op: never) => void } ? P : never;
type OpOf<T> = { [K in keyof T]: T[K] extends { readonly text: (op: infer S, ...rest: never[]) => string } ? S : never }[keyof T];

const rowOf = (table: AnyOpTable, op: unknown): AnyRow => {
  const r = typeof op === 'string' && Object.hasOwn(table, op) ? table[op] : undefined;
  if (r === undefined) throw new EngineBugError(`unknown op ${JSON.stringify(op)}`);
  return r;
};

/** Runs one op through its row. Throws `EngineBugError` for an op not in the table. */
export function runOp<T extends AnyOpTable>(table: T, port: PortOf<T>, op: OpOf<T>): void {
  (rowOf(table, (op as Step).op).run as (p: unknown, o: unknown) => void)(port, op);
}

type Say = (op: unknown, view: TextView) => string;
const viewOf = (table: AnyOpTable, mode: 'short' | 'rules', spent: string): TextView => {
  const view: TextView = { mode, spent, say: (op, sp = spent) => sayOps(table, [op], ' ', mode, sp) };
  return view;
};
function sayOps(table: AnyOpTable, ops: readonly unknown[], join: string, mode: 'short' | 'rules', spent: string): string {
  const view = viewOf(table, mode, spent);
  const words = Object.fromEntries(
    Object.entries(table).map(([k, row]) => {
      const t = (mode === 'rules' && typeof row.rules === 'function' ? row.rules : row.text) as Say | null;
      return [k, { ...row, text: typeof t === 'function' ? (o: unknown) => t(o, view) : t }];
    }),
  );
  return describeEffect(words as never, ops as never, join);
}

/** The card's words for a list of ops: card-language's `describeEffect` over each row's `text` (or `rules` with `{ mode: 'rules' }`). `spent` defaults to `amount`. */
export const describeOps = <T extends AnyOpTable>(table: T, ops: readonly OpOf<T>[], join = ' ', opts: DescribeOptions = {}): string =>
  sayOps(table, ops, join, opts.mode ?? 'short', opts.spent ?? 'amount');

export type OpProblemKind = 'not-an-op' | 'unknown-op' | 'missing-field' | 'extra-field' | 'bad-field' | 'text';
export interface OpProblem {
  readonly card: string;
  readonly index: number;
  readonly op: string;
  readonly kind: OpProblemKind;
  readonly detail: string;
}

/** Each card's ops against the table: unknown op, missing, extra or bad field, text that throws or is empty. [] when all hold. */
export function validateOps(table: AnyOpTable, cards: Readonly<Record<string, readonly unknown[]>>, opts: { readonly metaKeys?: readonly string[] } = {}): OpProblem[] {
  const out: OpProblem[] = [];
  const meta = opts.metaKeys ?? [];
  for (const [card, ops] of Object.entries(cards))
    ops.forEach((raw, index) => {
      const add = (op: string, kind: OpProblemKind, detail: string): void => void out.push({ card, index, op, kind, detail });
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return add('', 'not-an-op', 'an op must be an object');
      const o = raw as Record<string, unknown>;
      const op = String(o.op);
      if (typeof o.op !== 'string' || !Object.hasOwn(table, o.op)) return add(op, 'unknown-op', `unknown op ${JSON.stringify(o.op)}`);
      const fields = rowOf(table, op).fields as Readonly<Record<string, Field>>;
      const before = out.length;
      for (const k of Object.keys(o)) if (k !== 'op' && !meta.includes(k) && !Object.hasOwn(fields, k)) add(op, 'extra-field', k);
      for (const [k, check] of Object.entries(fields)) {
        if (o[k] === undefined) {
          if (check.optional !== true) add(op, 'missing-field', k);
        } else {
          const why = check(o[k]);
          if (why !== null) add(op, 'bad-field', `${k} must be ${why}`);
        }
      }
      if (out.length > before) return;
      try {
        for (const mode of ['short', 'rules'] as const) {
          const words = sayOps(table, [o], ' ', mode, 'amount');
          if (typeof words !== 'string' || words.trim() === '') { add(op, 'text', `empty ${mode} text`); break; }
        }
      } catch (e) {
        add(op, 'text', e instanceof Error ? e.message : String(e));
      }
    });
  return out;
}

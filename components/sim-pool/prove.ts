// K651: the proof recorder, for a game's full-resolve card tests (imports vitest; the sim-pool index does not export it).
// `proveResolved(log, trace, ...clauses)` runs card-harness's `expectResolved` (the test fails unless each clause ran),
// then appends one record per clause to `log` when, and only when, the test finished passing and is not an `it.fails` test.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { expect, onTestFinished } from 'vitest';
import { expectResolved, type AbilityTrace } from '../card-harness/trace.ts';
import type { ProofRecord } from './unreached.ts';

/** A finished test whose record counts: it passed, and it is not an `it.fails` test (rejected whatever its state). */
export const recordable = (task: { readonly fails?: boolean | undefined; readonly result?: { readonly state?: string } | undefined }): boolean => task.fails !== true && task.result?.state === 'pass';

/** K666: one step of a game's own log, mapped to the clause it ran. `applied`: a static or passive clause (a modifier, a rule check) acted; it counts only when `changed(clause, before, after)` (default: `before` and `after` differ). */
export interface ClauseStep {
  readonly clause: string;
  readonly step: number | string;
  readonly kind: 'resolved' | 'applied';
  readonly before?: unknown;
  readonly after?: unknown;
}

/** K666: a trace a game builds from its own log, for `proveResolved` in place of a registry trace. */
export interface ClauseTrace {
  readonly steps: readonly ClauseStep[];
  readonly changed?: ((clause: string, before: unknown, after: unknown) => boolean) | undefined;
}

/** K666: the trace from a game's own log; `clauseOf` maps each entry (and its index) to the steps it shows, or none. */
export function clauseTrace<E>(entries: readonly E[], clauseOf: (entry: E, step: number) => ClauseStep | readonly ClauseStep[] | undefined, changed?: ClauseTrace['changed']): ClauseTrace {
  return { steps: entries.flatMap((e, i) => clauseOf(e, i) ?? []), changed };
}

const expectSteps = (trace: ClauseTrace, ids: readonly string[]): void => {
  const changed = trace.changed ?? ((_c, b, a) => !isDeepStrictEqual(b, a));
  const why = (id: string): string | undefined => {
    const s = trace.steps.filter((x) => x.clause === id);
    if (s.some((x) => x.kind === 'resolved' || changed(id, x.before, x.after))) return undefined;
    return s.length > 0 ? 'applied with no effect' : 'not in the trace';
  };
  const bad = ids.flatMap((id) => {
    const w = why(id);
    return w === undefined ? [] : [`${id} (${w})`];
  });
  if (bad.length > 0) throw new Error(`Not resolved: ${bad.join(', ')}`);
};

export function proveResolved(log: string, trace: AbilityTrace<unknown> | ClauseTrace, ...clauses: string[]): void {
  if ('steps' in trace) expectSteps(trace, clauses);
  else expectResolved(trace, ...clauses);
  const { currentTestName, testPath } = expect.getState();
  const root = process.cwd().replace(/\\/g, '/');
  onTestFinished(({ task }) => {
    if (!recordable(task)) return;
    const at = Date.now();
    const file = relative(root, testPath ?? '').replace(/\\/g, '/');
    mkdirSync(dirname(log), { recursive: true });
    appendFileSync(log, clauses.map((clause) => `${JSON.stringify({ clause, file, test: currentTestName ?? '', root, at } satisfies ProofRecord)}\n`).join(''));
  });
}

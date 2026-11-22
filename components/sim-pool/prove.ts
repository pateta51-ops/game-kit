// K651: the proof recorder, for a game's full-resolve card tests (imports vitest; the sim-pool index does not export it).
// `proveResolved(log, trace, ...clauses)` runs card-harness's `expectResolved` (the test fails unless each clause ran),
// then appends one record per clause to `log` when, and only when, the test finished passing and is not an `it.fails` test.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { expect, onTestFinished } from 'vitest';
import { expectResolved, type AbilityTrace } from '../card-harness/trace.ts';
import type { ProofRecord } from './unreached.ts';

/** A finished test whose record counts: it passed, and it is not an `it.fails` test (rejected whatever its state). */
export const recordable = (task: { readonly fails?: boolean | undefined; readonly result?: { readonly state?: string } | undefined }): boolean => task.fails !== true && task.result?.state === 'pass';

export function proveResolved(log: string, trace: AbilityTrace<unknown>, ...clauses: string[]): void {
  expectResolved(trace, ...clauses);
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

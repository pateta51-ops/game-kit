// K707: the run log. `recordRan(probe, log)` (a vitest setup file; imports vitest) listens to the run probe during each
// test body (not its beforeEach or afterEach hooks) and, when the test passed and is not `it.fails`, appends
// `{ file, test, ran, root }`: the `kind:id` of every piece the game's verb dispatch noted. `readRanLog` (inventory.ts)
// reads it back for `inventory`'s `ran` input, which then counts a piece only when a full-resolve test ran it.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { beforeEach } from 'vitest';
import type { RanRecord } from './inventory.ts';
import type { RanNote, RunProbe } from './probe.ts';

export interface RanTask {
  readonly name: string;
  readonly fails?: boolean | undefined;
  readonly concurrent?: boolean | undefined;
  readonly file: { readonly filepath: string };
  readonly result?: { readonly state?: string; readonly hooks?: Partial<Record<string, string>> } | undefined;
}

/** One shared listener cannot tell concurrent tests apart: a concurrent test is refused. */
export function refuseConcurrent(task: RanTask): void {
  if (task.concurrent === true) throw new Error(`recordRan: "${task.name}" is a concurrent test; the run log credits notes to one test at a time, so card tests must not run concurrently`);
}

/** True while a beforeEach or afterEach hook of the task runs (vitest sets `result.hooks`): notes made there are setup, not the test body. */
export const inHook = (task: RanTask): boolean => task.result?.hooks?.beforeEach === 'run' || task.result?.hooks?.afterEach === 'run';

/** The record of a finished task, or undefined: not passed (failed, skipped), an `it.fails` test, or nothing noted. */
export function ranRecordOf(task: RanTask, ran: ReadonlySet<string>, root: string): RanRecord | undefined {
  if (task.fails === true || task.result?.state !== 'pass' || ran.size === 0) return undefined;
  return { file: relative(root, task.file.filepath).replace(/\\/g, '/'), test: task.name, ran: [...ran].sort(), root };
}

export function recordRan(probe: Pick<RunProbe<RanNote>, 'listen'>, log: string): void {
  beforeEach((ctx) => {
    refuseConcurrent(ctx.task);
    const ran = new Set<string>();
    const stop = probe.listen((d) => void (inHook(ctx.task) || ran.add(`${d.kind}:${d.id}`)));
    ctx.onTestFinished(({ task }) => {
      stop();
      const rec = ranRecordOf(task, ran, process.cwd().replace(/\\/g, '/'));
      if (rec === undefined) return;
      mkdirSync(dirname(log), { recursive: true });
      appendFileSync(log, `${JSON.stringify(rec)}\n`);
    });
  });
}

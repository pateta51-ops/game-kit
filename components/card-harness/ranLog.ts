// K707: the run log. `recordRan(probe, log)` (a vitest setup file; imports vitest) listens to the run probe during each
// test and, when the test passed and is not `it.fails`, appends `{ file, test, ran, root }`: the `kind:id` of every piece
// the game's verb dispatch noted. `readRanLog` reads it back for `inventory`'s `ran` input, which then counts a piece only
// when a full-resolve test ran it, not when its text appears in a test file.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { beforeEach } from 'vitest';
import type { RanRecord } from './inventory.ts';
import type { RanNote, RunProbe } from './probe.ts';

export function recordRan(probe: Pick<RunProbe<RanNote>, 'listen'>, log: string): void {
  beforeEach((ctx) => {
    const ran = new Set<string>();
    const stop = probe.listen((d) => ran.add(`${d.kind}:${d.id}`));
    ctx.onTestFinished(({ task }) => {
      stop();
      if (task.fails === true || task.result?.state !== 'pass' || ran.size === 0) return;
      const root = process.cwd().replace(/\\/g, '/');
      const rec: RanRecord = { file: relative(root, task.file.filepath).replace(/\\/g, '/'), test: task.name, ran: [...ran].sort(), root };
      mkdirSync(dirname(log), { recursive: true });
      appendFileSync(log, `${JSON.stringify(rec)}\n`);
    });
  });
}


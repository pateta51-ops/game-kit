// A vitest reporter that lists every skipped test at the end of a run (names grouped by file) and, in GitHub Actions,
// writes the same list to the job summary, so tests that skip for want of git-ignored input never skip silently.
// vitest.config: reporters: ['default', ['./tools/skip-reporter.ts', { inputs: [['.generated/data', 'npm run extract']] }]]
// `inputs` are the git-ignored paths whose absence makes tests skip, each with the command that makes it.
import { appendFileSync, existsSync } from 'node:fs';

interface Task {
  name: string;
  mode?: string;
  result?: { state?: string };
  tasks?: Task[];
}
interface Mod {
  relativeModuleId: string;
  children: { allTests(): Iterable<{ fullName: string; result(): { state: string } }> };
}

export default class SkipReporter {
  private readonly inputs: [string, string][];
  constructor(options: { inputs?: [string, string][] } = {}) {
    this.inputs = options.inputs ?? [];
  }

  private modern = false;
  onTestRunStart(): void {
    this.modern = true;
  }
  /** vitest 2 (no onTestRunEnd): the same list from its task tree. */
  onFinished(files: readonly Task[] = []): void {
    if (this.modern) return;
    const flat = (t: Task, path: string[]): { fullName: string; result(): { state: string } }[] =>
      t.tasks
        ? t.tasks.flatMap((c) => flat(c, [...path, c.name]))
        : [{ fullName: path.join(' > '), result: () => ({ state: t.mode === 'skip' || t.mode === 'todo' || t.result?.state === 'skip' ? 'skipped' : 'ran' }) }];
    this.onTestRunEnd(files.map((f) => ({ relativeModuleId: f.name, children: { allTests: () => flat(f, []) } })));
  }

  onTestRunEnd(modules: readonly Mod[]): void {
    const out = new Map<string, string[]>();
    let all = 0;
    for (const m of modules)
      for (const t of m.children.allTests()) {
        all++;
        if (t.result().state === 'skipped') out.set(m.relativeModuleId, [...(out.get(m.relativeModuleId) ?? []), t.fullName]);
      }
    const total = [...out.values()].reduce((n, l) => n + l.length, 0);
    const inputs = this.inputs.map(([p, how]) => `${p} ${existsSync(p) ? 'present' : `absent (${how})`}`).join('; ');
    const lines = [
      `Tests: ${all - total} ran, ${total} skipped (in ${out.size} file(s)) of ${all}.${inputs ? ` Inputs: ${inputs}.` : ''}`,
      ...[...out.entries()].sort().flatMap(([f, l]) => [`- ${f} (${l.length})`, ...l.map((n) => `  - ${n}`)]),
    ];
    console.log(`\n${lines.join('\n')}`);
    const summary = process.env['GITHUB_STEP_SUMMARY'];
    if (summary) appendFileSync(summary, `### ${lines[0]}\n\n${lines.slice(1).join('\n')}\n\n`);
  }
}

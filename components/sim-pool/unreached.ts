// K651: the proof for an unreached clause, from card-harness's counted full-resolve tests (the K415 depth gate: a test titled
// with the clause id, not `poor`, not skipped, whose body asserts) that also passed in the test run's report (vitest `--reporter=json`).
// A file that only names the clause, a test that asserts nothing and a test that failed are no proof.
import { inventory, type TestFile } from '../card-harness/index.ts';

/** The parts of a vitest JSON report read here. */
export interface TestReport {
  readonly testResults: readonly { readonly name: string; readonly assertionResults: readonly { readonly title: string; readonly status: string }[] }[];
}

/** Clause id to its counted full-resolve tests (`<path> › <title>`) that passed in `report`; a clause with none is left out. */
export function provenClauses(clauses: readonly string[], tests: readonly TestFile[], report: TestReport): Record<string, string[]> {
  const inv = inventory({ pieces: [], clauses: clauses.map((id) => ({ id, cards: [] })), tests, depth: true });
  const passed = (ref: string): boolean => {
    const i = ref.indexOf(' › ');
    const path = `/${ref.slice(0, i)}`;
    const title = ref.slice(i + 3);
    return report.testResults.some((f) => `/${f.name.replace(/\\/g, '/')}`.endsWith(path) && f.assertionResults.some((a) => a.title === title && a.status === 'passed'));
  };
  const out: Record<string, string[]> = {};
  for (const id of clauses) {
    const ok = (inv.rows.find((r) => r.key === `clause:${id}`)?.direct ?? []).filter(passed);
    if (ok.length) out[id] = ok;
  }
  return out;
}

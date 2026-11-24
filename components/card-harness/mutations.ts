import { isDeepStrictEqual } from 'node:util';
import { linesOf, specCoverage, type SpecGame, type SpecRow } from './spec.ts';

export interface ClauseMutation<R> {
  readonly id: string;
  readonly line: string;
  /** Index in the original records, not the index after a mutation. */
  readonly recordIndex: number;
  /** Replace one record, or remove it with null. Receives an isolated copy. */
  mutate(record: R): R | null;
}
export type MutationStatus = 'killed' | 'survived' | 'invalid' | 'error' | 'baseline-failed' | 'uncovered';
export interface MutationResult {
  readonly id: string;
  readonly line: string;
  readonly status: MutationStatus;
  readonly details: readonly string[];
}
export interface MutationReport {
  readonly results: readonly MutationResult[];
  readonly problems: readonly string[];
  /** Non-exempt clauses with no executable row or no mutant. */
  readonly missing: readonly string[];
  readonly exempted: readonly { readonly line: string; readonly reason: string }[];
  readonly killed: number;
  readonly total: number;
}
export interface MutationOptions<R> {
  /** Content schema validation. Invalid mutants are never evidence of a strong test. */
  validate(records: readonly R[]): readonly string[];
  /** Additional printed clause IDs from the game's catalogue. Duplicate declarations throw. */
  readonly requiredLines?: readonly string[];
  /** Known clauses with a reason mutation testing is inappropriate. */
  readonly exempt?: Readonly<Record<string, string>>;
}
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);

function requireLine(line: unknown, source: string): asserts line is string {
  if (typeof line !== 'string' || !line.trim() || line !== line.trim()) throw new Error(source + ': invalid clause ID');
}

function observe<R, L, A, E, S>(game: SpecGame<R, L, A, E, S>, row: SpecRow<L, A, E>, records: readonly R[]): { failures: string[]; error?: string } {
  try {
    const result = game.play(structuredClone(row.layout), structuredClone(row.act), structuredClone(records), false);
    const expected = (Array.isArray(row.expect) ? row.expect : [row.expect]) as readonly E[];
    return { failures: expected.flatMap(e => {
      const issue = game.check(result, structuredClone(e));
      return issue === undefined ? [] : [issue || 'expectation failed'];
    }) };
  } catch (error) {
    return { failures: [], error: message(error) };
  }
}

/** Run one semantic mutant at a time against every spec row citing its printed line. */
export function runClauseMutations<R, L, A, E, S>(
  game: SpecGame<R, L, A, E, S>,
  rows: readonly SpecRow<L, A, E>[],
  mutations: readonly ClauseMutation<R>[],
  options: MutationOptions<R>,
): MutationReport {
  const original = structuredClone(game.records);
  const baselineProblems = options.validate(structuredClone(original));
  if (baselineProblems.length) throw new Error('invalid original content: ' + baselineProblems.join('; '));
  const required = new Set<string>();
  for (const line of options.requiredLines ?? []) {
    requireLine(line, 'required clause inventory');
    if (required.has(line)) throw new Error('duplicate required clause: ' + line);
    required.add(line);
  }
  const lineOf = game.lineOf?.bind(game);
  const recordLines = original.map((record, index) => {
    const declared = linesOf(record, lineOf);
    if (!Array.isArray(declared) || !declared.length) throw new Error(`record ${String(index)} has no clause IDs`);
    const lines: readonly unknown[] = declared;
    const owned = new Set<string>();
    for (const line of lines) {
      requireLine(line, `record ${String(index)}`);
      if (owned.has(line)) throw new Error(`duplicate clause ${line} in record ${String(index)}`);
      owned.add(line);
      required.add(line);
    }
    return owned;
  });
  const declaredRows = new Set(rows.map(row => row.line));
  const declaredMutants = new Set(mutations.map(mutation => mutation.line));
  const exempted: { line: string; reason: string }[] = [];
  const coverageProblems: string[] = [];
  const exemptions = options.exempt ?? {};
  for (const line of Object.keys(exemptions).sort()) {
    const reason = exemptions[line];
    if (!required.has(line)) coverageProblems.push(line + ': exemption names an unknown clause');
    else if (typeof reason !== 'string' || !reason.trim()) coverageProblems.push(line + ': exemption needs a reason');
    else if (declaredRows.has(line) || declaredMutants.has(line)) coverageProblems.push(line + ': exemption conflicts with a spec row or mutant');
    else exempted.push({ line, reason });
  }
  const ids = new Set<string>();
  const baseline = new Map<string, string[]>();
  const byLine = new Map<string, SpecRow<L, A, E>[]>();
  const executableRows: SpecRow<L, A, E>[] = [];
  for (const row of rows) {
    if (!required.has(row.line)) { coverageProblems.push(row.line + ': spec row names an unknown clause'); continue; }
    if (row.expect === undefined || (Array.isArray(row.expect) && row.expect.length === 0)) {
      coverageProblems.push(row.line + ': spec row has no executable expectations');
      continue;
    }
    executableRows.push(row);
    const group = byLine.get(row.line) ?? [];
    group.push(row);
    byLine.set(row.line, group);
    const observed = observe(game, row, original);
    const problems = baseline.get(row.line) ?? [];
    problems.push(...observed.failures);
    if (observed.error !== undefined) problems.push('engine/test error: ' + observed.error);
    baseline.set(row.line, problems);
  }
  const results: MutationResult[] = [];
  for (const mutation of mutations) {
    if (!mutation.id.trim() || !mutation.line.trim() || ids.has(mutation.id)) throw new Error('empty or duplicate mutation id/line: ' + mutation.id);
    ids.add(mutation.id);
    const finish = (status: MutationStatus, details: readonly string[] = []): void => {
      results.push({ id: mutation.id, line: mutation.line, status, details });
    };
    const i = mutation.recordIndex;
    const record = original[i];
    if (!Number.isSafeInteger(i) || i < 0 || record === undefined || !recordLines[i]?.has(mutation.line)) {
      finish('invalid', ['record index does not own the line']); continue;
    }
    const relevant = byLine.get(mutation.line);
    if (!relevant?.length) { finish('uncovered', ['no spec row with executable expectations']); continue; }
    const prior = baseline.get(mutation.line) ?? [];
    if (prior.length) { finish('baseline-failed', prior); continue; }
    try {
      const changed = mutation.mutate(structuredClone(record));
      if (changed !== null && isDeepStrictEqual(changed, record)) { finish('invalid', ['mutation did not change the record']); continue; }
      const mutated = [...structuredClone(original)];
      if (changed === null) mutated.splice(i, 1);
      else mutated[i] = changed;
      const invalid = options.validate(structuredClone(mutated));
      if (invalid.length) { finish('invalid', invalid); continue; }
      const failures: string[] = [], errors: string[] = [];
      for (const row of relevant) {
        const observed = observe(game, row, mutated);
        failures.push(...observed.failures);
        if (observed.error !== undefined) errors.push(observed.error);
      }
      if (errors.length) finish('error', errors);
      else if (failures.length) finish('killed', failures);
      else finish('survived', ['all relevant assertions still passed']);
    } catch (error) {
      finish('error', [message(error)]);
    }
  }
  const { missing: withoutRows } = specCoverage({
    records: [...required], rows: executableRows, lineOf: line => line,
    exempt: Object.fromEntries(exempted.map(({ line, reason }) => [line, reason])),
  });
  const withoutMutants = [...byLine.keys()].filter(line => !declaredMutants.has(line)).sort();
  const problems = [
    ...coverageProblems,
    ...[...baseline].flatMap(([line, issues]) => issues.map(issue => line + ': baseline: ' + issue)),
    ...withoutRows.map(line => line + ': no spec row with executable expectations'),
    ...withoutMutants.map(line => line + ': no mutation supplied'),
    ...results.filter(r => r.status !== 'killed').map(r => r.line + '/' + r.id + ': ' + r.status + ': ' + r.details.join('; ')),
  ];
  return { results, problems, missing: [...withoutRows, ...withoutMutants].sort(), exempted, killed: results.filter(r => r.status === 'killed').length, total: results.length };
}

import { isDeepStrictEqual } from 'node:util';
import type { SpecGame, SpecRow } from './spec.ts';

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
  readonly killed: number;
  readonly total: number;
}
export interface MutationOptions<R> {
  /** Content schema validation. Invalid mutants are never evidence of a strong test. */
  validate(records: readonly R[]): readonly string[];
}
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);

function owns<R>(game: { lineOf?(record: R): string | readonly string[] | undefined }, record: R, line: string): boolean {
  const fallback = record as { line?: string; lines?: readonly string[] };
  const value = game.lineOf ? game.lineOf(record) : fallback.line ?? fallback.lines;
  return typeof value === 'string' ? value === line : value?.includes(line) ?? false;
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
  const ids = new Set<string>();
  const baseline = new Map<string, string[]>();
  const byLine = new Map<string, SpecRow<L, A, E>[]>();
  for (const row of rows) {
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
    const relevant = byLine.get(mutation.line);
    if (!relevant?.length) { finish('uncovered', ['no spec row for line']); continue; }
    const prior = baseline.get(mutation.line) ?? [];
    if (prior.length) { finish('baseline-failed', prior); continue; }
    const i = mutation.recordIndex;
    const record = original[i];
    if (!Number.isSafeInteger(i) || i < 0 || record === undefined || !owns(game, record, mutation.line)) {
      finish('invalid', ['record index does not own the line']); continue;
    }
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
  const problems = [
    ...[...baseline].flatMap(([line, issues]) => issues.map(issue => line + ': baseline: ' + issue)),
    ...[...byLine.keys()].filter(line => !mutations.some(m => m.line === line)).map(line => line + ': no mutation supplied'),
    ...results.filter(r => r.status !== 'killed').map(r => r.line + '/' + r.id + ': ' + r.status + ': ' + r.details.join('; ')),
  ];
  return { results, problems, killed: results.filter(r => r.status === 'killed').length, total: results.length };
}

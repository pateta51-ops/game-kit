import { isDeepStrictEqual } from 'node:util';

export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
export type Path = readonly (string | number)[];
export type Assertion =
  | { readonly path: Path; readonly source: 'state' | 'events'; readonly op: 'equals' | 'notEquals'; readonly value: Json }
  | { readonly path: Path; readonly source: 'state' | 'events'; readonly op: 'exists' | 'absent' }
  | { readonly path: Path; readonly source: 'state' | 'events'; readonly op: 'atLeast' | 'atMost'; readonly value: number };
export interface RuleStep<A> {
  readonly action: A;
  readonly accepted: boolean;
  readonly checks: readonly Assertion[];
}
export type RuleRequirement =
  | { readonly id: string; readonly kind: 'setup' }
  | { readonly id: string; readonly kind: 'action'; readonly requireRefusal?: boolean };
export type RuleEvidence = { readonly rule: string; readonly assertion: number } & (
  | { readonly kind: 'setup' }
  | { readonly kind: 'action'; readonly step: number }
);
export interface RuleCase<F, A> {
  readonly id: string;
  readonly rules: readonly string[];
  readonly seed: string;
  readonly fixture: F;
  readonly initial?: readonly Assertion[];
  readonly steps: readonly RuleStep<A>[];
  readonly evidence?: readonly RuleEvidence[];
}
export interface RuleAdapter<F, A, S> {
  setup(fixture: F, seed: string): S;
  /** Rejected actions must return the unchanged authoritative state and no events. */
  act(state: S, action: A): { readonly accepted: boolean; readonly state: S; readonly events: readonly Json[] };
  /** Normalized rule-relevant state, including queues/RNG if relevant. Never omit fields merely to make a case pass. */
  observe(state: S): Json;
}
export interface RuleResult {
  readonly id: string;
  readonly rules: readonly string[];
  readonly problems: readonly string[];
}
export interface RuleReport {
  readonly cases: readonly RuleResult[];
  readonly problems: readonly string[];
  readonly passed: readonly string[];
  readonly missing: readonly string[];
}

function readPath(value: Json, path: Path): { found: true; value: Json } | { found: false } {
  let current: Json = value;
  for (const key of path) {
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, key)) return { found: false };
    if (Array.isArray(current) && (typeof key !== 'number' || !Number.isSafeInteger(key) || key < 0)) return { found: false };
    const record = current as Readonly<Record<string | number, Json>>;
    const next = record[key];
    if (next === undefined) return { found: false };
    current = next;
  }
  return { found: true, value: current };
}

function problem(assertion: Assertion, state: Json, events: readonly Json[]): string | undefined {
  const at = assertion.source + ':' + JSON.stringify(assertion.path);
  if (assertion.source !== 'state' && assertion.source !== 'events') return 'invalid assertion source';
  if (!Array.isArray(assertion.path) || assertion.path.some(k => typeof k !== 'string' && (typeof k !== 'number' || !Number.isSafeInteger(k) || k < 0))) return 'invalid assertion path';
  const found = readPath(assertion.source === 'state' ? state : events, assertion.path);
  if (assertion.op === 'absent') return found.found ? at + ' must be absent' : undefined;
  if (!found.found) return at + ' is missing';
  switch (assertion.op) {
    case 'exists': return undefined;
    case 'equals': return isDeepStrictEqual(found.value, assertion.value) ? undefined : at + ' differs from expected ' + JSON.stringify(assertion.value);
    case 'notEquals': return isDeepStrictEqual(found.value, assertion.value) ? at + ' unexpectedly equals ' + JSON.stringify(assertion.value) : undefined;
    case 'atLeast': return typeof found.value === 'number' && Number.isFinite(found.value) && Number.isFinite(assertion.value) && found.value >= assertion.value ? undefined : at + ' below expected minimum ' + String(assertion.value);
    case 'atMost': return typeof found.value === 'number' && Number.isFinite(found.value) && Number.isFinite(assertion.value) && found.value <= assertion.value ? undefined : at + ' above expected maximum ' + String(assertion.value);
    default: return at + ' invalid assertion operation';
  }
}

/** Run independent rule fixtures against a game-owned adapter, with explicit coverage and no title-based credit. */
export function runRuleAssertions<F, A, S>(adapter: RuleAdapter<F, A, S>, requiredRules: readonly (string | RuleRequirement)[], cases: readonly RuleCase<F, A>[]): RuleReport {
  const required = new Map<string, RuleRequirement>();
  for (const entry of requiredRules) {
    const rule: RuleRequirement = typeof entry === 'string' ? { id: entry, kind: 'action' } : entry;
    const { id } = rule;
    if (!id.trim() || id !== id.trim() || required.has(id)) throw new Error('empty, padded or duplicate required rule: ' + id);
    if (rule.kind !== 'setup' && rule.kind !== 'action') throw new Error('invalid required rule kind: ' + id);
    if ('requireRefusal' in rule && (rule.kind !== 'action' || typeof rule.requireRefusal !== 'boolean')) throw new Error('invalid refusal requirement: ' + id);
    required.set(id, rule);
  }
  const ids = new Set<string>();
  const covered = new Set<string>();
  const accepted = new Set<string>();
  const refused = new Set<string>();
  const failedRules = new Set<string>();
  const results: RuleResult[] = [];
  for (const c of cases) {
    if (!c.id.trim() || ids.has(c.id)) throw new Error('empty or duplicate case id: ' + c.id);
    ids.add(c.id);
    const issues: string[] = [];
    if (!c.rules.length || new Set(c.rules).size !== c.rules.length || c.rules.some(r => !required.has(r))) issues.push('case has missing, duplicate or unknown rule IDs');
    if (!c.seed.trim()) issues.push('case has no seed');
    if (!c.steps.length && !c.initial?.length) issues.push('case has no assertions');
    const executed = new Map<string, Map<number, boolean>>();
    try {
      let state = adapter.setup(structuredClone(c.fixture), c.seed);
      const checks = (expected: readonly Assertion[], observed: Json, events: readonly Json[], label: string): void => {
        const results = new Map<number, boolean>();
        executed.set(label, results);
        for (const [i, assertion] of expected.entries()) {
          const error = problem(assertion, observed, events);
          results.set(i, error === undefined);
          if (error !== undefined) issues.push(label + ': ' + error);
        }
      };
      checks(c.initial ?? [], adapter.observe(state), [], 'initial');
      for (const [i, step] of c.steps.entries()) {
        const label = 'step ' + String(i + 1);
        if (typeof step.accepted !== 'boolean' || !step.checks.length) { issues.push(label + ': missing acceptance or rule assertions'); break; }
        const before = structuredClone(adapter.observe(state));
        const result = adapter.act(state, structuredClone(step.action));
        if (result.accepted !== step.accepted) issues.push(label + ': unexpected action acceptance');
        const observed = adapter.observe(result.state);
        if (!result.accepted && (!isDeepStrictEqual(before, observed) || result.events.length > 0)) issues.push(label + ': rejected action changed state or emitted events');
        checks(step.checks, observed, result.events, label);
        state = result.state;
      }
    } catch (e) { issues.push('adapter error: ' + (e instanceof Error ? e.message : String(e))); }
    const bindings = new Map<string, Set<string>>();
    const acceptedHere = new Set<string>();
    const refusedHere = new Set<string>();
    for (const evidence of c.evidence ?? []) {
      const { rule: id, assertion } = evidence;
      const requirement = required.get(id);
      if (!requirement || !c.rules.includes(id)) {
        issues.push(id + ': evidence names a rule outside this case or inventory');
        continue;
      }
      if (evidence.kind !== requirement.kind) {
        issues.push(id + ': expected ' + requirement.kind + ' evidence');
        continue;
      }
      const step = evidence.kind === 'action' ? c.steps[evidence.step] : undefined;
      const checks = evidence.kind === 'setup' ? c.initial : step?.checks;
      if (!Number.isSafeInteger(assertion) || assertion < 0 || !checks?.[assertion] ||
        (evidence.kind === 'action' && (!Number.isSafeInteger(evidence.step) || evidence.step < 0)) ||
        (evidence.kind === 'setup' && checks[assertion].source !== 'state')) {
        issues.push(id + ': invalid evidence reference');
        continue;
      }
      const label = evidence.kind === 'setup' ? 'initial' : 'step ' + String(evidence.step + 1);
      const key = label + ':' + String(assertion);
      const seen = bindings.get(id) ?? new Set<string>();
      if (seen.has(key)) {
        issues.push(id + ': duplicate evidence reference ' + key);
        continue;
      }
      seen.add(key);
      bindings.set(id, seen);
      const passed = executed.get(label)?.get(assertion);
      if (passed === undefined) issues.push(id + ': evidence did not execute at ' + key);
      else if (!passed) issues.push(id + ': evidence failed at ' + key);
      else if (step) (step.accepted ? acceptedHere : refusedHere).add(id);
    }
    for (const id of c.rules) if (!bindings.has(id)) issues.push(id + ': missing evidence binding');
    if (issues.length === 0) {
      for (const id of bindings.keys()) covered.add(id);
      for (const id of acceptedHere) accepted.add(id);
      for (const id of refusedHere) refused.add(id);
    }
    else for (const id of c.rules) failedRules.add(id);
    results.push({ id: c.id, rules: c.rules, problems: issues });
  }
  const missingControls = new Map<string, string>();
  for (const rule of required.values()) {
    if (rule.kind === 'action' && rule.requireRefusal) {
      if (!accepted.has(rule.id)) missingControls.set(rule.id, 'no passing accepted-action evidence');
      else if (!refused.has(rule.id)) missingControls.set(rule.id, 'no passing rejected-action control');
    }
  }
  const passed = [...covered].filter(id => !failedRules.has(id) && !missingControls.has(id)).sort();
  const passedIds = new Set(passed);
  const missing = [...required.keys()].filter(id => !passedIds.has(id)).sort();
  const problems = [
    ...results.flatMap(r => r.problems.map(p => r.id + ': ' + p)),
    ...missing.map(id => id + ': ' + (missingControls.get(id) ?? 'no passing complete rule evidence')),
  ];
  return { cases: results, problems, passed, missing };
}

export function assertRuleCoverage(report: RuleReport): void {
  if (report.problems.length) throw new Error(report.problems.join('\n'));
}

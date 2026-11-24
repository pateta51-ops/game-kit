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
export interface RuleCase<F, A> {
  readonly id: string;
  readonly rules: readonly string[];
  readonly seed: string;
  readonly fixture: F;
  readonly initial?: readonly Assertion[];
  readonly steps: readonly RuleStep<A>[];
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
export function runRuleAssertions<F, A, S>(adapter: RuleAdapter<F, A, S>, requiredRules: readonly string[], cases: readonly RuleCase<F, A>[]): RuleReport {
  const required = new Set(requiredRules);
  if (required.size !== requiredRules.length || requiredRules.some(r => !r.trim())) throw new Error('empty or duplicate required rule');
  const ids = new Set<string>();
  const covered = new Set<string>();
  const failedRules = new Set<string>();
  const results: RuleResult[] = [];
  for (const c of cases) {
    if (!c.id.trim() || ids.has(c.id)) throw new Error('empty or duplicate case id: ' + c.id);
    ids.add(c.id);
    const issues: string[] = [];
    if (!c.rules.length || new Set(c.rules).size !== c.rules.length || c.rules.some(r => !required.has(r))) issues.push('case has missing, duplicate or unknown rule IDs');
    if (!c.seed.trim()) issues.push('case has no seed');
    if (!c.steps.length && !c.initial?.length) issues.push('case has no assertions');
    try {
      let state = adapter.setup(structuredClone(c.fixture), c.seed);
      const checks = (expected: readonly Assertion[], observed: Json, events: readonly Json[], label: string): void => {
        for (const assertion of expected) {
          const error = problem(assertion, observed, events);
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
    if (issues.length === 0) for (const id of c.rules) covered.add(id);
    else for (const id of c.rules) failedRules.add(id);
    results.push({ id: c.id, rules: c.rules, problems: issues });
  }
  const passed = [...covered].filter(id => !failedRules.has(id)).sort();
  const missing = [...required].filter(id => !passed.includes(id)).sort();
  const problems = [...results.flatMap(r => r.problems.map(p => r.id + ': ' + p)), ...missing.map(id => id + ': no passing complete rule evidence')];
  return { cases: results, problems, passed, missing };
}

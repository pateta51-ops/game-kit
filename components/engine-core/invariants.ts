import type { InvariantViolation } from './types.ts';

export interface InvariantConfig<S, C> {
  /** Instance IDs only, not printed card IDs. Each declared group is a disjoint universe. */
  readonly zones?: Readonly<Record<string, {
    readonly locations: (state: S, content: C) => Readonly<Record<string, readonly string[]>>;
    readonly expected?: (state: S, content: C) => readonly string[];
  }>>;
  readonly counters?: (state: S, content: C) => Readonly<Record<string, number>>;
  readonly totals?: Readonly<Record<string, {
    readonly actual: (state: S, content: C) => number;
    readonly expected: (state: S, content: C) => number;
  }>>;
  readonly flags?: (state: S, content: C) => Readonly<Record<string, boolean>>;
  readonly queues?: (state: S, content: C) => {
    readonly idle: boolean;
    readonly pending: Readonly<Record<string, number>>;
  };
}

/** A GameRules.invariants callback. Selectors are read-only and game-owned; no rule is inferred. */
export function stateInvariants<S, C>(config: InvariantConfig<S, C>): (state: S, content: C, events: readonly unknown[], prev?: S) => readonly InvariantViolation[] {
  return (state, content, _events, prev) => {
    const violations: InvariantViolation[] = [];
    const issue = (id: string, message: string): void => { violations.push({ id, message }); };
    for (const [group, zone] of Object.entries(config.zones ?? {})) {
      const seen = new Map<string, string>();
      for (const [location, ids] of Object.entries(zone.locations(state, content))) {
        for (const id of ids) {
          const previous = seen.get(id);
          if (previous !== undefined) issue('zone:' + group, JSON.stringify(id) + ' appears in ' + previous + ' and ' + location);
          else seen.set(id, location);
        }
      }
      if (zone.expected) {
        const list = zone.expected(state, content);
        const expected = new Set(list);
        if (expected.size !== list.length) issue('zone:' + group, 'expected instance list contains duplicate IDs');
        for (const id of expected) if (!seen.has(id)) issue('zone:' + group, 'missing ' + JSON.stringify(id));
        for (const id of seen.keys()) if (!expected.has(id)) issue('zone:' + group, 'unexpected ' + JSON.stringify(id));
      }
    }
    for (const [id, count] of Object.entries(config.counters?.(state, content) ?? {})) {
      if (!Number.isSafeInteger(count) || count < 0) issue('counter:' + id, 'expected nonnegative safe integer; got ' + String(count));
    }
    for (const [id, total] of Object.entries(config.totals ?? {})) {
      const actual = total.actual(state, content);
      const expected = total.expected(state, content);
      if (!Number.isSafeInteger(actual) || actual < 0 || !Number.isSafeInteger(expected) || expected < 0 || actual !== expected)
        issue('total:' + id, 'expected conserved total ' + String(expected) + '; got ' + String(actual));
    }
    if (prev !== undefined && config.flags) {
      const before = config.flags(prev, content);
      const after = config.flags(state, content);
      for (const [id, set] of Object.entries(before)) {
        if (set && (!Object.hasOwn(after, id) || after[id] !== true)) issue('flag:' + id, 'permanent flag was unset or removed');
      }
    }
    if (config.queues) {
      const { idle, pending } = config.queues(state, content);
      for (const [id, count] of Object.entries(pending)) {
        if (!Number.isSafeInteger(count) || count < 0) issue('queue:' + id, 'invalid queue length ' + String(count));
        else if (idle && count !== 0) issue('queue:' + id, 'idle with ' + String(count) + ' pending');
      }
    }
    return violations;
  };
}

// K79 (middle-earth-player src/rules/core/cause.ts, MIT): why a number moved. An event that changes a number names the
// rule that moved it or the effect record and the printed line it implements. Opt-in: `inCause` stamps the cause on the
// events emitted inside it; a game that never calls it emits what it always did. `causeProblems` lists the counted
// events without one (replay-cli refuses them in the goldens when the game module exports `causes`).
import type { Ctx, GameTypes, KernelEvent } from './types.ts';

export type Cause = { readonly rule: string } | { readonly effect: string; readonly line: string };

export const ruleCause = (rule: string): Cause => ({ rule });
export const effectCause = (effect: string, line: string): Cause => ({ effect, line });

const active = new WeakMap<object, Cause[]>();

/** Runs `run` with `cause` active on `ctx`: every event emitted inside without its own `cause` gets it (the innermost wins). */
export function inCause<G extends GameTypes, T>(ctx: Ctx<G>, cause: Cause | undefined, run: () => T): T {
  if (cause === undefined) return run();
  const stack = active.get(ctx) ?? [];
  active.set(ctx, [...stack, cause]);
  try {
    return run();
  } finally {
    active.set(ctx, stack);
  }
}

/** The cause active on `ctx`, if any. */
export const currentCause = (ctx: object): Cause | undefined => {
  const s = active.get(ctx);
  return s === undefined ? undefined : s[s.length - 1];
};

/** Which events must carry a cause (`counts`: the game's number-changing events) and, optionally, whether a cause is known (null when it is, else why not). */
export interface CauseCheck<E extends KernelEvent = KernelEvent> {
  counts(event: E): boolean;
  known?(cause: Cause): string | null;
}

/** One line per counted event with no cause, an empty rule, effect or line, or a cause `known` refuses. */
export function causeProblems<E extends KernelEvent>(events: readonly E[], check: CauseCheck<E>): string[] {
  const out: string[] = [];
  for (const e of events) {
    if (!check.counts(e)) continue;
    const c = e.cause;
    const kind = (e as { type?: unknown }).type ?? (e as { kind?: unknown }).kind;
    const at = `event ${String(e.seq)}${typeof kind === 'string' ? ` (${kind})` : ''}`;
    const why =
      c === undefined
        ? 'no cause'
        : 'rule' in c
          ? c.rule === '' ? 'an empty rule id' : (check.known?.(c) ?? null)
          : c.effect === '' || c.line === '' ? 'an effect cause without its record or printed line' : (check.known?.(c) ?? null);
    if (why !== null) out.push(`${at}: ${why}`);
  }
  return out;
}

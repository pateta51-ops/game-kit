// Transition-graph invariants: machine tables that drive nothing, checked against the positions a game went through.
import { allowedFrom, hasEdge, isState, whereIs, type AnyMachine } from './machine';

export interface Track<T> {
  readonly machine: AnyMachine;
  /** The machine's state in a recorded position; null when the position is not on this machine (the step is skipped). */
  of(s: T): string | null;
  /** Staying in a state needs no edge (default: it needs one, e.g. `again: 'x'` from x). */
  readonly stay?: boolean;
  /** States a move may pass through unseen: a -> b is legal when a -> t and t -> b are edges. */
  readonly transient?: readonly string[];
  /** States seen inside the step, in order (e.g. the phase stamped on each event); repeats are collapsed. */
  between?(prev: T, next: T): readonly string[];
  /** The state before the first recorded position (`recordingViolations` checks the edge from it). */
  readonly start?: string;
}

export interface GraphViolation {
  readonly machine: string;
  /** The index in the recording of the position the step arrived at (0 for a single step). */
  readonly index: number;
  readonly from: string | null;
  readonly to: string;
  readonly message: string;
}

const after = (m: AnyMachine, state: string): string =>
  allowedFrom(m, state)
    .map((a) => `${a.event} -> ${a.to}`)
    .join(', ') || 'nothing (terminal)';

function walkViolations<T>(t: Track<T>, walk: readonly string[], index: number): GraphViolation[] {
  const m = t.machine;
  const out: GraphViolation[] = [];
  walk.forEach((to, i) => {
    const from = i === 0 ? null : (walk[i - 1] as string);
    if (!isState(m, to)) {
      // one violation, at the step that arrives; staying is not reported again, and the step that leaves has no edge to judge
      if (from !== to) out.push({
        machine: m.id,
        index,
        from,
        to,
        message: [`[machine ${m.id}] "${to}" is not a state of the table.`, `States: ${m.stateNames.join(', ')}`, whereIs(m)].join('\n'),
      });
      return;
    }
    if (from === null || !isState(m, from)) return;
    if (from === to && t.stay === true) return;
    if (hasEdge(m, from, to) || (t.transient ?? []).some((x) => hasEdge(m, from, x) && hasEdge(m, x, to))) return;
    out.push({
      machine: m.id,
      index,
      from,
      to,
      message: [
        `[machine ${m.id}] the step went from "${from}" to "${to}", which is not an edge of the table${walk.length > 2 ? ` (walk ${walk.join(' > ')})` : ''}.`,
        `Legal after "${from}": ${after(m, from)}`,
        whereIs(m),
      ].join('\n'),
    });
  });
  return out;
}

/** The violations of one step. With no `prev` (a laid-out position), only that `next` is a state of each table. */
export function stepViolations<T>(tracks: readonly Track<T>[], prev: T | undefined, next: T, index = 0): GraphViolation[] {
  return tracks.flatMap((t) => {
    const to = t.of(next);
    if (to === null) return [];
    const from = prev === undefined ? null : t.of(prev);
    if (prev === undefined || from === null) return walkViolations(t, [to], index);
    const walk = [from];
    for (const x of [...(t.between?.(prev, next) ?? []), to]) if (walk[walk.length - 1] !== x) walk.push(x);
    if (walk.length === 1) walk.push(to);
    // an unknown `from` was reported by the step that arrived at it
    return walkViolations(t, walk, index).filter((v) => v.from !== null);
  });
}

/** The violations of a recorded game (its positions in order); none for a legal one or an empty recording. */
export function recordingViolations<T>(tracks: readonly Track<T>[], states: readonly T[]): GraphViolation[] {
  return states.flatMap((s, i) => {
    const out = stepViolations(tracks, i === 0 ? undefined : states[i - 1], s, i);
    if (i > 0) return out;
    for (const t of tracks) {
      const to = t.of(s);
      if (t.start !== undefined && to !== null && isState(t.machine, to))
        out.push(...walkViolations(t, [t.start, to], 0).filter((v) => v.to === to));
    }
    return out;
  });
}

// Over seeded games: every legal action (with its target) is sent by some labelled control.
export interface Control<A> {
  /** The words the player reads on it (its accessible name). */
  readonly label: string;
  /** The actions it sends, as the screen's own function builds them. */
  readonly sends: readonly A[];
}

export interface CoverageSpec<S, A> {
  /** The seeded states to check (each a point in a played game). */
  readonly states: Iterable<{ readonly id: string; readonly state: S }>;
  /** The engine's legal actions, one per target. */
  readonly legal: (state: S) => readonly A[];
  /** The controls the screen draws for that state, from the same pure functions it renders with. */
  readonly controls: (state: S) => readonly Control<A>[];
  /** Same string for the same action and target (default JSON.stringify). */
  readonly key?: (action: A) => string;
}

/** A line per legal action no control sends, per control without a label and per control sending an illegal action. Empty when covered. */
export function checkActionCoverage<S, A>(spec: CoverageSpec<S, A>): string[] {
  const key = spec.key ?? ((a: A) => JSON.stringify(a));
  const bad: string[] = [];
  for (const { id, state } of spec.states) {
    const legal = new Set(spec.legal(state).map(key));
    const sent = new Set<string>();
    for (const c of spec.controls(state)) {
      if (c.label.trim() === '') bad.push(`${id}: a control has no label`);
      for (const a of c.sends) {
        const k = key(a);
        sent.add(k);
        if (!legal.has(k)) bad.push(`${id}: control "${c.label}" sends ${k}, which is not legal`);
      }
    }
    for (const k of legal) if (!sent.has(k)) bad.push(`${id}: legal action ${k} has no control`);
  }
  return bad;
}

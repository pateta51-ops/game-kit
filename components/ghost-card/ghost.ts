// K92 (idea from ArkhamHorror frontend/src/arkham/ghostAbility.ts, no licence: written new). A choice whose source has
// left play has nowhere on the table to hang its button, so the screen shows it on a ghost of the card as it last was.

export interface GhostGroup<C, R, S> {
  readonly source: R;
  /** The source as it last was (engine-core `lastKnown`); undefined when the game kept no snapshot. */
  readonly snapshot: S | undefined;
  readonly choices: C[];
}

export interface GhostSplit<C, R, S> {
  /** Choices the table can show: no source, or the source is on the board. */
  readonly onTable: C[];
  /** One group per absent source, in order of first choice. */
  readonly ghosts: GhostGroup<C, R, S>[];
}

/** Splits a prompt's choices into those the table hangs and those a ghost card must show. Sources are grouped by `key` (default JSON). */
export function ghostChoices<C, R, S>(
  choices: readonly C[],
  sourceOf: (c: C) => R | undefined,
  onBoard: (r: R) => boolean,
  snapshotOf: (r: R) => S | undefined,
  key: (r: R) => string = (r) => JSON.stringify(r),
): GhostSplit<C, R, S> {
  const onTable: C[] = [];
  const ghosts = new Map<string, GhostGroup<C, R, S>>();
  for (const c of choices) {
    const r = sourceOf(c);
    if (r === undefined || onBoard(r)) {
      onTable.push(c);
      continue;
    }
    const k = key(r);
    const g = ghosts.get(k);
    if (g) g.choices.push(c);
    else ghosts.set(k, { source: r, snapshot: snapshotOf(r), choices: [c] });
  }
  return { onTable, ghosts: [...ghosts.values()] };
}

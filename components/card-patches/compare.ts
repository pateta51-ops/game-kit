// Card stats diffed against a community database (ArkhamHorror validate/Main.hs idea), with a reviewed list of known database errors.
export interface DiffField<O, T> {
  readonly name: string;
  readonly ours: (c: O) => unknown;
  readonly theirs: (c: T) => unknown;
}
export interface KnownDiff {
  readonly id: string;
  readonly field: string;
  readonly reason: string;
}
export interface Mismatch {
  readonly id: string;
  readonly field: string;
  readonly ours: unknown;
  readonly theirs: unknown;
}
export interface CardDiff {
  /** In ours, not in theirs. */
  readonly unknown: string[];
  /** In theirs, not in ours. */
  readonly missing: string[];
  readonly mismatches: Mismatch[];
  /** Known entries that no longer differ: delete them. */
  readonly staleKnown: KnownDiff[];
}
export function diffCards<O, T>(ours: Readonly<Record<string, O>>, theirs: Readonly<Record<string, T>>, fields: readonly DiffField<O, T>[], known: readonly KnownDiff[] = []): CardDiff {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const used = new Set<KnownDiff>();
  const mismatches: Mismatch[] = [];
  for (const [id, o] of Object.entries(ours)) {
    const t = theirs[id];
    if (t === undefined) continue;
    for (const f of fields) {
      const a = f.ours(o);
      const b = f.theirs(t);
      if (same(a, b)) continue;
      const k = known.find((x) => x.id === id && x.field === f.name);
      if (k) used.add(k);
      else mismatches.push({ id, field: f.name, ours: a, theirs: b });
    }
  }
  return {
    unknown: Object.keys(ours).filter((id) => !(id in theirs)),
    missing: Object.keys(theirs).filter((id) => !(id in ours)),
    mismatches,
    staleKnown: known.filter((k) => !used.has(k)),
  };
}

// Missing-card stand-in instead of a crash (ArkhamHorror MissingCustomCardSpec idea).
export interface CardLookup<C> {
  (id: string): C;
  /** Ids that had no definition and got a stand-in, for the bug report. */
  readonly missing: ReadonlySet<string>;
}
export function cardLookup<C>(cards: Readonly<Record<string, C>>, standIn: (id: string) => C): CardLookup<C> {
  const missing = new Set<string>();
  const f = (id: string): C => {
    if (Object.hasOwn(cards, id)) return cards[id] as C;
    missing.add(id);
    return standIn(id);
  };
  return Object.assign(f, { missing });
}

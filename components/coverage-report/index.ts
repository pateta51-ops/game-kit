export type Construct = string;
export interface CoverageInput<C> {
  cards: readonly C[];
  /** Card id for the report; default `String(index)`. */
  id?: (card: C, index: number) => string;
  /** Constructs one card uses, like `op:gain`; default `walkConstructs(card)`. */
  constructsOf?: (card: C) => Construct[];
  /** Every construct the language has (its registry); the ones no card uses are reported unused. */
  universe?: readonly Construct[];
  /** Constructs the game has a handler for; omit to skip the unhandled check. */
  handlers?: Iterable<Construct>;
}
export interface UsedRow { construct: Construct; count: number; cards: string[]; handled: boolean | null }
export interface CoverageReport { used: UsedRow[]; unused: Construct[]; unhandled: { construct: Construct; cards: string[] }[]; empty: string[] }

/** Walks any value; a string under one of `keys` is a construct `<key>:<value>` (default keys: `op`, `on`). */
export function walkConstructs(value: unknown, keys: readonly string[] = ['op', 'on']): Construct[] {
  const out: Construct[] = [];
  const go = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(go);
    if (v === null || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) {
      if (typeof x === 'string' && keys.includes(k)) out.push(`${k}:${x}`);
      else go(x);
    }
  };
  go(value);
  return out;
}

export function coverageReport<C>(input: CoverageInput<C>): CoverageReport {
  const handlers = input.handlers ? new Set(input.handlers) : null;
  const by = new Map<Construct, { count: number; cards: Set<string> }>();
  const empty: string[] = [];
  input.cards.forEach((c, i) => {
    const id = input.id ? input.id(c, i) : String(i);
    const cs = input.constructsOf ? input.constructsOf(c) : walkConstructs(c);
    if (!cs.length) empty.push(id);
    for (const k of cs) {
      const e = by.get(k) ?? { count: 0, cards: new Set<string>() };
      e.count++;
      e.cards.add(id);
      by.set(k, e);
    }
  });
  const used = [...by].map(([construct, e]) => ({ construct, count: e.count, cards: [...e.cards], handled: handlers ? handlers.has(construct) : null })).sort((a, b) => a.construct.localeCompare(b.construct));
  return {
    used,
    unused: (input.universe ?? []).filter((k) => !by.has(k)).sort(),
    unhandled: used.filter((r) => r.handled === false).map((r) => ({ construct: r.construct, cards: r.cards })),
    empty,
  };
}

export function formatReport(r: CoverageReport): string {
  const lines = ['construct | uses | cards | handler'];
  for (const u of r.used) lines.push(`${u.construct} | ${String(u.count)} | ${u.cards.join(',')} | ${u.handled === null ? '-' : u.handled ? 'yes' : 'MISSING'}`);
  lines.push(`unused (${String(r.unused.length)}): ${r.unused.join(' ') || 'none'}`);
  lines.push(`without handler (${String(r.unhandled.length)}): ${r.unhandled.map((u) => u.construct).join(' ') || 'none'}`);
  lines.push(`cards with no construct (${String(r.empty.length)}): ${r.empty.join(' ') || 'none'}`);
  return lines.join('\n');
}

/** CLI body: prints the table (or JSON with `--json`); returns 1 when `--strict` and an entry uses a construct with no handler. */
export function runCli<C>(input: CoverageInput<C>, argv: readonly string[], print: (s: string) => void = console.log): number {
  const r = coverageReport(input);
  print(argv.includes('--json') ? JSON.stringify(r, null, 2) : formatReport(r));
  return argv.includes('--strict') && r.unhandled.length ? 1 : 0;
}

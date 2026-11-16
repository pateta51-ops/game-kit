// Three small checks: a type-level module boundary, a rule-violation list for the screen, a catalogue-wide face-against-behaviour check.

// Text of a file in which every path must NOT be importable; `tsc` reports an unused @ts-expect-error when one becomes importable.
export function boundaryFile(forbidden: string[]): string {
  return forbidden.map((p) => `// @ts-expect-error internal path must stay unimportable\nimport ${JSON.stringify(p)};`).join('\n') + '\nexport {};\n';
}

export interface Violation { rule: string; text: string; links?: { kind: string; id: string }[]; severity?: 'warn' | 'error' }

// The view carries violations; the screen lists them (errors first, same rule + text once) and never blocks the move.
export function violationList(vs: Violation[]): Violation[] {
  const seen = new Set<string>();
  const out = vs.filter((v) => {
    const k = `${v.rule}|${v.text}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const rank = (v: Violation) => (v.severity === 'error' ? 0 : 1);
  return out.map((v, i) => ({ v, i })).sort((a, b) => rank(a.v) - rank(b.v) || a.i - b.i).map((x) => x.v);
}

export interface CatalogueRule<C> { name: string; fails: (card: C) => string | null }

// Every card against every rule; returns "<id>: <rule>: <why>" lines, empty when the catalogue is consistent.
export function catalogueCheck<C>(cards: C[], id: (c: C) => string, rules: CatalogueRule<C>[]): string[] {
  const out: string[] = [];
  for (const c of cards) for (const r of rules) { const why = r.fails(c); if (why) out.push(`${id(c)}: ${r.name}: ${why}`); }
  return out;
}

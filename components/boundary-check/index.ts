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

// K238 (GAPS-3 UI A8): the release ladder (1.0 no animation or sound; 1.1 VFX; 1.2 SFX and music; 1.3 voice). The kit components a game at that release must not import.
const RELEASE_LATER: Record<string, string[]> = {
  '1.0': ['motion-frame', 'effect-library', 'pieces-3d-verbs', 'sound-player', 'voice'],
  '1.1': ['sound-player', 'voice'],
  '1.2': ['voice'],
  '1.3': [],
};
export const releaseForbidden = (release: string): string[] => {
  const f = RELEASE_LATER[release];
  if (!f) throw new Error(`unknown release ${release}; use one of ${Object.keys(RELEASE_LATER).join(', ')}`);
  return f;
};

// The game's `release` field in, its source files (path -> text) in: "<file>: imports kit/<component> (not before release X)" lines, empty when clean.
export function releaseCheck(release: string, files: Record<string, string>): string[] {
  const out: string[] = [];
  const first = (c: string) => Object.keys(RELEASE_LATER).find((r) => !RELEASE_LATER[r]!.includes(c)) ?? '1.3';
  for (const c of releaseForbidden(release)) {
    const re = new RegExp(String.raw`(?:from|import)\s*\(?\s*['"][^'"]*\bkit/${c}(?:/[^'"]*)?['"]`);
    for (const [f, text] of Object.entries(files)) if (re.test(text)) out.push(`${f}: imports kit/${c} (not before release ${first(c)})`);
  }
  return out;
}

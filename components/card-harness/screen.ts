// cards:screen (K489): what the player reads against what the pack prints. Pure; the game gathers the input.
import { plainWords } from '../plain-text/index.ts';

export interface ScreenInput {
  /** Printed text per face (its id, the pack's text). */
  faces: readonly { id: string; text: string }[];
  /** The zoom's text function: the words the zoomed card shows for a printed text, icons as their `{code}` token. */
  zoom: (text: string) => string;
  /** Icon code to its label (blank or missing = no label). */
  icons: Readonly<Record<string, string | undefined>>;
  /** Printed text per clause id. */
  clauses: readonly { id: string; text: string; /** Which numbers of the text are amounts (K532): a list (empty = none), or 'counted' = worked out at run time (the prompt must show some number). Unset: every number counts. */ amounts?: readonly string[] | 'counted' }[];
  /** Prompts a card test scanned: their clause and the words shown (`Delivery.screens`). */
  prompts: readonly { clause: string; shown: string; /** Option labels on screen (optional, K496). */ screenOptions?: readonly string[]; /** The engine prompt's options (optional, K496); compared with `screenOptions` one for one. */ engineOptions?: readonly unknown[] }[];
  /** Turns an engine option into its label; default `String`. */
  label?: (engineOption: unknown) => string;
  /** Clauses whose resolution opened a prompt in a card test (`Delivery.opened`). */
  opened: Iterable<string>;
  /** `[open, close]` of an icon token in printed text; default `['{', '}']`. */
  syntax?: readonly [string, string];
  /** Strip run before words are compared (plain-text's `ids.strip`). */
  strip?: (t: string) => string;
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const numbers = (t: string): string[] => t.match(/\d+/g) ?? [];

export function screenProblems(i: ScreenInput): string[] {
  const out: string[] = [];
  const [o, c] = i.syntax ?? ['{', '}'];
  for (const f of i.faces) {
    const a = plainWords(f.text, i.strip), b = plainWords(i.zoom(f.text), i.strip);
    const n = Math.max(a.length, b.length);
    for (let k = 0; k < n; k++) if (a[k] !== b[k]) { out.push(`zoom ${f.id}: differs at word ${String(k + 1)}`); break; }
  }
  const used = new Set<string>();
  for (const t of [...i.faces.map((f) => f.text), ...i.clauses.map((x) => x.text)])
    for (const m of t.matchAll(new RegExp(`${esc(o)}([^${esc(c)}]+)${esc(c)}`, 'g'))) used.add(m[1] ?? '');
  for (const code of [...new Set([...Object.keys(i.icons), ...used])].sort())
    if ((i.icons[code] ?? '').trim() === '') out.push(`icon ${code} has no label`);
  const text = new Map(i.clauses.map((x) => [x.id, x.text]));
  const am = new Map(i.clauses.map((x) => [x.id, x.amounts]));
  for (const x of i.clauses) if (Array.isArray(x.amounts)) for (const a of x.amounts) if (!numbers(x.text).includes(a)) out.push(`${x.id}: amount ${a} is not in its text`);
  for (const p of i.prompts) {
    const a = am.get(p.clause);
    const got = new Set(numbers(p.shown));
    if (a === 'counted') { if (got.size === 0) out.push(`prompt for ${p.clause}: no amount`); continue; }
    const want = a ?? numbers(text.get(p.clause) ?? '');
    if (want.length > 0 && !want.some((w) => got.has(w))) out.push(`prompt for ${p.clause}: no amount`);
  }
  for (const p of i.prompts) {
    if (!p.screenOptions || !p.engineOptions) continue;
    const n = (t: string): string => plainWords(t, i.strip).join(' ');
    const eng = p.engineOptions.map((e) => n((i.label ?? String)(e))), scr = p.screenOptions.map(n);
    const left = [...eng];
    for (const [k, x] of scr.entries()) { const j = left.indexOf(x); if (j < 0) out.push(`prompt for ${p.clause}: option "${p.screenOptions[k]!}" on screen, not in the engine`); else left.splice(j, 1); }
    for (const x of left) out.push(`prompt for ${p.clause}: engine option "${p.engineOptions.map((e) => (i.label ?? String)(e)).find((e) => n(e) === x)!}" not on screen`);
  }
  const scanned = new Set(i.prompts.map((p) => p.clause));
  for (const k of [...new Set(i.opened)].sort()) if (!scanned.has(k)) out.push(`${k} opens a prompt no test scanned`);
  return out;
}

/** The `cards:screen` script body: prints each problem, returns the exit code. */
export function screenMain(input: ScreenInput, log: (l: string) => void): number {
  const p = screenProblems(input);
  for (const l of p) log(l);
  if (p.length === 0) log('cards:screen ok');
  return p.length === 0 ? 0 : 1;
}

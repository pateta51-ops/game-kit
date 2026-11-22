// cards:screen (K489): what the player reads against what the pack prints. Pure; the game gathers the input.
import { plainWords } from '../plain-text/index.ts';
import { knownGate, type KnownFindings } from './known.ts';

export interface ScreenInput {
  /** Printed text per face (its id, the pack's text). */
  faces: readonly { id: string; text: string }[];
  /** The zoom's text function: the words the zoomed card shows for a printed text, icons as their `{code}` token. */
  zoom: (text: string) => string;
  /** Icon code to its label (blank or missing = no label). */
  icons: Readonly<Record<string, string | undefined>>;
  /** Printed text per clause id. */
  clauses: readonly { id: string; text: string; /** Which numbers of the text are amounts (K532): a list (empty = none), or 'counted' = worked out at run time (the prompt must show some number). Unset: every number counts. */ amounts?: readonly string[] | 'counted'; /** Amounts per prompt the clause opens (K587), by its order within the clause (`step`): entry k checks the k-th prompt, each as `amounts`. Replaces `amounts` for this clause. */ promptAmounts?: readonly (readonly string[] | 'counted')[] }[];
  /** Prompts a card test scanned: their clause and the words shown (`Delivery.screens`). */
  prompts: readonly { clause: string; shown: string; /** Option labels on screen (optional, K496). */ screenOptions?: readonly string[]; /** The engine prompt's options (optional, K496); compared with `screenOptions` one for one. */ engineOptions?: readonly unknown[]; /** 0-based order of this prompt within its clause's resolution (K587; `Delivery.screens` sets it from the second prompt on). Unset: 0, the first. */ step?: number; /** The value the run computed for a counted amount of this prompt (K649); it must be shown. */ value?: number | string }[];
  /** Turns an engine option into its label; default `String`. */
  label?: (engineOption: unknown) => string;
  /** Clauses whose resolution opened a prompt in a card test (`Delivery.opened`). */
  opened: Iterable<string>;
  /** `[open, close]` of an icon token in printed text; default `['{', '}']`. */
  syntax?: readonly [string, string];
  /** Icon codes whose digits are the amount (K649): a list of codes or a pattern a code matches. Other icon codes' digits are no number shown. */
  iconAmounts?: readonly string[] | RegExp;
  /** For a counted prompt (K649): numbers (`'2'`) never taken as stray, or patterns (`/Unit \d+/`) whose matches in the shown words are left out of the counted check. */
  allowNumbers?: readonly (string | RegExp)[];
  /** Strip run before words are compared (plain-text's `ids.strip`). */
  strip?: (t: string) => string;
  /** K650: a known-findings list for `screenMain`; unset: unchanged. */
  known?: KnownFindings;
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
  const first = [...i.clauses].reverse();
  const text = new Map(first.map((x) => [x.id, x.text]));
  const am = new Map(first.map((x) => [x.id, x.amounts]));
  const seen = new Map<string, string>();
  for (const x of i.clauses) { const j = JSON.stringify([x.text, x.amounts, x.promptAmounts]), s = seen.get(x.id); if (s === undefined) seen.set(x.id, j); else if (s !== j) out.push(`${x.id}: listed twice with different text or amounts`); }
  const token = new RegExp(`${esc(o)}[^${esc(c)}]+${esc(c)}`, 'g');
  for (const x of i.clauses) if (x.amounts && x.amounts !== 'counted') for (const a of x.amounts) if (!numbers(x.text).includes(a)) out.push(`${x.id}: amount ${a} is not in its text`);
  const per = new Map(first.filter((x) => x.promptAmounts).map((x) => [x.id, x.promptAmounts!]));
  for (const x of i.clauses) {
    if (x.promptAmounts && x.amounts) out.push(`${x.id}: amounts and promptAmounts both set`);
    for (const [k, e] of (x.promptAmounts ?? []).entries()) if (e !== 'counted') for (const a of e) if (!numbers(x.text).includes(a)) out.push(`${x.id}: prompt ${String(k + 1)} amount ${a} is not in its text`);
  }
  const steps = new Map<string, Set<number>>();
  const ia = i.iconAmounts, iaRe = ia instanceof RegExp ? new RegExp(ia.source, ia.flags.replace(/[gy]/g, '')) : undefined;
  const allowRe = (i.allowNumbers ?? []).flatMap((x) => (x instanceof RegExp ? [new RegExp(x.source, x.flags.includes('g') ? x.flags : `${x.flags}g`)] : []));
  const noRef = (t: string): string => allowRe.reduce((u, r) => u.replace(r, ' '), t);
  const allowNum = (i.allowNumbers ?? []).filter((x): x is string => typeof x === 'string');
  for (const p of i.prompts) {
    const k = p.step ?? 0;
    const e = per.get(p.clause);
    if (e) { (steps.get(p.clause) ?? steps.set(p.clause, new Set()).get(p.clause)!).add(k); if (k >= e.length) { out.push(`prompt for ${p.clause}: prompt ${String(k + 1)} has no promptAmounts entry`); continue; } }
    const a = e ? e[k] : am.get(p.clause);
    const words = p.shown.replace(token, (m) => { const k = m.slice(o.length, m.length - c.length); return (iaRe ? iaRe.test(k) : (ia as readonly string[] | undefined)?.includes(k)) ? ` ${m} ` : ' '; });
    const got = new Set(numbers(noRef(words)));
    if (a === 'counted') {
      const cw = noRef(words), cnt = new Set(cw.match(/\d+(?!\d|(?:st|nd|rd|th)\b)/gi) ?? []);
      if (cnt.size === 0) { out.push(`prompt for ${p.clause}: no amount`); continue; }
      const v = p.value === undefined ? undefined : String(p.value), printed = numbers(text.get(p.clause) ?? '');
      if (v !== undefined && !/^-?\d+$/.test(v)) { out.push(`prompt for ${p.clause}: value ${v} is not a whole number`); continue; }
      const abs = v?.replace('-', '');
      if (v !== undefined && !(v.startsWith('-') ? new RegExp(`(?<!\\d)[-\\u2212]${abs!}(?!\\d)`).test(cw) : cnt.has(abs!))) out.push(`prompt for ${p.clause}: amount ${v} not shown`);
      const stray = [...cnt].filter((n) => n !== abs && !printed.includes(n) && !allowNum.includes(n));
      if (v !== undefined) for (const n of stray) out.push(`prompt for ${p.clause}: stray number ${n}`);
      else if (stray.length > 1) out.push(`prompt for ${p.clause}: numbers ${stray.join(', ')} shown, pass value to tell the amount`);
      continue;
    }
    const want = a ?? numbers(noRef(text.get(p.clause) ?? ''));
    if (want.length > 0 && !want.some((w) => got.has(w))) out.push(`prompt for ${p.clause}: no amount`);
  }
  if (i.prompts.length > 0) for (const [id, e] of per) for (let k = 0; k < e.length; k++) if (!steps.get(id)?.has(k)) out.push(`${id}: promptAmounts entry ${String(k + 1)} but no prompt ${String(k + 1)} opened`);
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
  if (input.known) return knownGate('cards:screen', p, input.known, log);
  for (const l of p) log(l);
  if (p.length === 0) log('cards:screen ok');
  return p.length === 0 ? 0 : 1;
}

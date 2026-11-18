// Judges a face's diff (face-tools/align.py output) against a policy: what fails the face and what only warns. Ported from a
// card game's evaluate.ts (TOLERANCE, MIN_NCC tables, word check in hundredths, line-break check, findings); the game passes
// its own element patterns and numbers in the policy.
export const TOLERANCE = 6;
export const RADIUS = 12;

export interface DiffElement { dx: number; dy: number; ncc: number; box: number[]; radius?: number; edge?: boolean; words?: number[][] }
export interface DiffResult {
  radius: number;
  scaled?: boolean;
  elements: Record<string, DiffElement>;
  unmatched: string[];
  /** Each text line's [drawn start, drawn end, printed start, printed end] px; the printed ones null where the reference has none. */
  lineSpans?: Record<string, (number | null)[]>;
}
/** Pattern tables: the first row whose regular expression matches the element name wins. */
export type Table<T> = readonly (readonly [string, T])[];
export interface FacePolicy {
  /** Largest offset (px) that is not reported; default TOLERANCE. */
  tolerance?: number;
  /** Least NCC per element name; minNccSmall for a reference scaled up (diff.scaled). */
  minNcc?: Table<number>;
  minNccSmall?: Table<number>;
  /** Element names that are text: one that could not be matched fails the face (others warn). */
  textElement?: string;
  /** Word check: words at least wordMinWidth px wide, strip = the name up to the first 'p' (the game's naming; see stripOf). */
  wordMinWidth?: number;
  wordMaxNcc?: number;
  wordHardNcc?: number;
  wordMinDeficit?: number;
  stripOf?: (name: string) => string;
  /** A line breaks where the reference does not when both its end and its length differ by more than this. */
  lineEndMax?: number;
}
export interface Finding { severity: 'fail' | 'warn'; text: string }
export interface JudgeInputs {
  diff: DiffResult;
  policy: FacePolicy;
  /** Names the face must draw, and the names it drew. */
  expected?: readonly string[];
  drawn?: readonly string[];
  layoutWarnings?: readonly string[];
  /** Layout warnings matching this pattern fail (text past its box); the others warn. */
  textOut?: string;
  dataIssues?: readonly string[];
  fontError?: string | null;
}

export const patternValue = <T>(table: Table<T> | undefined, name: string, dflt: T): T => table?.find(([p]) => new RegExp(p).test(name))?.[1] ?? dflt;
const hundredths = (v: number) => Math.round(v * 100);
export const median = (xs: readonly number[]): number => {
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 === 1 ? (a[m] ?? 0) : ((a[m - 1] ?? 0) + (a[m] ?? 0)) / 2;
};

/** Words that match the reference clearly worse than their strip's other words, one line each. Compared in hundredths, so a
 *  verdict never hangs on floating-point rounding (0.88 - 0.68 is 0.19999...). */
export function wordFailures(diff: DiffResult, p: FacePolicy): string[] {
  const tol = p.tolerance ?? TOLERANCE, minW = p.wordMinWidth ?? 40, maxNcc = p.wordMaxNcc ?? 0.66, hard = p.wordHardNcc ?? 0.62, minDef = p.wordMinDeficit ?? 0.2;
  const stripOf = p.stripOf ?? ((n: string) => n.split('p')[0] ?? '');
  const words = Object.entries(diff.elements).flatMap(([name, e]) => (e.words ?? []).filter((w) => (w[5] ?? 0) - (w[3] ?? 0) >= minW).map((w) => ({ name, strip: stripOf(name), w })));
  const out: string[] = [];
  for (const { name, strip, w } of words) {
    const [dx = 0, dy = 0, ncc = 1, x0 = 0, , x1 = 0] = w;
    const ref = median(words.filter((o) => o.strip === strip).map((o) => o.w[2] ?? 1));
    const off = Math.max(Math.abs(dx), Math.abs(dy));
    if (hundredths(ref) - hundredths(ncc) >= hundredths(minDef) && (hundredths(ncc) < hundredths(hard) || (hundredths(ncc) < hundredths(maxNcc) && off > tol)))
      out.push(`${name}: the word at x ${String(Math.round(x0))}-${String(Math.round(x1))} does not match the reference (ncc ${ncc.toFixed(2)}, ${(ref - ncc).toFixed(2)} under its strip's words; off by (${String(dx)}, ${String(dy)}) px)`);
  }
  return out;
}

/** Lines that break elsewhere than the reference's: both end and length differ by more than lineEndMax px. */
export function lineBreakFailures(diff: DiffResult, lineEndMax = 64): string[] {
  const out: string[] = [];
  for (const [name, [ds, de, ps, pe]] of Object.entries(diff.lineSpans ?? {})) {
    if (ds == null || de == null) continue;
    if (ps == null || pe == null) { out.push(`${name}: the reference has no line here (an extra line?)`); continue; }
    const byEnd = pe - de, byLength = pe - ps - (de - ds);
    if (Math.min(Math.abs(byEnd), Math.abs(byLength)) > lineEndMax) out.push(`${name}: ${String(de - ds)} px long, ending at x ${String(de)}; the reference's line ${String(pe - ps)} px, ending at x ${String(pe)}`);
  }
  return out;
}

export function faceFindings(i: JudgeInputs): Finding[] {
  const { diff, policy: p } = i, out: Finding[] = [];
  const fail = (text: string) => out.push({ severity: 'fail', text });
  const warn = (text: string) => out.push({ severity: 'warn', text });
  const tol = p.tolerance ?? TOLERANCE, textRe = new RegExp(p.textElement ?? '$^'), outRe = new RegExp(i.textOut ?? '$^');
  if (i.fontError) fail(`fonts: ${i.fontError}`);
  for (const d of i.dataIssues ?? []) fail(`data: ${d}`);
  for (const w of i.layoutWarnings ?? []) (outRe.test(w) ? fail : warn)(`layout: ${w}`);
  const drawn = new Set(i.drawn ?? []);
  for (const n of i.expected ?? []) if (!drawn.has(n)) fail(`${n}: not drawn`);
  for (const n of diff.unmatched) (textRe.test(n) ? fail : warn)(`${n}: could not be matched (box outside the picture or too small)`);
  for (const [name, e] of Object.entries(diff.elements)) {
    const off = Math.max(Math.abs(e.dx), Math.abs(e.dy)), radius = e.radius ?? diff.radius, need = patternValue(diff.scaled ? p.minNccSmall : p.minNcc, name, 0.5);
    if (e.edge === true || off >= radius) warn(`${name}: at the search edge (${String(e.dx)}, ${String(e.dy)}): moved ${String(radius)} px or more`);
    else if (off > tol) warn(`${name}: off by (${String(e.dx)}, ${String(e.dy)}) px`);
    if (e.ncc < need) warn(`${name}: matches the reference too weakly (ncc ${e.ncc.toFixed(2)} < ${need.toFixed(2)})`);
  }
  for (const f of wordFailures(diff, p)) warn(f);
  for (const f of lineBreakFailures(diff, p.lineEndMax)) fail(f);
  return out;
}

/** The verdict: the reasons it fails (empty when it passes) and its warnings. */
export function judgeFace(i: JudgeInputs): { failures: string[]; warnings: string[] } {
  const all = faceFindings(i);
  return { failures: all.filter((f) => f.severity === 'fail').map((f) => f.text), warnings: all.filter((f) => f.severity === 'warn').map((f) => f.text) };
}

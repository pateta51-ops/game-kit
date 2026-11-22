// Card-language checks. `describeCheck`: per card, the encoding passes the game's validator and its generated reading
// equals the printed text word for word, with the bracketed tokens compared both ways. `Same` with `conforms`: a
// compile-time check that a schema's inferred type and the engine's type are the same. `report`: findings to an exit code.
import { knownCheck, type KnownFindings } from './known.ts';

export interface DescribedCard<E> {
  readonly id: string;
  readonly printed: string;
  readonly encoding: E;
}

const TOKENS = (t: string): Set<string> => new Set([...t.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1] ?? ''));

/** K669, all opt-in: `raw` reports raw words in a generated reading (`allow` = the words it may hold); `accepted` maps a finding line to its reason (a stale or reasonless entry fails); `tokensOnly` compares only icon codes and numbers. */
export interface DescribeOptions {
  readonly raw?: { readonly allow?: readonly string[] };
  readonly accepted?: Readonly<Record<string, string>>;
  readonly tokensOnly?: boolean;
}
const codeTokens = (t: string): Set<string> => new Set([
  ...[...t.matchAll(/[{[]([^}\]]+)[}\]]/g)].map((m) => m[1] ?? ''),
  ...[...t.replace(/[{[][^}\]]*[}\]]/g, ' ').matchAll(/\d+/g)].map((m) => m[0]),
]);
const RAW = [/\b[a-z]+[A-Z]\w*/g, /\b[a-z]{2,}(?:_[a-z0-9]+)+\b/g, /\b[a-z]{2,}(?:\.[a-z]{2,})+\b/g, /\b[A-Z]{2,5}-\d+\b/g, /\S+#\S+/g];
function rawProblems(id: string, text: string, allow: readonly string[]): string[] {
  const out: string[] = [];
  if (/\{\s*\}|\[\s*\]|\(\s*\)/.test(text)) out.push(`${id}: generated reading holds an empty bracket`);
  const bare = text.replace(/[{[][^}\]]*[}\]]/g, ' ');
  for (const re of RAW) for (const m of bare.matchAll(re)) if (!allow.includes(m[0])) out.push(`${id}: generated reading holds raw "${m[0]}"`);
  for (const m of bare.matchAll(/\b9{2,}\b/g)) if (!allow.includes(m[0])) out.push(`${id}: generated reading holds stand-in number ${m[0]}`);
  return out;
}

export function describeCheck<E>(
  cards: readonly DescribedCard<E>[],
  describe: (e: E) => string,
  validate: (e: E) => readonly string[] = () => [],
  tokens: (text: string) => Set<string> = TOKENS,
  known?: KnownFindings,
  opts: DescribeOptions = {},
): string[] {
  if (known?.write) throw new Error('describeCheck: write the known lines with writeKnown, never inside the check');
  const errors: string[] = [];
  for (const c of cards) {
    const bad = validate(c.encoding);
    if (bad.length > 0) {
      errors.push(...bad.map((e) => `${c.id}: ${e}`));
      continue;
    }
    const text = describe(c.encoding);
    if (opts.raw) errors.push(...rawProblems(c.id, text, opts.raw.allow ?? []));
    if (opts.tokensOnly) {
      const p = codeTokens(c.printed), g = codeTokens(text);
      for (const t of p) if (!g.has(t)) errors.push(`${c.id}: printed [${t}] is not in the generated reading`);
      for (const t of g) if (!p.has(t)) errors.push(`${c.id}: generated [${t}] is not on the printed card`);
      continue;
    }
    if (text !== c.printed) errors.push(`${c.id}: the generated reading differs from the printed text:\n  printed:   ${c.printed}\n  generated: ${text}`);
    const p = tokens(c.printed);
    const g = tokens(text);
    for (const t of p) if (!g.has(t)) errors.push(`${c.id}: printed [${t}] is not in the generated reading`);
    for (const t of g) if (!p.has(t)) errors.push(`${c.id}: generated [${t}] is not on the printed card`);
  }
  if (opts.accepted) {
    const acc = opts.accepted, seen = new Set(errors);
    const stale = Object.keys(acc).filter((l) => !seen.has(l)).map((l) => `stale accepted line: ${l}`);
    const noWhy = Object.keys(acc).filter((l) => acc[l]?.trim() === '').map((l) => `accepted line has no reason: ${l}`);
    errors.splice(0, errors.length, ...errors.filter((e) => acc[e] === undefined), ...stale, ...noWhy);
  }
  return known ? knownCheck(errors, known).problems : errors;
}

export type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** Deep readonly: a schema's mutable inferred type compared with a game's readonly type. */
export type DR<T> = T extends readonly (infer U)[] ? readonly DR<U>[] : T extends object ? { readonly [K in keyof T]: DR<T[K]> } : T;
/** `Is<z.infer<typeof Schema>, T>`: the schema type, made deep readonly, equals T. */
export type Is<S, T> = Same<DR<S>, T>;
/** `conforms<Same<z.infer<typeof Schema>, EngineType>>()` compiles only when they match. */
export const conforms = <T extends true>(): T | undefined => undefined;

/** Log each finding under `name` and a summary; 0 when clean, 1 otherwise. */
export function report(name: string, errors: readonly string[], log: (line: string) => void, count?: number): number {
  for (const e of errors) log(`${name}: ${e}`);
  log(`${name}: ${errors.length === 0 ? 'OK' : `${String(errors.length)} error(s)`}${count === undefined ? '' : `; ${String(count)} checked`}`);
  return errors.length === 0 ? 0 : 1;
}

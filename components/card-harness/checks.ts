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

export function describeCheck<E>(
  cards: readonly DescribedCard<E>[],
  describe: (e: E) => string,
  validate: (e: E) => readonly string[] = () => [],
  tokens: (text: string) => Set<string> = TOKENS,
  known?: KnownFindings,
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
    if (text !== c.printed) errors.push(`${c.id}: the generated reading differs from the printed text:\n  printed:   ${c.printed}\n  generated: ${text}`);
    const p = tokens(c.printed);
    const g = tokens(text);
    for (const t of p) if (!g.has(t)) errors.push(`${c.id}: printed [${t}] is not in the generated reading`);
    for (const t of g) if (!p.has(t)) errors.push(`${c.id}: generated [${t}] is not on the printed card`);
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

// K114: every card put in a minimal state survives a JSON round trip (no non-plain values), and the rules give the same result from the copy.
import { advance, type Draft, type GameTypes } from '../engine-core/index.ts';
import { Scenario, type ScenarioGame } from './scenario.ts';

/** Paths where `a` and `b` differ (an undefined field counts as missing; a Map, Set, Date or function differs from its JSON copy). */
export function diffPaths(a: unknown, b: unknown, path = '$'): string[] {
  if (a === b) return [];
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b) || Object.getPrototypeOf(a) !== Object.getPrototypeOf(b))
    return [path];
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].flatMap((k) => (k in x === k in y ? diffPaths(x[k], y[k], `${path}.${k}`) : [`${path}.${k}`]));
}

/** One entry per card: where it goes and, to also compare play, the task that plays it. Returns problems, empty when all pass. */
export function roundTripCards<G extends GameTypes, W, D = never>(
  game: ScenarioGame<G, W, D>,
  entries: readonly { readonly card: string; readonly where: W; readonly task?: (id: string) => G['task'] }[],
): string[] {
  return entries.flatMap(({ card, where, task }) => {
    const sc = new Scenario(game);
    const [id] = sc.put(where, card);
    const copy = JSON.parse(JSON.stringify(sc.s)) as G['state'];
    const bad = diffPaths(sc.s, copy);
    if (bad.length > 0) return [`${card}: state is not plain JSON at ${bad.join(', ')}`];
    if (task === undefined) return [];
    const t = task(id as string);
    const go = (s: G['state']) => {
      const d = structuredClone(s) as Draft<G['state']>;
      (d.stack as unknown[]).push(structuredClone(t));
      return advance(game.rules, d, game.content);
    };
    const d = diffPaths(go(sc.s), go(copy));
    return d.length > 0 ? [`${card}: result from the copy differs at ${d.join(', ')}`] : [];
  });
}

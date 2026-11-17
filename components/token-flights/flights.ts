// Port of unstoppable-fan-prototype src/ui/board/flights.ts (D-089), generalised: places are the game's string keys.
// Which tokens fly where when what a view draws changes: diffed place by place and value by value, so every flight is a
// token that really moved. A place that left the view (a defeated threat) takes its tokens back unseen. Pure, no React.

/** The tokens each place holds, by the game's own place key (`credits`, `threat:a`), values in any order. */
export type Placement = Readonly<Record<string, readonly number[]>>;

/** Says which supply a place draws its tokens from and gives them back to (undefined: the place does not fly). */
export type SupplyOf = (place: string) => string | undefined;

export interface Move {
  /** The supply the token comes from or goes back to: what kind of token it is. */
  kind: string;
  /** The token's value (a disc is 1). */
  value: number;
  from: string;
  to: string;
}

/** The most tokens of one value that fly for one place (a larger change flies its first ones; the number is exact anyway). */
export const MAX_PER_CHANGE = 5;

function countsOf(tokens: readonly number[] | undefined): Map<number, number> {
  const counts = new Map<number, number>();
  for (const value of tokens ?? []) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

/** The flights from the tokens drawn before to the ones drawn now: per place of `after` in its key order, gone before come, largest first. */
export function movesBetween(before: Placement, after: Placement, supplyOf: SupplyOf, max = MAX_PER_CHANGE): Move[] {
  const moves: Move[] = [];
  for (const place of Object.keys(after)) {
    const supply = supplyOf(place);
    if (supply === undefined) continue;
    const was = countsOf(before[place]);
    const now = countsOf(after[place]);
    const values = [...new Set([...was.keys(), ...now.keys()])].sort((a, b) => b - a);
    const gone: Move[] = [];
    const come: Move[] = [];
    for (const value of values) {
      const d = (now.get(value) ?? 0) - (was.get(value) ?? 0);
      for (let i = 0; i < Math.min(Math.abs(d), max); i += 1)
        (d > 0 ? come : gone).push({ kind: supply, value, from: d > 0 ? supply : place, to: d > 0 ? place : supply });
    }
    moves.push(...gone, ...come);
  }
  return moves;
}

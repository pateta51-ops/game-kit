// A finite supply of physical pieces counted from the engine's plain integers.
// The engine keeps numbers; the table draws the box's real tokens: each
// place takes the change of its number (largest values first, as far as the supply has them, at most its cap), and the
// supply holds what is left. What a place cannot draw is `short` (a badge); the number itself is always written beside it.

/** How many tokens of each value: a supply, or what is left of one. */
export type TokenCounts = Readonly<Record<number, number>>;

/** The tokens of one place, largest first, and the part of its number they leave out. */
export interface Change {
  tokens: number[];
  short: number;
}

export const countOf = (c: TokenCounts): number => Object.values(c).reduce((s, n) => s + n, 0);
export const valueOf = (c: TokenCounts): number => Object.entries(c).reduce((s, [v, n]) => s + Number(v) * n, 0);

/** The tokens that make up `amount` out of `available` (largest first, at most `cap`), and what is left of the supply. */
export function makeChange(amount: number, available: TokenCounts, cap = Infinity): { change: Change; left: Record<number, number> } {
  const left: Record<number, number> = { ...available };
  const tokens: number[] = [];
  let rest = Math.max(0, Math.floor(amount));
  const values = Object.keys(left)
    .map(Number)
    .filter((v) => v > 0)
    .sort((a, b) => b - a);
  for (const v of values) {
    const take = Math.max(0, Math.min(Math.floor(rest / v), left[v] ?? 0, cap - tokens.length));
    for (let i = 0; i < take; i++) tokens.push(v);
    left[v] = (left[v] ?? 0) - take;
    rest -= take * v;
  }
  return { change: { tokens, short: rest }, left };
}

/**
 * Every place's tokens out of one supply per kind, in the order given (each out of what the ones before it left), and the
 * supplies' remainder. `box`: the game's component counts by kind and value.
 */
export function placeTokens(
  places: readonly { id: string; kind: string; amount: number; cap?: number }[],
  box: Readonly<Record<string, TokenCounts>>,
): { places: Record<string, Change>; supply: Record<string, Record<number, number>> } {
  const supply: Record<string, Record<number, number>> = Object.fromEntries(Object.entries(box).map(([k, c]) => [k, { ...c }]));
  const out: Record<string, Change> = {};
  for (const p of places) {
    const made = makeChange(p.amount, supply[p.kind] ?? {}, p.cap);
    out[p.id] = made.change;
    supply[p.kind] = made.left;
  }
  return { places: out, supply };
}

/** `total` as tokens of the given values without a supply limit (largest first, at most `cap`), and what the row hides. */
export function tokenSplit(total: number, values: readonly number[], cap: number): { tokens: number[]; hidden: number } {
  const { change } = makeChange(total, Object.fromEntries(values.filter((v) => v > 0).map((v) => [v, Infinity])), Math.max(0, cap));
  const t = Math.max(0, Math.floor(total));
  return { tokens: change.tokens, hidden: t - change.tokens.reduce((s, v) => s + v, 0) };
}

/**
 * The supply as a heap that keeps its shape: every token of the box has a fixed place, the values spread evenly through
 * it, and a token taken leaves its place empty (the last place of its value first). Each entry: a remaining token's value
 * and its place in the full heap.
 */
export function heapOf(box: TokenCounts, left: TokenCounts): { value: number; place: number }[] {
  const values = Object.keys(box)
    .map(Number)
    .filter((v) => v > 0)
    .sort((a, b) => b - a);
  const total = countOf(box);
  const placed: Record<number, number> = {};
  const order: number[] = [];
  for (let i = 0; i < total; i++) {
    let best: number | undefined;
    let lag = -Infinity;
    for (const v of values) {
      const want = box[v] ?? 0;
      const have = placed[v] ?? 0;
      if (have >= want) continue;
      const behind = ((i + 1) * want) / total - have;
      if (behind > lag) [lag, best] = [behind, v];
    }
    if (best === undefined) break;
    order.push(best);
    placed[best] = (placed[best] ?? 0) + 1;
  }
  const kept: Record<number, number> = {};
  return order.flatMap((value, place) => ((kept[value] = (kept[value] ?? 0) + 1) <= (left[value] ?? 0) ? [{ value, place }] : []));
}

/** Where place `i` of a heap lies, in mm from its middle, and its turn in degrees: a flattened sunflower spiral. */
export function heapSpot(i: number, spacingMm = 8): { x: number; y: number; turn: number } {
  const r = spacingMm * Math.sqrt(i + 0.5);
  const a = i * 2.39996;
  return { x: Math.round(r * Math.cos(a) * 1.15 * 10) / 10, y: Math.round(r * Math.sin(a) * 0.8 * 10) / 10, turn: ((i * 47) % 90) - 45 };
}

/** How much of each disc under the top one shows below it, in mm. */
export const DISC_RIM_MM = 1.4;

/** `count` discs stacked in one recess: each disc's offset down from the middle in mm, the bottom disc first. */
export function discStack(count: number, rimMm = DISC_RIM_MM): { dy: number }[] {
  const n = Math.max(0, Math.floor(count));
  return Array.from({ length: n }, (_, i) => ({ dy: (n - 1 - i) * rimMm }));
}

/** Pieces of a finite pool: those held (`have`, clamped to the pool) and those set aside as stacks of at most `perStack`. */
export function heldAndAside(have: number, total: number, perStack = 3): { held: number; aside: number[] } {
  const held = Math.max(0, Math.min(total, Math.floor(have)));
  const aside: number[] = [];
  for (let left = total - held; left > 0; left -= perStack) aside.push(Math.min(perStack, left));
  return { held, aside };
}

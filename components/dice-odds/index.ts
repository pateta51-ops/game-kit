export interface Outcome { dice: number[]; extra?: number; p: number }
export interface DiceSpec { sides?: number; extraSides?: number }

// Module-level cache: one per thread (each worker loads its own copy).
const cache = new Map<string, Outcome[]>();

/** Every multiset of k dice (faces 1..sides, ascending), times each face of one optional extra die; p sums to 1. */
export function outcomes(k: number, spec: DiceSpec = {}): Outcome[] {
  const sides = spec.sides ?? 6;
  const es = spec.extraSides ?? 0;
  const key = `${k}/${sides}/${es}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const fact = [1];
  for (let i = 1; i <= k; i++) fact.push((fact[i - 1] ?? 1) * i);
  const total = sides ** k;
  const sets: Outcome[] = [];
  const rec = (face: number, left: number, cur: number[], denom: number): void => {
    if (face > sides) {
      if (left === 0) sets.push({ dice: cur.slice(), p: (fact[k] ?? 1) / denom / total });
      return;
    }
    for (let c = 0; c <= left; c++) {
      for (let i = 0; i < c; i++) cur.push(face);
      rec(face + 1, left - c, cur, denom * (fact[c] ?? 1));
      cur.length -= c;
    }
  };
  rec(1, k, [], 1);
  const out: Outcome[] = [];
  if (es > 0) for (const s of sets) for (let e = 1; e <= es; e++) out.push({ dice: s.dice, extra: e, p: s.p / es });
  else out.push(...sets);
  cache.set(key, out);
  return out;
}

/** Exact probability that test(dice, extra) holds for k dice (plus the optional extra die). */
export function chance(k: number, test: (dice: number[], extra?: number) => boolean, spec: DiceSpec = {}): number {
  let p = 0;
  for (const o of outcomes(k, spec)) if (test(o.dice, o.extra)) p += o.p;
  return p;
}

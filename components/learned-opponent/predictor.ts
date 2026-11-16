// Opponent-choice predictor (K125, rftg study), for games with simultaneous hidden picks; nothing uses it unless the game does.
// The predictor is a `Net` whose outputs are the choices; it is trained on the AI's own search scores ("opponents choose like me").

/** The training target for the predictor: softmax(sharpness * (score - best) / max(|best|, 0.001)), the rftg form made order-safe for negative scores over the search scores of the seat's own options. */
export function predictorTarget(scores: readonly number[], sharpness = 20): number[] {
  const best = Math.max(...scores);
  const e = scores.map((s) => Math.exp((sharpness * (s - best)) / Math.max(Math.abs(best), 0.001)));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / sum);
}

/** Every combination of the opponents' picks with probability at least `cutoff`, most likely first. `probs[o][c]`: opponent o picks choice c. */
export function combos(probs: readonly (readonly number[])[], cutoff = 0): { picks: number[]; p: number }[] {
  const out: { picks: number[]; p: number }[] = [];
  const walk = (o: number, picks: number[], p: number): void => {
    if (p <= 0 || p < cutoff) return;
    if (o === probs.length) {
      out.push({ picks, p });
      return;
    }
    (probs[o] as readonly number[]).forEach((q, c) => walk(o + 1, [...picks, c], p * q));
  };
  walk(0, [], 1);
  return out.sort((a, b) => b.p - a.p);
}

/** The expected value of each of our choices over the opponents' combinations: sum of p(combo) * value(ours, combo). */
export function expected(ours: number, list: readonly { picks: number[]; p: number }[], value: (ours: number, picks: readonly number[]) => number): number[] {
  return Array.from({ length: ours }, (_, i) => list.reduce((s, c) => s + c.p * value(i, c.picks), 0));
}

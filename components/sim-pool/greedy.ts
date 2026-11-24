import type { Bot } from './bot.ts';
import type { DriverRng } from './rng.ts';

/** A public-information projection. Never pass actual hidden cards, engine RNG or a different seat's choices. */
export type GreedyProbe<V, A> =
  | { readonly kind: 'complete'; readonly score: number }
  | { readonly kind: 'choice'; readonly score: number; readonly view: V; readonly answers: readonly A[] }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'rejected' };

export interface GreedyOptions<V, A> {
  readonly name?: string;
  /** A pure preview adapter over the same public view the bot receives. Scores use the same scale throughout. */
  readonly probe: (view: V, answer: A) => GreedyProbe<V, A>;
  /** Game-owned public heuristic when a legal answer cannot be previewed or the probe budget is exhausted. */
  readonly fallback: (view: V, answer: A) => number;
  readonly maxProbes?: number;
  readonly ties?: 'first' | 'random';
}

interface Rated<A> { readonly answer: A; readonly score: number; readonly source: string }
const finite = (value: number): number => {
  if (!Number.isFinite(value)) throw new Error('greedy score must be finite');
  return value;
};

/** At most one nested choice by the same seat. Never promotes a rejected action or searches unknown information. */
export function greedyBot<V, A>(options: GreedyOptions<V, A>): Bot<V, A> {
  const max = options.maxProbes ?? 256;
  if (!Number.isSafeInteger(max) || max < 1) throw new Error('invalid greedy probe budget');
  let last: string[] = [];
  return {
    name: options.name ?? 'greedy',
    choose(view: V, answers: readonly A[], rng: DriverRng): A {
      last = [];
      if (!answers.length) throw new Error('greedy bot: no legal answers');
      let probes = 0;
      const probe = (v: V, a: A): GreedyProbe<V, A> | undefined => {
        if (probes >= max) return undefined;
        probes += 1;
        return options.probe(v, a);
      };
      const rated: Rated<A>[] = [];
      // Probe every root first. Never let the first nested option monopolize the root budget.
      const roots = answers.map(answer => ({ answer, result: probe(view, answer) }));
      for (const { answer, result } of roots) {
        if (result?.kind === 'rejected') continue;
        if (result === undefined || result.kind === 'unknown') {
          rated.push({ answer, score: finite(options.fallback(view, answer)), source: result === undefined ? 'budget fallback' : 'unknown fallback' });
          continue;
        }
        const base = finite(result.score);
        if (result.kind === 'complete') { rated.push({ answer, score: base, source: 'preview' }); continue; }
        // Use a complete set of nested alternatives, or only the parent heuristic.
        // Mixing partial maxima with fully explored alternatives biases the result.
        if (result.answers.length === 0 || result.answers.length > max - probes) {
          rated.push({ answer, score: base, source: 'nested unavailable' });
          continue;
        }
        const children = result.answers.map(a => probe(result.view, a));
        if (children.some(child => child === undefined || child.kind === 'unknown')) {
          rated.push({ answer, score: base, source: 'nested unknown' });
          continue;
        }
        const scores = children.flatMap(child => child?.kind === 'complete' || child?.kind === 'choice' ? [finite(child.score)] : []);
        rated.push({ answer, score: scores.length ? Math.max(...scores) : base, source: scores.length ? 'nested preview' : 'nested rejected' });
      }
      if (!rated.length) throw new Error('greedy bot: every legal answer was rejected by preview');
      const bestScore = Math.max(...rated.map(r => r.score));
      const best = rated.filter(r => r.score === bestScore);
      const winner = options.ties === 'random' ? rng.pick(best) : best[0]!;
      last = ['score ' + String(winner.score) + ' (' + winner.source + ')', 'probes ' + String(probes) + '/' + String(max)];
      return winner.answer;
    },
    reasons: () => [...last],
  };
}

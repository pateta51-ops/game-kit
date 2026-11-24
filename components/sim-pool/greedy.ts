import { preview, seatKey, type GameRules, type GameTypes, type KernelPrompt } from '../engine-core/index.ts';
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
  /** Maximum number of root answers to score, including fallback scoring. */
  readonly maxRootAnswers?: number;
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
  const maxRootAnswers = options.maxRootAnswers ?? 1_000_000;
  if (!Number.isSafeInteger(max) || max < 1) throw new Error('invalid greedy probe budget');
  if (!Number.isSafeInteger(maxRootAnswers) || maxRootAnswers < 1) throw new Error('invalid greedy root answer limit');
  let last: string[] = [];
  return {
    name: options.name ?? 'greedy',
    choose(view: V, answers: readonly A[], rng: DriverRng): A {
      last = [];
      if (!answers.length) throw new Error('greedy bot: no legal answers');
      if (answers.length > maxRootAnswers) throw new Error('greedy bot: root answer limit exceeded');
      const best: Rated<A>[] = [];
      let bestScore = -Infinity;
      const rate = (answer: A, score: number, source: string): void => {
        if (score > bestScore) {
          bestScore = score;
          best.length = 0;
          best.push({ answer, score, source });
        } else if (score === bestScore && options.ties === 'random') {
          best.push({ answer, score, source });
        }
      };
      // Probe every root first. Never let the first nested option monopolize the root budget.
      const roots = answers.slice(0, max).map(answer => options.probe(view, answer));
      let probes = roots.length;
      for (const [i, answer] of answers.entries()) {
        const result = roots[i];
        if (result?.kind === 'rejected') continue;
        if (result === undefined || result.kind === 'unknown') {
          rate(answer, finite(options.fallback(view, answer)), result === undefined ? 'budget fallback' : 'unknown fallback');
          continue;
        }
        const base = finite(result.score);
        if (result.kind === 'complete') { rate(answer, base, 'preview'); continue; }
        // Use a complete set of nested alternatives, or only the parent heuristic.
        // Mixing partial maxima with fully explored alternatives biases the result.
        if (result.answers.length === 0 || result.answers.length > max - probes) {
          rate(answer, base, 'nested unavailable');
          continue;
        }
        let score: number | undefined;
        let unknown = false;
        let invalid = false;
        for (const child of result.answers) {
          probes += 1;
          const next = options.probe(result.view, child);
          if (next.kind === 'unknown') unknown = true;
          if (next.kind === 'complete' || next.kind === 'choice') {
            if (Number.isFinite(next.score)) score = Math.max(score ?? -Infinity, next.score);
            else invalid = true;
          }
        }
        if (unknown) {
          rate(answer, base, 'nested unknown');
          continue;
        }
        if (invalid) throw new Error('greedy score must be finite');
        rate(answer, score ?? base, score === undefined ? 'nested rejected' : 'nested preview');
      }
      if (!best.length) throw new Error('greedy bot: every legal answer was rejected by preview');
      const winner = options.ties === 'random' ? rng.pick(best) : best[0]!;
      last = ['score ' + String(winner.score) + ' (' + winner.source + ')', 'probes ' + String(probes) + '/' + String(max)];
      return winner.answer;
    },
    reasons: () => [...last],
  };
}

export interface GreedyPreviewOptions<G extends GameTypes, V> {
  readonly rules: GameRules<G>;
  readonly content: G['content'];
  /** Rebuild a throwaway state from the public view, or return undefined if it cannot be previewed. */
  readonly reconstruct: (view: V) => G['state'] | undefined;
  readonly score: (state: G['state']) => number;
  /** Identify prompts that continue the current action. */
  readonly nested: (state: G['state']) => boolean;
  readonly view: (state: G['state'], seat: KernelPrompt['seat']) => V;
  readonly answers: (state: G['state']) => readonly G['action'][];
}

/** A probe using engine-core preview on a public reconstruction. Supplied callbacks must never close over hidden state. */
export function greedyPreview<G extends GameTypes, V>(options: GreedyPreviewOptions<G, V>): GreedyOptions<V, G['action']>['probe'] {
  return (view, action) => {
    const state = options.reconstruct(view);
    if (state === undefined) return { kind: 'unknown' };
    if (action.kind !== 'answer' || action.promptId !== state.prompt?.id) return { kind: 'rejected' };
    if (action.reseed !== undefined) return { kind: 'unknown' };
    const seat = state.prompt.seat;
    let nested: G['state'] | undefined;
    const result = preview<G>(options.rules, state, action.picks, options.content, {
      count: s => ({ score: options.score(s) }),
      nested: s => {
        if (!options.nested(s)) return false;
        nested = s;
        return true;
      },
    });
    if (result.stop === 'hiddenInformation') return { kind: 'unknown' };
    if (result.stop === 'rejected') return { kind: 'rejected' };
    const score = result.numbers.score!.after;
    if (nested === undefined) return { kind: 'complete', score };
    if (seatKey(nested.prompt?.seat) !== seatKey(seat)) return { kind: 'unknown' };
    return { kind: 'choice', score, view: options.view(nested, seat), answers: options.answers(nested) };
  };
}

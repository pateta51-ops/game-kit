// Self-play training on the sim-pool (public API only, K125): each generation plays games with the weights in `file`,
// every record carries the per-seat features at its decision points, then TD(lambda) updates the net and writes the file.
import type { GameTypes } from '../engine-core/index';
import { runGames, type GameSpec, type SimGame } from '../sim-pool/index';
import { actorOf, type Model } from './driver';
import { readWeights, writeWeights, type Net } from './net';
import { tdTrain, type TdOptions } from './td';

export interface Trace {
  readonly steps: { seat: number; x: number[] }[];
  scores: readonly number[] | null;
}

/** The game's `SimGame` with each record's summary set to its trace: at every prompt, the features of the seats `record` names (default the acting seat), from their own views. */
export function withTrace<G extends GameTypes, V>(game: SimGame<G>, model: Model<G['state'], G['action'], V>, record?: (state: G['state']) => readonly number[]): SimGame<G, Trace, Trace> {
  return {
    ...game,
    observation: () => ({ steps: [], scores: null }),
    onPrompt(seen, state) {
      for (const seat of record ? record(state) : [actorOf(model, state)]) seen.steps.push({ seat, x: [...model.encode(model.view(state, seat), seat)] });
    },
    summary: (state, _a, _c, seen) => ({ steps: seen.steps, scores: model.over(state) }),
  };
}

export interface TrainOptions extends TdOptions {
  /** The module whose `simGame` is wrapped by `withTrace`; its driver reads the weights from `settings.weights` and move noise from `settings.epsilon`. */
  readonly module: string;
  /** The weight file: read before each generation, written after it. Create it first (`newNet`, `pretrain`, `writeWeights`). */
  readonly file: string;
  /** The encoder's input names: a file with others is refused. */
  readonly names: readonly string[];
  readonly generations: number;
  readonly games: number;
  readonly workers?: number;
  readonly driver?: string;
  readonly prefix?: string;
  /** Move noise for the first `noisyGenerations` generations. */
  readonly epsilon?: number;
  readonly noisyGenerations?: number;
  readonly settings?: Readonly<Record<string, string | number | boolean>>;
  onGeneration?(generation: number, error: number, net: Net): void;
}

export async function trainSelfPlay(o: TrainOptions): Promise<Net> {
  let net = readWeights(o.file, o.names);
  for (let g = 0; g < o.generations; g += 1) {
    const epsilon = g < (o.noisyGenerations ?? 0) ? (o.epsilon ?? 0) : 0;
    const specs: GameSpec[] = Array.from({ length: o.games }, (_, i) => ({ index: i, seed: `${o.prefix ?? 'td'}-${String(g)}-${String(i)}`, driver: o.driver ?? 'learned', settings: { ...o.settings, weights: o.file, epsilon } }));
    const records = await runGames({ module: o.module, specs }, o.workers ?? 1);
    net = readWeights(o.file, o.names);
    let err = 0;
    let n = 0;
    for (const r of records) {
      const t = r.summary as Trace | undefined;
      if (r.error !== undefined || !t?.scores) continue;
      err += tdTrain(net, t.steps, t.scores, o);
      n += 1;
    }
    net.trained += n;
    writeWeights(o.file, net);
    o.onGeneration?.(g, n === 0 ? 0 : err / n, net);
  }
  return net;
}

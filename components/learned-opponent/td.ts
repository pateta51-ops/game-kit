// TD(lambda) on recorded per-seat states, the final-result targets and pre-training on synthetic end states (K125, rftg study).
import { DriverRng } from '../sim-pool/index.ts';
import { forward, trainStep, type Net } from './net.ts';

/** `scores`: softmax of final scores (+1 point to a lone top scorer), graded by margin. `win`: 1 to the winner, split on a tie. */
export type Target = 'scores' | 'win';

export interface TargetOptions {
  readonly target?: Target;
  /** Score softmax temperature (default 0.3). */
  readonly temperature?: number;
}

/** The final result per seat, in seat order. */
export function finalTarget(scores: readonly number[], o: TargetOptions = {}): number[] {
  const max = Math.max(...scores);
  const tops = scores.filter((s) => s === max).length;
  if (o.target === 'win') return scores.map((s) => (s === max ? 1 / tops : 0));
  const t = o.temperature ?? 0.3;
  const e = scores.map((s) => Math.exp(t * (s + (s === max && tops === 1 ? 1 : 0) - max)));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / sum);
}

/** A seat-order vector turned seat-relative: `seat` first. */
export const relative = <T>(v: readonly T[], seat: number): T[] => v.map((_, i) => v[(seat + i) % v.length] as T);

export interface Step {
  readonly seat: number;
  readonly x: ArrayLike<number>;
}

export interface TdOptions extends TargetOptions {
  readonly lambda?: number;
  readonly rate?: number;
}

/** Trains every seat's states of one finished game, newest first: the last toward the final result, each earlier one toward (1 - lambda) V(next) + lambda target(next). Returns the mean error. */
export function tdTrain(net: Net, steps: readonly Step[], scores: readonly number[], o: TdOptions = {}): number {
  const lambda = o.lambda ?? 0.7;
  const rate = o.rate ?? 0.01;
  const z = finalTarget(scores, o);
  let err = 0;
  let n = 0;
  for (let seat = 0; seat < scores.length; seat += 1) {
    const xs = steps.filter((s) => s.seat === seat).map((s) => s.x);
    let g = relative(z, seat);
    for (let t = xs.length - 1; t >= 0; t -= 1) {
      const x = xs[t] as ArrayLike<number>;
      const v = forward(net, x);
      err += trainStep(net, x, g, rate);
      n += 1;
      g = g.map((gi, k) => (1 - lambda) * (v[k] as number) + lambda * gi);
    }
  }
  return n === 0 ? 0 : err / n;
}

/** Pre-training: `n` synthetic end states from `make` (random scores, the game-over flag set), so early self-play is not random. Rate default 0.1 (ten times the TD default). */
export function pretrain(net: Net, n: number, make: (rng: DriverRng) => { x: ArrayLike<number>; scores: readonly number[]; seat: number }, o: TdOptions & { seed?: string } = {}): number {
  const rng = new DriverRng(o.seed ?? 'pretrain');
  let err = 0;
  for (let i = 0; i < n; i += 1) {
    const s = make(rng);
    err += trainStep(net, s.x, relative(finalTarget(s.scores, o), s.seat), o.rate ?? 0.1);
  }
  return n === 0 ? 0 : err / n;
}

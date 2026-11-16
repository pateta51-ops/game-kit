// The decision driver and determinization (K125, rftg study). It decides from the seat's redacted view only: every full
// state it plays forward is sampled from that view (`model.sample`), never the real state.
import type { GameTypes } from '../engine-core/index';
import { DriverRng, type Driver } from '../sim-pool/index';
import { Evaluator, type Net } from './net';
import { finalTarget, relative, type TargetOptions } from './td';

/** What a game supplies. `S` full state, `A` action, `V` the redacted view of one seat. */
export interface Model<S, A, V> {
  /** The seat's view: only what that seat may know. */
  view(state: S, seat: number): V;
  /** Determinization: a full state consistent with `view`, hidden cards and deck order drawn from what the seat cannot see (`deal`). */
  sample(view: V, seat: number, rng: DriverRng): S;
  /** The seat answering the open prompt. K222: optional; default the open prompt's `seat` (a number). */
  actor?(state: S): number;
  legal(state: S): readonly A[];
  /** The game's pure reducer. */
  apply(state: S, action: A): S;
  /** Final scores in seat order when the game is over, else null. */
  over(state: S): readonly number[] | null;
  /** True when forward play from `from` should stop at `now` (end of the round, of the turn...). */
  horizon(from: S, now: S): boolean;
  encode(view: V, seat: number): Float32Array;
  /** The cheap policy for every other prompt in forward play; default a random legal action. */
  cheap?(state: S, legal: readonly A[], rng: DriverRng): A;
  /** A state hash: evaluations are cached by it within one decision. */
  hash?(state: S): string;
  /** A small hand-written tie-breaker added to the net's value (points, hand size...); keep it under about 0.01. */
  tieBreak?(view: V, seat: number): number;
}

export interface DecideOptions extends TargetOptions {
  /** Determinizations per decision (default 1). */
  readonly samples?: number;
  /** `mean` of the samples, or `pessimistic`: the `rank`-th lowest (default 1, the second-worst). */
  readonly pick?: 'mean' | 'pessimistic';
  readonly rank?: number;
  readonly seed?: string;
  /** Forward-play guard (default 10,000 actions). */
  readonly maxSteps?: number;
}

/** K222: the seat answering the open prompt: `model.actor`, else `prompt.seat`. */
export function actorOf<S>(model: Pick<Model<S, unknown, unknown>, 'actor'>, state: S): number {
  if (model.actor) return model.actor(state);
  const raw = (state as { prompt?: { seat?: unknown } | null }).prompt?.seat;
  const seat = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof seat !== 'number' || !Number.isInteger(seat)) throw new RangeError('learned-opponent: the open prompt has no numeric seat and the model no actor');
  return seat;
}

/** Shuffles `unseen` and deals `sizes` from it; the last part is the rest, in its sampled order (the deck). */
export function deal<T>(unseen: readonly T[], sizes: readonly number[], rng: DriverRng): T[][] {
  const xs = [...unseen];
  for (let i = xs.length - 1; i > 0; i -= 1) {
    const j = rng.int(i + 1);
    [xs[i], xs[j]] = [xs[j] as T, xs[i] as T];
  }
  const out: T[][] = [];
  let at = 0;
  for (const n of sizes) {
    if (at + n > xs.length) throw new RangeError(`cannot deal ${String(n)} from ${String(xs.length - at)} unseen`);
    out.push(xs.slice(at, (at += n)));
  }
  out.push(xs.slice(at));
  return out;
}

/** The best of `actions` for `seat`, seen only through `view`: each action applied to K sampled states, played forward to the horizon, evaluated. */
export function decide<S, A, V>(model: Model<S, A, V>, net: Net, view: V, seat: number, actions: readonly A[], o: DecideOptions = {}): { action: A; index: number; values: number[] } {
  if (actions.length === 0) throw new RangeError('no legal action');
  const K = Math.max(1, o.samples ?? 1);
  const seed = o.seed ?? 'decide';
  const ev = new Evaluator(net);
  const cache = new Map<string, number>();
  const per: number[][] = actions.map(() => []);
  const value = (s: S): number => {
    const key = model.hash?.(s);
    const hit = key === undefined ? undefined : cache.get(key);
    if (hit !== undefined) return hit;
    const end = model.over(s);
    const v = model.view(s, seat);
    const r = (end ? (relative(finalTarget(end, o), seat)[0] as number) : (ev.run(model.encode(v, seat))[0] as number)) + (model.tieBreak?.(v, seat) ?? 0);
    if (key !== undefined) cache.set(key, r);
    return r;
  };
  for (let k = 0; k < K; k += 1) {
    const base = model.sample(view, seat, new DriverRng(`${seed}|${String(k)}`));
    actions.forEach((a, i) => {
      const rng = new DriverRng(`${seed}|${String(k)}|roll`);
      let s = model.apply(base, a);
      for (let n = 0; model.over(s) === null && !model.horizon(base, s); n += 1) {
        if (n >= (o.maxSteps ?? 10_000)) throw new Error('forward play did not reach the horizon');
        const legal = model.legal(s);
        s = model.apply(s, model.cheap ? model.cheap(s, legal, rng) : rng.pick(legal));
      }
      (per[i] as number[]).push(value(s));
    });
  }
  const values = per.map((vs) => {
    if (o.pick !== 'pessimistic') return vs.reduce((a, b) => a + b, 0) / vs.length;
    const sorted = [...vs].sort((a, b) => a - b);
    return sorted[Math.min(o.rank ?? 1, sorted.length - 1)] as number;
  });
  let index = 0;
  values.forEach((v, i) => {
    if (v > (values[index] as number) + 1e-9) index = i;
  });
  return { action: actions[index] as A, index, values };
}

/** A sim-pool driver: `epsilon` is move noise (a random answer with that chance), for early training. */
export function learnedDriver<G extends GameTypes, V>(model: Model<G['state'], G['action'], V>, net: Net, o: DecideOptions & { epsilon?: number; name?: string } = {}): Driver<G> {
  let why: string[] = [];
  return {
    name: o.name ?? 'learned',
    reasons: () => why,
    choose(state, answers, rng) {
      if (o.epsilon && rng.chance(o.epsilon)) {
        why = ['learned: move noise'];
        return rng.pick(answers);
      }
      const seat = actorOf(model, state);
      const r = decide(model, net, model.view(state, seat), seat, answers, { ...o, seed: String(rng.nextUint32()) });
      why = [`learned: value ${r.values[r.index]?.toFixed(3) ?? '?'} best of ${String(answers.length)}`];
      return r.action;
    },
  };
}

// The value network (K125, from the rftg study): inputs -> N tanh units -> softmax over seats (seat-relative, self first).
// Plain loops over typed arrays. w1: one row per hidden unit of (inputs + 1), bias last; w2: one row per output of (hidden + 1).
import { readFileSync, writeFileSync } from 'node:fs';
import { DriverRng } from '../sim-pool/index.ts';

export interface Net {
  readonly inputs: number;
  readonly hidden: number;
  readonly outputs: number;
  readonly names: readonly string[];
  trained: number;
  readonly w1: Float64Array;
  readonly w2: Float64Array;
}

export function newNet(names: readonly string[], hidden: number, outputs: number, seed = 'net'): Net {
  const r = new DriverRng(seed);
  const u = (n: number): Float64Array => Float64Array.from({ length: n }, () => (r.int(2_000_001) - 1_000_000) / 10_000_000);
  return { inputs: names.length, hidden, outputs, names: [...names], trained: 0, w1: u(hidden * (names.length + 1)), w2: u(outputs * (hidden + 1)) };
}

function top(net: Net, h: Float64Array): Float64Array {
  const H = net.hidden;
  const z = new Float64Array(net.outputs);
  let max = -Infinity;
  for (let k = 0; k < net.outputs; k += 1) {
    let s = net.w2[k * (H + 1) + H] as number;
    for (let j = 0; j < H; j += 1) s += (net.w2[k * (H + 1) + j] as number) * (h[j] as number);
    z[k] = s;
    if (s > max) max = s;
  }
  let sum = 0;
  for (let k = 0; k < z.length; k += 1) sum += z[k] = Math.exp((z[k] as number) - max);
  for (let k = 0; k < z.length; k += 1) z[k] = (z[k] as number) / sum;
  return z;
}

function hiddenOf(net: Net, x: ArrayLike<number>, h: Float64Array): void {
  const I = net.inputs;
  for (let j = 0; j < net.hidden; j += 1) {
    let s = net.w1[j * (I + 1) + I] as number;
    for (let i = 0; i < I; i += 1) s += (net.w1[j * (I + 1) + i] as number) * (x[i] as number);
    h[j] = Math.tanh(s);
  }
}

/** The share of victory per seat (seat-relative). */
export function forward(net: Net, x: ArrayLike<number>): Float64Array {
  if (x.length !== net.inputs) throw new RangeError(`expected ${String(net.inputs)} inputs, got ${String(x.length)}`);
  const h = new Float64Array(net.hidden);
  hiddenOf(net, x, h);
  return top(net, h);
}

/** Incremental forward pass: keeps the hidden sums and updates only the inputs that changed since the last call. One per decision; make a new one after training. */
export class Evaluator {
  private last: Float32Array | null = null;
  private readonly sums: Float64Array;
  readonly net: Net;
  constructor(net: Net) {
    this.net = net;
    this.sums = new Float64Array(net.hidden);
  }
  run(x: Float32Array): Float64Array {
    const { inputs: I, hidden: H, w1 } = this.net;
    const R = I + 1;
    if (x.length !== I) throw new RangeError(`expected ${String(I)} inputs, got ${String(x.length)}`);
    if (this.last === null) {
      for (let j = 0; j < H; j += 1) {
        let s = w1[j * R + I] as number;
        for (let i = 0; i < I; i += 1) s += (w1[j * R + i] as number) * (x[i] as number);
        this.sums[j] = s;
      }
      this.last = x.slice();
    } else {
      const last = this.last;
      for (let i = 0; i < I; i += 1) {
        const d = (x[i] as number) - (last[i] as number);
        if (d === 0) continue;
        for (let j = 0; j < H; j += 1) this.sums[j] = (this.sums[j] as number) + (w1[j * R + i] as number) * d;
        last[i] = x[i] as number;
      }
    }
    return top(this.net, this.sums.map(Math.tanh));
  }
}

/** One step of plain backprop on the squared error of the softmax outputs; returns the error before the step. */
export function trainStep(net: Net, x: ArrayLike<number>, target: ArrayLike<number>, rate: number): number {
  const { inputs: I, hidden: H, outputs: O, w1, w2 } = net;
  const h = new Float64Array(H);
  hiddenOf(net, x, h);
  const p = top(net, h);
  let err = 0;
  let gp = 0;
  const g = new Float64Array(O);
  for (let k = 0; k < O; k += 1) {
    g[k] = (p[k] as number) - (target[k] as number);
    err += (g[k] as number) ** 2 / 2;
    gp += (g[k] as number) * (p[k] as number);
  }
  const dz = g.map((v, k) => (p[k] as number) * (v - gp));
  const dh = new Float64Array(H);
  for (let j = 0; j < H; j += 1) {
    let s = 0;
    for (let k = 0; k < O; k += 1) s += (dz[k] as number) * (w2[k * (H + 1) + j] as number);
    dh[j] = s * (1 - (h[j] as number) ** 2);
  }
  for (let k = 0; k < O; k += 1) {
    for (let j = 0; j < H; j += 1) w2[k * (H + 1) + j] = (w2[k * (H + 1) + j] as number) - rate * (dz[k] as number) * (h[j] as number);
    w2[k * (H + 1) + H] = (w2[k * (H + 1) + H] as number) - rate * (dz[k] as number);
  }
  for (let j = 0; j < H; j += 1) {
    const d = rate * (dh[j] as number);
    if (d === 0) continue;
    for (let i = 0; i < I; i += 1) w1[j * (I + 1) + i] = (w1[j * (I + 1) + i] as number) - d * (x[i] as number);
    w1[j * (I + 1) + I] = (w1[j * (I + 1) + I] as number) - d;
  }
  return err;
}

export interface WeightFile {
  readonly version: 1;
  readonly inputs: number;
  readonly hidden: number;
  readonly outputs: number;
  readonly trained: number;
  readonly names: readonly string[];
  readonly w1: readonly number[];
  readonly w2: readonly number[];
}

export const toWeights = (net: Net): WeightFile => ({ version: 1, inputs: net.inputs, hidden: net.hidden, outputs: net.outputs, trained: net.trained, names: [...net.names], w1: [...net.w1], w2: [...net.w2] });

/** A net from its weight file; throws on any input-name mismatch with the encoder's `names`, or on bad sizes. */
export function fromWeights(f: WeightFile, names: readonly string[]): Net {
  const n = Math.max(names.length, f.names.length);
  for (let i = 0; i < n; i += 1)
    if (f.names[i] !== names[i]) throw new Error(`weight file inputs differ from the encoder at input ${String(i)}: ${String(f.names[i])} in the file, ${String(names[i])} in the encoder`);
  if (f.inputs !== names.length || f.w1.length !== f.hidden * (f.inputs + 1) || f.w2.length !== f.outputs * (f.hidden + 1)) throw new Error('weight file sizes do not match its matrices');
  return { inputs: f.inputs, hidden: f.hidden, outputs: f.outputs, names: [...names], trained: f.trained, w1: Float64Array.from(f.w1), w2: Float64Array.from(f.w2) };
}

export const readWeights = (file: string, names: readonly string[]): Net => fromWeights(JSON.parse(readFileSync(file, 'utf8')) as WeightFile, names);
export const writeWeights = (file: string, net: Net): void => writeFileSync(file, JSON.stringify(toWeights(net)));

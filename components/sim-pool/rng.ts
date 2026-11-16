// The drivers' randomness (warps src/engine/drivers/rng.ts). A driver never touches the game's RNG (`state.rng`): its own choices
// come from a counter-mode hash of its seed and the open prompt's id, built on the public `fnv1a64`. So the random draws
// are a pure function of (seed, state): the same game and seed always give the same answers.
import { fnv1a64 } from '../engine-core/index.ts';

const TWO_32 = 4294967296;

/** A stream of uniform numbers for one decision: `fnv1a64("<key>#<n>")` for n = 0, 1, 2, … */
export class DriverRng {
  private n = 0;

  private readonly key: string;
  constructor(key: string) {
    this.key = key;
  }

  /**
   * The next unsigned 32-bit number: the low word of the hash, passed through the murmur3 finalizer. The low word of one
   * FNV-1a step depends on the last byte only through an XOR and a multiplication by 435, so without the finalizer
   * `int(2^k)` would see only the low k bits of each key character and successive draws of one key would be correlated.
   * The finalizer is a bijection of the 32-bit words with full avalanche; the stream stays a pure function of the key and
   * the draw number.
   */
  nextUint32(): number {
    const hex = fnv1a64(`${this.key}#${String(this.n)}`);
    this.n += 1;
    let x = Number.parseInt(hex.slice(8), 16) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    return (x ^ (x >>> 16)) >>> 0;
  }

  /** A uniform integer in [0, n) for an integer n ≥ 1 (rejection sampling, no modulo bias). */
  int(n: number): number {
    if (!Number.isInteger(n) || n < 1 || n > TWO_32)
      throw new RangeError(`DriverRng.int: bad bound ${String(n)}`);
    const limit = TWO_32 - (TWO_32 % n);
    let x = this.nextUint32();
    while (x >= limit) x = this.nextUint32();
    return x % n;
  }

  /** True with probability `p` (to 1/10,000). */
  chance(p: number): boolean {
    return this.int(10_000) < Math.round(p * 10_000);
  }

  /** A uniformly chosen element of a non-empty list. */
  pick<T>(xs: readonly T[]): T {
    if (xs.length === 0) throw new RangeError('DriverRng.pick: empty list');
    return xs[this.int(xs.length)] as T;
  }

  /** `k` distinct elements of `xs` chosen uniformly, in their original order (all of them when k ≥ length). */
  sample<T>(xs: readonly T[], k: number): T[] {
    if (k >= xs.length) return [...xs];
    const at = xs.map((_, i) => i);
    for (let i = 0; i < k; i += 1) {
      const j = i + this.int(at.length - i);
      const held = at[i] as number;
      at[i] = at[j] as number;
      at[j] = held;
    }
    return at
      .slice(0, k)
      .sort((a, b) => a - b)
      .map((i) => xs[i] as T);
  }
}

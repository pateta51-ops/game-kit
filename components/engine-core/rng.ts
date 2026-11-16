// BUILD_PLAN §4.4 "Principles", D7: sfc32 seeded by a cyrb128 hash of the seed string (ported kernel). The four 32-bit
// words live in `state.rng` and only this file touches them, so every shuffle of a game is a function of its seed and
// the order of the calls. No other source of randomness exists in the engine (Math.random is banned by lint).
//
// cyrb128 is bryc's public-domain string hash (four 32-bit words); sfc32 is Chris Doty-Humphrey's "small fast counting"
// generator (PractRand). The known-answer tests pin both against an independent implementation.
import { EngineBugError } from './errors.ts';

/** The generator state: four unsigned 32-bit words (a, b, c, counter). Mutated in place by the functions below. */
export type RngState = [number, number, number, number];

/** cyrb128: hash a string into four unsigned 32-bit words, mixing in each UTF-16 code unit. */
export function seedRng(seed: string): RngState {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < seed.length; i += 1) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** One sfc32 step: returns the next unsigned 32-bit output and advances `rng` in place. */
export function nextUint32(rng: RngState): number {
  const a = rng[0] | 0;
  const b = rng[1] | 0;
  const c = rng[2] | 0;
  const d = rng[3] | 0;
  const t = (((a + b) | 0) + d) | 0;
  rng[0] = (b ^ (b >>> 9)) >>> 0;
  rng[1] = ((c + (c << 3)) | 0) >>> 0;
  rng[2] = ((((c << 21) | (c >>> 11)) + t) | 0) >>> 0;
  rng[3] = (d + 1) >>> 0;
  return t >>> 0;
}

const TWO_32 = 4294967296;

/** A uniform integer in [0, n) for an integer n from 1 to 2^32 (rejection sampling, so there is no modulo bias). */
export function randomInt(rng: RngState, n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > TWO_32) {
    throw new EngineBugError(`randomInt: n must be an integer from 1 to 2^32, got ${String(n)}`);
  }
  const limit = TWO_32 - (TWO_32 % n);
  let x = nextUint32(rng);
  while (x >= limit) x = nextUint32(rng);
  return x % n;
}

/** Fisher–Yates from the end, in place: for i = n−1 … 1, swap xs[i] with xs[j], j uniform in [0, i]. */
export function shuffleInPlace<T>(rng: RngState, xs: T[]): void {
  for (let i = xs.length - 1; i > 0; i -= 1) {
    const j = randomInt(rng, i + 1);
    const held = xs[i] as T;
    xs[i] = xs[j] as T;
    xs[j] = held;
  }
}

/**
 * A uniformly random index of `xs` (D7, §5.17: a deck draw, a random pick). One `randomInt` call; throws on an
 * empty array, because a draw from an empty deck is decided by the caller (IR-19), never here.
 */
export function drawRandomIndex<T>(rng: RngState, xs: readonly T[]): number {
  if (xs.length === 0) throw new EngineBugError('drawRandomIndex: the array is empty');
  return randomInt(rng, xs.length);
}

/**
 * Removes one uniformly random element of `xs` in place and returns it (`drawRandom(deck)` in the pseudo-code of §5). The order of the remaining elements is kept.
 */
export function drawRandom<T>(rng: RngState, xs: T[]): T {
  const i = drawRandomIndex(rng, xs);
  const [picked] = xs.splice(i, 1);
  return picked as T;
}

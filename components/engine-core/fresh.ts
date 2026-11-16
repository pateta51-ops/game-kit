import type { RngWords } from './types';

/** Four fresh unsigned 32-bit words from `crypto.getRandomValues`, for `AnswerAction.reseed`. App side only. */
export function freshWords(): RngWords {
  const w = new Uint32Array(4);
  crypto.getRandomValues(w);
  return { a: w[0] ?? 0, b: w[1] ?? 0, c: w[2] ?? 0, d: w[3] ?? 0 };
}

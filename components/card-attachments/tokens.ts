export type Dir = 'good' | 'bad'

/** Tokens drawn in a row: one each up to `max`; more is one token and a "×N". */
export const ROW_MAX = 5
export const tokenRow = (n: number, max = ROW_MAX): { tokens: number; times: number | null } => (n <= max ? { tokens: Math.max(0, n), times: null } : { tokens: 1, times: n })

/** A number an effect changed, against what is printed: `good` or `bad`, undefined when equal. `higherIsBad` (default) for thresholds and costs. */
export const changedDir = (now: number, printed: number, higherIsBad = true): Dir | undefined => (now === printed ? undefined : (now > printed) === higherIsBad ? 'bad' : 'good')

/** A box that counts down as tokens are placed, never below 0; `zero` once it has been reached. */
export const countDown = (threshold: number, placed: number): { value: number; zero: boolean } => {
  const value = Math.max(0, threshold - placed)
  return { value, zero: value === 0 }
}

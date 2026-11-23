export type GuardState = 'guarded' | 'open' | 'fired';
export const GUARD_MS = 4000;

export function guardTap(state: GuardState, barred = false): { state: GuardState; fire: boolean } {
  if (barred || state === 'fired') return { state, fire: false };
  return state === 'guarded' ? { state: 'open', fire: false } : { state: 'fired', fire: true };
}

export const guardClose = (state: GuardState): GuardState => (state === 'open' ? 'guarded' : state);

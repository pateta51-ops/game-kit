// Second-tap commit (machine kit.secondTap): on a touch screen an irreversible answer needs two taps on the same target.
import { useState } from 'react';
import { transition } from '../state-machines/machine.ts';
import { SECOND_TAP_MACHINE } from './machine.ts';

/** One tap: the armed target after it, and whether the tap commits. */
export function secondTap(armed: string | null, id: string): { armed: string | null; commit: boolean } {
  const to = transition(SECOND_TAP_MACHINE, armed === null ? 'idle' : 'armed', armed === id ? 'commit' : 'arm');
  return to === 'idle' ? { armed: null, commit: true } : { armed: id, commit: false };
}

/**
 * `tap(id)` arms `id` or, on the armed one, calls `commit(id)`. A change of `resetKey` (the prompt, the game version)
 * disarms. `armed` is the target the game marks as armed.
 */
export function useSecondTap(commit: (id: string) => void, resetKey?: unknown) {
  const [s, set] = useState<{ key: unknown; armed: string | null }>({ key: resetKey, armed: null });
  const armed = s.key === resetKey ? s.armed : null;
  return {
    armed,
    tap(id: string) {
      const r = secondTap(armed, id);
      set({ key: resetKey, armed: r.armed });
      if (r.commit) commit(id);
    },
    disarm() {
      if (armed !== null) transition(SECOND_TAP_MACHINE, 'armed', 'disarm');
      set({ key: resetKey, armed: null });
    },
  };
}

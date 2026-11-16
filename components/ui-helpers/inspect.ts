// Lifted from jarl src/ui/components/inspect.ts (the trigger only): an inspector opens after the pointer rests on a
// piece, at once on `openNow` (a right-click), and closes a moment after the pointer leaves unless `hold` is called.
import { createStore, type StoreApi } from 'zustand/vanilla';
import { realTimers, type Timers } from './timers';

export interface InspectState<T> {
  readonly target: T | null;
  open: (target: T) => void;
  openNow: (target: T) => void;
  close: () => void;
  hold: () => void;
  closeNow: () => void;
}

export interface InspectOptions {
  openMs?: number;
  closeMs?: number;
  timers?: Timers;
}

export function createInspect<T>(options: InspectOptions = {}): StoreApi<InspectState<T>> {
  const { openMs = 700, closeMs = 180, timers = realTimers } = options;
  let openTimer: unknown;
  let closeTimer: unknown;
  const stop = (): void => {
    timers.clear(openTimer);
    timers.clear(closeTimer);
  };
  return createStore<InspectState<T>>()((set) => ({
    target: null,
    open(target) {
      timers.clear(openTimer);
      openTimer = timers.set(() => {
        timers.clear(closeTimer);
        set({ target });
      }, openMs);
    },
    openNow(target) {
      stop();
      set({ target });
    },
    close() {
      stop();
      closeTimer = timers.set(() => {
        set({ target: null });
      }, closeMs);
    },
    hold() {
      timers.clear(closeTimer);
    },
    closeNow() {
      stop();
      set({ target: null });
    },
  }));
}

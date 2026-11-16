// Lifted from imp src/ui/play/toasts.ts: short messages that go away by themselves; one with a title stays until closed.
import { createStore, type StoreApi } from 'zustand/vanilla';
import { realTimers, type Timers } from './timers';

export interface ToastInput<Tone extends string = string> {
  text: string;
  tone: Tone;
  title?: string;
}

export type Toast<Tone extends string = string> = ToastInput<Tone> & { id: number };

export interface ToastState<Tone extends string = string> {
  toasts: Toast<Tone>[];
  next: number;
  push: (toast: ToastInput<Tone>) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}

export interface ToastOptions {
  max?: number;
  ms?: number;
  timers?: Timers;
}

export function createToasts<Tone extends string = string>(options: ToastOptions = {}): StoreApi<ToastState<Tone>> {
  const { max = 4, ms = 6000, timers = realTimers } = options;
  const pending = new Map<number, unknown>();
  const drop = (keep: readonly Toast<Tone>[]): void => {
    for (const [id, t] of [...pending]) {
      if (keep.some((x) => x.id === id)) continue;
      timers.clear(t);
      pending.delete(id);
    }
  };
  return createStore<ToastState<Tone>>()((set, get) => ({
    toasts: [],
    next: 1,
    push(toast) {
      const id = get().next;
      const toasts = max > 0 ? [...get().toasts, { ...toast, id }].slice(-max) : [];
      set({ toasts, next: id + 1 });
      if (max > 0 && toast.title === undefined)
        pending.set(
          id,
          timers.set(() => {
            get().dismiss(id);
          }, ms),
        );
      drop(toasts);
      return id;
    },
    dismiss(id) {
      const toasts = get().toasts.filter((t) => t.id !== id);
      set({ toasts });
      drop(toasts);
    },
    clear() {
      set({ toasts: [] });
      drop([]);
    },
  }));
}

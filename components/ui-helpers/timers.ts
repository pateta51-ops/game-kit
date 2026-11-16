export interface Timers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (id: unknown) => void;
}

export const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => {
    clearTimeout(id as ReturnType<typeof setTimeout>);
  },
};

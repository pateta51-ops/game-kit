import { noSteps, pushSteps, advance, skip, type Steps } from '../paced-view/index.ts';

export interface Recording<A, N = unknown> { actions: readonly A[]; annotations?: readonly (N | undefined)[] }
export interface ReplayAdapter<S, A, E, V> {
  start: () => S;
  apply: (state: S, action: A) => { state: S; events: readonly E[] };
  view: (state: S) => V;
  boundary?: (before: S, after: S, action: A, index: number) => boolean;
  isStep?: (event: E) => boolean;
  visibleEvent?: (event: E) => boolean;
}
export interface ReplayEvent<E> { readonly event: E; readonly index: number }
export class ReplayError extends Error {
  readonly actionIndex: number | null;
  constructor(message: string, actionIndex: number | null = null) {
    super(message);
    this.name = 'ReplayError';
    this.actionIndex = actionIndex;
  }
}

function atAction<T>(i: number, fn: () => T): T {
  try { return fn(); } catch (e) { throw new ReplayError(`Action ${String(i + 1)} failed: ${String(e)}`, i); }
}

export function createReplay<S, A, E, V, N = unknown>(adapter: ReplayAdapter<S, A, E, V>, recording: Recording<A, N>, interval = 1000) {
  if (!recording || !Array.isArray(recording.actions)) throw new ReplayError('Invalid recording: actions must be an array.');
  if (!Number.isFinite(interval) || interval <= 0 || interval > 2_147_483_647) throw new ReplayError('Interval is outside the supported timer range.');
  if (recording.annotations !== undefined && !Array.isArray(recording.annotations)) throw new ReplayError('Invalid recording: annotations must be an array.');
  const actions = Array.from(recording.actions as readonly A[], (action, i) => atAction(i, () => structuredClone(action)));
  const annotations = actions.map((_, i) => atAction(i, () => structuredClone(recording.annotations?.[i])));
  type Queue = Steps<V, ReplayEvent<E>>;
  const empty = () => noSteps<V, ReplayEvent<E>>();
  const entries: { state: S; view: V; steps: Queue }[] = [];
  const boundaries = [0];
  const viewOf = (state: S) => structuredClone(adapter.view(structuredClone(state)));
  try {
    const state = structuredClone(adapter.start());
    entries.push({ state, view: viewOf(state), steps: empty() });
  } catch (e) { throw new ReplayError(`Setup failed: ${String(e)}`); }
  for (const [i, action] of actions.entries()) {
    atAction(i, () => {
      const before = entries[i]!;
      const next = adapter.apply(structuredClone(before.state), structuredClone(action));
      if (!next || !('state' in next) || !Array.isArray(next.events)) throw new Error('Expected a state and an events array.');
      const state = structuredClone(next.state);
      const events = Array.from(next.events as readonly E[], (event, index) => ({ event: structuredClone(event), index }))
        .filter(({ event }) => adapter.visibleEvent?.(structuredClone(event)) ?? true);
      const steps = pushSteps(empty(), before.view, events, ({ event }) => adapter.isStep?.(structuredClone(event)) ?? false);
      const view = viewOf(state);
      if (adapter.boundary?.(structuredClone(before.state), structuredClone(state), structuredClone(action), i)) boundaries.push(i + 1);
      entries.push({ state, view, steps });
    });
  }
  const length = actions.length;
  if (boundaries.at(-1) !== length) boundaries.push(length);
  let index = 0, speed = 1, playing = false, disposed = false, seeking = 0;
  let timer: ReturnType<typeof setTimeout> | undefined, steps = empty();
  const listeners = new Set<() => void>();
  const snapshot = () => {
    const entry = entries[index]!;
    const queued = steps;
    return {
      index, length, state: structuredClone(entry.state), view: structuredClone(entry.view),
      events: entry.steps.events.map(({ event }) => structuredClone(event)),
      annotation: structuredClone(annotations[index - 1]), steps: structuredClone(steps),
      playing, speed, ended: index === length,
      completeStep: () => { if (steps === queued) advanceStep(); },
    };
  };
  let current = snapshot();

  function publish(): void {
    current = snapshot();
    clearTimeout(timer);
    timer = undefined;
    if (playing && !steps.queue.length) timer = setTimeout(next, Math.max(1, interval / speed));
    for (const fn of listeners) fn();
  }

  function seek(at: number): void {
    if (disposed) return;
    if (!Number.isInteger(at) || at < 0 || at > length) throw new RangeError('Invalid replay position.');
    playing = false;
    index = at;
    steps = empty();
    seeking++;
    try { publish(); } finally { seeking--; }
  }

  function next(): boolean {
    if (disposed || index === length || steps.queue.length) return false;
    index++;
    steps = { ...entries[index]!.steps };
    if (index === length) playing = false;
    publish();
    return true;
  }

  function advanceStep(): void {
    if (disposed || !steps.queue.length) return;
    steps = advance(steps);
    publish();
  }

  return {
    get: () => current,
    subscribe: (fn: () => void) => {
      if (!disposed) listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    play: () => {
      if (disposed || seeking || playing || index === length) return false;
      playing = true;
      publish();
      return true;
    },
    pause: () => { if (playing) { playing = false; publish(); } },
    setSpeed: (n: number) => {
      if (disposed) return;
      const delay = interval / n;
      if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(delay) || delay > 2_147_483_647) throw new RangeError('Speed is outside the supported timer range.');
      speed = n;
      publish();
    },
    next, seek,
    previous: () => seek(Math.max(0, index - 1)),
    previousBoundary: () => seek(boundaries.findLast((n) => n < index) ?? 0),
    nextBoundary: () => seek(boundaries.find((n) => n > index) ?? length),
    advance: advanceStep,
    skip: () => {
      if (disposed || !steps.queue.length) return;
      steps = skip(steps);
      publish();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      playing = false;
      steps = empty();
      listeners.clear();
      publish();
    },
  };
}

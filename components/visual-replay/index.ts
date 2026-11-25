import { noSteps, pushSteps, advance, skip, type Steps } from '../paced-view/index.ts';

export interface Recording<A, N = unknown> { actions: readonly A[]; annotations?: readonly (N | undefined)[] }
export interface ReplayAdapter<S, A, E, V> { start: () => S; apply: (state: S, action: A) => { state: S; events: readonly E[] }; view: (state: S) => V; boundary?: (before: S, after: S, action: A, index: number) => boolean; isStep?: (event: E) => boolean }
export class ReplayError extends Error { readonly actionIndex: number | null; constructor(message: string, actionIndex: number | null = null) { super(message); this.name = 'ReplayError'; this.actionIndex = actionIndex; } }
export function createReplay<S, A, E, V, N = unknown>(adapter: ReplayAdapter<S, A, E, V>, recording: Recording<A, N>, interval = 1000) {
  if (!recording || !Array.isArray(recording.actions)) throw new ReplayError('Invalid recording: actions must be an array.');
  if (!Number.isFinite(interval) || interval <= 0) throw new ReplayError('Interval must be positive.');
  const actions: readonly A[] = structuredClone(recording.actions as readonly A[]), annotations = structuredClone(recording.annotations ?? []);
  const states: S[] = [], events: (readonly E[])[] = [], boundaries: number[] = [0];
  try { states.push(structuredClone(adapter.start())); } catch (e) { throw new ReplayError(`Setup failed: ${String(e)}`); }
  for (const [i, action] of actions.entries()) {
    try {
      const before = states[i] as S, next = adapter.apply(structuredClone(before), action);
      states.push(next.state); events.push(next.events);
      if (adapter.boundary?.(before, next.state, action, i)) boundaries.push(i + 1);
    } catch (e) { throw new ReplayError(`Action ${String(i + 1)} failed: ${String(e)}`, i); }
  }
  if (boundaries[boundaries.length - 1] !== actions.length) boundaries.push(actions.length);
  let index = 0, speed = 1, playing = false, timer: ReturnType<typeof setTimeout> | undefined, steps: Steps<V, E> = noSteps();
  const listeners = new Set<() => void>();
  const snapshot = () => ({ index, length: actions.length, state: structuredClone(states[index] as S), view: adapter.view(structuredClone(states[index] as S)), events: index ? structuredClone(events[index - 1] as readonly E[]) : [], annotation: index ? annotations[index - 1] : undefined, steps, playing, speed, ended: index === actions.length });
  let current = snapshot();
  const notify = () => { current = snapshot(); for (const fn of listeners) fn(); };
  const pause = () => { clearTimeout(timer); timer = undefined; if (playing) { playing = false; notify(); } };
  const seek = (at: number) => { if (!Number.isInteger(at) || at < 0 || at > actions.length) throw new RangeError('Invalid replay position.'); pause(); index = at; steps = noSteps(); notify(); };
  const next = () => { clearTimeout(timer); timer = undefined;
    if (index === actions.length) { pause(); return false; }
    const before = adapter.view(states[index] as S); index++;
    steps = pushSteps(noSteps(), before, events[index - 1] as readonly E[], adapter.isStep ?? (() => false));
    if (index === actions.length) { clearTimeout(timer); timer = undefined; playing = false; }
    notify(); if (playing) schedule(); return true;
  };
  const schedule = () => { if (!playing || steps.queue.length) return; clearTimeout(timer); timer = setTimeout(() => { if (playing) next(); }, interval / speed); };
  const play = () => { if (playing || index === actions.length) return false; playing = true; notify(); if (playing) schedule(); return true; };
  const setSpeed = (n: number) => { if (!Number.isFinite(n) || n <= 0) throw new RangeError('Speed must be positive.'); speed = n; if (playing) { clearTimeout(timer); schedule(); } notify(); };
  const previous = () => seek(Math.max(0, index - 1));
  const previousBoundary = () => seek([...boundaries].reverse().find((n) => n < index) ?? 0);
  const nextBoundary = () => seek(boundaries.find((n) => n > index) ?? actions.length);
  return { get: () => current, subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, play, pause, setSpeed, next, previous, seek, previousBoundary, nextBoundary, advance: () => { steps = advance(steps); notify(); if (playing && !steps.queue.length) schedule(); }, skip: () => { steps = skip(steps); notify(); if (playing) schedule(); }, dispose: () => { pause(); listeners.clear(); } };
}

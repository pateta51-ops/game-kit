// Copy on write (performance.md, "Copy on write (R7)"). `applyAction` no longer copies the whole state: it makes a shallow
// copy of the top level (and of the task stack, written by every action) and shares every other container with the
// input state. A handler that writes to a container first asks for its own copy through one of the `own*` functions
// below (the write barrier): the first call in an action copies that container (and the path to it from the state) and
// records the copy as owned; later calls in the same action return the same copy. So an action copies only what it
// changes, and the input state never changes.
//
// The rule for engine code: never write to an object of the state you did not get from an `own*` function in this
// action (top-level fields of the working state, `s.x = …`, are always the action's own). Hold the owned object while
// you read it back: a reference taken before the first `own*` call on that path is the old, shared one.
//
// Safety nets: with state freezing on (tests, the browser) every shared object is frozen, so a missed barrier throws;
// `cow.property.test.ts` replays many games with freezing on and off, checks the input state is unchanged
// after every action, and compares every state with the full-copy engine (`setCopyMode('full')`), which catches a stale
// read through a reference taken before a barrier.
//
// Outside an action (`createGame` building a new state, tests building states) no draft is open and the `own*` functions
// return the object itself: the caller owns all of it, as before.
import './single.ts';
import { EngineBugError } from './errors.ts';

/** The objects this action owns (copied in this action), `ALL` when every object is the action's own, null outside an action. */
let owned: Set<object> | null = null;
const ALL: Set<object> = new Set();
const SPARE: Set<object> = new Set();

/** 'cow' (default): copy on write. 'full': the old full copy per action, kept for the differential test and the bench. */
let mode: 'cow' | 'full' = 'cow';

/** Check mode: `own` throws when its parent is not owned by the action (tests; off by default, it costs a lookup). */
let checks = false;

export function setCowChecks(on: boolean): void {
  checks = on;
}

/** Switch between copy on write and the full copy per action (tests and benches only; same results by contract). */
export function setCopyMode(next: 'cow' | 'full'): void {
  mode = next;
}

export function copyMode(): 'cow' | 'full' {
  return mode;
}

/** Open a draft over `s` (a fresh shallow copy, or a full copy that is all the action's own); returns the previous draft. */
export function openDraft(s: object, all: boolean): Set<object> | null {
  const prev = owned;
  if (all) owned = ALL;
  else {
    owned = prev === null && SPARE.size === 0 ? SPARE : new Set();
    owned.add(s);
  }
  return prev;
}

/** Close the draft opened by `openDraft` (always, in a `finally`). */
export function closeDraft(prev: Set<object> | null): void {
  if (owned !== null && owned !== ALL) owned.clear();
  owned = prev;
}

/** A copy of a list. V8 copies a frozen array with `slice` about 50 times slower than with a loop (performance.md). */
export function copyList<T>(list: readonly T[]): T[] {
  if (!Object.isFrozen(list)) return list.slice();
  const n = list.length;
  const out = new Array<T>(n);
  for (let i = 0; i < n; i += 1) out[i] = list[i] as T;
  return out;
}

/**
 * The write barrier: `parent[key]` as an object this action owns. `parent` must be owned already (the state itself, or
 * an object an `own*` call returned in this action). Copies arrays with `copyList` and objects with a spread (same keys,
 * same order). A missing or null value is returned as is.
 */
export function own<P extends object, K extends keyof P>(parent: P, key: K): P[K] {
  const value = parent[key];
  const set = owned;
  if (set === null || set === ALL) return value;
  // the check mode (tests): a barrier called on a parent this action does not own would write into the shared state
  if (checks && !set.has(parent))
    throw new EngineBugError(`copy on write: own(…, ${String(key)}) on a shared parent`);
  if (value === null || typeof value !== 'object' || set.has(value)) return value;
  const copy = (Array.isArray(value) ? copyList(value) : { ...value }) as P[K] & object;
  parent[key] = copy;
  set.add(copy);
  return copy;
}

/** Mark a new object put into the state in this action as owned, so a later barrier does not copy it again. */
export function adopt<T>(value: T): T {
  const set = owned;
  if (set !== null && set !== ALL && value !== null && typeof value === 'object') set.add(value);
  return value;
}

// BUILD_PLAN §4.4, §4.9: the working copy `applyAction` runs the engine on, and the freeze that keeps returned states
// unchanged (ported from Warp's Edge core/copy.ts). GameState is plain JSON (§6.5), so a copy is a walk over arrays and
// plain objects. The guarantee undo, replays and saves rely on: a state never changes after `applyAction` returned it,
// and an input state never changes because of an `applyAction`. Phase 2 may add a faster `copyState` that knows the shape
// of the large parts (as Warp's Edge's does); until then it is `copyJson`.

/**
 * A deep copy of plain JSON data (arrays, plain objects, primitives). Own keys in their own order (`Object.keys`, the
 * same keys and order a `for…in` over plain JSON gives), primitives copied without a call.
 */
import './single.ts';

export function copyJson<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const n = value.length;
    const out = new Array<unknown>(n);
    for (let i = 0; i < n; i += 1) {
      const item = value[i] as unknown;
      out[i] = item !== null && typeof item === 'object' ? copyJson(item) : item;
    }
    return out as T;
  }
  const out: Record<string, unknown> = {};
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i] as string;
    const item = (value as Record<string, unknown>)[key];
    out[key] = item !== null && typeof item === 'object' ? copyJson(item) : item;
  }
  return out as T;
}

/** The working copy of a state for `applyAction` in full-copy mode: the same keys, order and values as `copyJson(state)`. */
export const copyState = <T>(state: T): T => copyJson(state);

/** Freeze a value and everything in it. An object already frozen is taken as frozen all the way down. */
export function deepFreeze(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const item = value[i] as unknown;
      if (item !== null && typeof item === 'object') deepFreeze(item);
    }
    return;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  for (let i = 0; i < keys.length; i += 1) {
    const item = record[keys[i] as string];
    if (item !== null && typeof item === 'object') deepFreeze(item);
  }
}

let freezing = true;

/** Freeze every state `applyAction` returns (default on). A simulation may switch it off for speed. */
export function setStateFreezing(on: boolean): void {
  freezing = on;
}

/** Is state freezing on? */
export function isFreezing(): boolean {
  return freezing;
}

/** Freeze a state that is about to be returned (when freezing is on). */
export function freezeState<T>(state: T): T {
  if (freezing) deepFreeze(state);
  return state;
}

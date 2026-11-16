// K113 (XMage MageObjectReference and last-known information, MIT): a reference to an object is its id plus the number of
// times it has changed zone, so a reference taken before a move goes stale by itself. When an object leaves a zone the
// game stores a snapshot of it, read back by (id, counter) or by (id, zone). Opt-in: a game that wants it keeps an
// `objRefs: ObjectTrack<T>` field in its state (start it with `newObjectTrack()`); nothing else in the kernel reads it.
import { adopt, own } from './cow';
import type { Draft } from './draft';

export interface ObjectRef {
  readonly id: string;
  readonly zcc: number;
}

export interface LastKnown<T> {
  readonly id: string;
  readonly zcc: number;
  readonly zone: string;
  readonly obj: T;
}

export interface ObjectTrack<T> {
  /** Zone changes per id (absent: 0). */
  readonly zcc: Readonly<Record<string, number>>;
  /** Snapshots by `id@zcc`: the object as it was when it left `zone` with that counter. */
  readonly last: Readonly<Record<string, LastKnown<T>>>;
  /** `zone:id` of the objects that left a zone since the game last called `clearLeft` (XMage's short-living set). */
  readonly left: readonly string[];
}

export interface Tracked<T> {
  readonly objRefs: ObjectTrack<T>;
}

export const newObjectTrack = <T>(): Draft<ObjectTrack<T>> => ({ zcc: {}, last: {}, left: [] });

const zccOf = (s: Tracked<unknown>, id: string): number => s.objRefs.zcc[id] ?? 0;

/** The current reference to `id`. */
export const refOf = (s: Tracked<unknown>, id: string): ObjectRef => ({ id, zcc: zccOf(s, id) });

/** Is `ref` still the object it named (no zone change since it was taken)? */
export const isCurrent = (s: Tracked<unknown>, ref: ObjectRef): boolean => zccOf(s, ref.id) === ref.zcc;

/** `id` leaves `zone`: stores `snapshot` (a JSON value the caller no longer changes), bumps the counter, returns the new reference. Call inside an action or on a state you own. */
export function leaveZone<T>(s: Draft<Tracked<T>>, id: string, zone: string, snapshot: T): ObjectRef {
  const t = own(s, 'objRefs');
  const n = t.zcc[id] ?? 0;
  (own(t, 'last') as Record<string, LastKnown<T>>)[`${id}@${String(n)}`] = adopt({ id, zcc: n, zone, obj: snapshot });
  own(t, 'zcc')[id] = n + 1;
  if (!t.left.includes(`${zone}:${id}`)) own(t, 'left').push(`${zone}:${id}`);
  return { id, zcc: n + 1 };
}

/** The snapshot `ref` named when its object left a zone; undefined while `ref` is current or when it was forgotten. */
export const lastKnown = <T>(s: Tracked<T>, ref: ObjectRef): LastKnown<T> | undefined => s.objRefs.last[`${ref.id}@${String(ref.zcc)}`];

/** The newest snapshot of `id` taken when it left `zone`. */
export function lastKnownIn<T>(s: Tracked<T>, id: string, zone: string): LastKnown<T> | undefined {
  for (let n = zccOf(s, id) - 1; n >= 0; n -= 1) {
    const l = s.objRefs.last[`${id}@${String(n)}`];
    if (l?.zone === zone) return l;
  }
  return undefined;
}

/** Did `id` leave `zone` since the last `clearLeft`? */
export const hasLeft = (s: Tracked<unknown>, id: string, zone: string): boolean => s.objRefs.left.includes(`${zone}:${id}`);

/** Empties the short-living set (the game calls it where its rules end a moment, e.g. at the start of each action). */
export function clearLeft<T>(s: Draft<Tracked<T>>): void {
  if (s.objRefs.left.length > 0) own(s, 'objRefs').left = [];
}

/** Forgets every snapshot (the game calls it where its rules stop looking back, e.g. at the end of a turn); counters stay. */
export function clearLastKnown<T>(s: Draft<Tracked<T>>): void {
  if (Object.keys(s.objRefs.last).length > 0) own(s, 'objRefs').last = {};
}

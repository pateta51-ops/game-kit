// K113 (XMage MageObjectReference, LastKnownInformationTest): references go stale on a zone change; snapshots by ref and by zone.
import { afterEach, describe, expect, it } from 'vitest';
import { applyAction, applyActionWith, clearLastKnown, clearLeft, createGame, draftOf, hasLeft, isCurrent, lastKnown, lastKnownIn, leaveZone, newObjectTrack, refOf, setCowChecks, setStateFreezing, type Ctx, type Draft, type ObjectTrack, type Tracked } from './index.ts';
import { CONTENT, COUNTER, type Counter, type CounterState } from './fake/counter.ts';

interface Unit {
  readonly power: number;
}
const fresh = (): Draft<Tracked<Unit>> => ({ objRefs: newObjectTrack<Unit>() });

describe('object references', () => {
  it('a reference goes stale when its object changes zone; the snapshot answers for it', () => {
    const s = fresh();
    const r0 = refOf(s, 'u1');
    expect(r0).toEqual({ id: 'u1', zcc: 0 });
    expect(lastKnown(s, r0)).toBeUndefined();
    const r1 = leaveZone(s, 'u1', 'play', { power: 3 });
    expect(isCurrent(s, r0)).toBe(false);
    expect(isCurrent(s, r1)).toBe(true);
    expect(lastKnown(s, r0)).toEqual({ id: 'u1', zcc: 0, zone: 'play', obj: { power: 3 } });
    leaveZone(s, 'u1', 'discard', { power: 1 });
    leaveZone(s, 'u1', 'play', { power: 5 });
    expect(lastKnownIn(s, 'u1', 'play')?.obj.power).toBe(5);
    expect(lastKnownIn(s, 'u1', 'discard')?.zcc).toBe(1);
    expect(lastKnownIn(s, 'u1', 'hand')).toBeUndefined();
    expect(lastKnown(s, r0)?.obj.power).toBe(3);
  });

  it('survives a JSON round trip and resolves the same', () => {
    const s = fresh();
    const r0 = refOf(s, 'u1');
    const r1 = leaveZone(s, 'u1', 'play', { power: 3 });
    const back = JSON.parse(JSON.stringify(s)) as Tracked<Unit>;
    expect(back).toEqual(s);
    expect(isCurrent(back, r0)).toBe(false);
    expect(isCurrent(back, r1)).toBe(true);
    expect(lastKnown(back, r0)).toEqual(lastKnown(s, r0));
    expect(lastKnownIn(back, 'u1', 'play')).toEqual(lastKnownIn(s, 'u1', 'play'));
    expect(hasLeft(back, 'u1', 'play')).toBe(true);
  });

  it('short-living set and forgetting', () => {
    const s = fresh();
    leaveZone(s, 'u1', 'play', { power: 3 });
    leaveZone(s, 'u1', 'play', { power: 4 });
    expect(s.objRefs.left).toEqual(['play:u1']);
    expect(hasLeft(s, 'u1', 'play')).toBe(true);
    expect(hasLeft(s, 'u1', 'hand')).toBe(false);
    clearLeft(s);
    expect(hasLeft(s, 'u1', 'play')).toBe(false);
    clearLastKnown(s);
    expect(lastKnown(s, { id: 'u1', zcc: 0 })).toBeUndefined();
    expect(refOf(s, 'u1').zcc).toBe(2);
  });
});

describe('inside an action (copy on write)', () => {
  afterEach(() => {
    setCowChecks(false);
    setStateFreezing(false);
  });
  type T = CounterState & { readonly objRefs: ObjectTrack<Unit> };
  it('writes through the barrier; the input state is unchanged and a game without objRefs behaves the same', () => {
    setCowChecks(true);
    setStateFreezing(true);
    const base = createGame(COUNTER, { seed: 'k113' }, { target: 1000 }, CONTENT).state;
    const s0 = { ...base, objRefs: newObjectTrack<Unit>() } as T;
    const action = { kind: 'answer' as const, promptId: s0.prompt?.id ?? -1, picks: ['add'] };
    const chosen = COUNTER.handlers['chosen'];
    const table = {
      ...COUNTER.handlers,
      chosen: (ctx: Ctx<Counter>, task: Counter['task']) => {
        const s = draftOf(ctx) as unknown as Draft<T>;
        clearLeft(s);
        leaveZone(s, 'u1', 'play', { power: 2 });
        chosen?.(ctx, task);
      },
    };
    const r = applyActionWith(COUNTER, s0, action, CONTENT, table).state as T;
    expect(s0.objRefs).toEqual(newObjectTrack());
    expect(lastKnown(r, { id: 'u1', zcc: 0 })?.obj.power).toBe(2);
    expect(hasLeft(r, 'u1', 'play')).toBe(true);
    const plain = applyAction(COUNTER, base, action, CONTENT).state;
    expect(plain).not.toHaveProperty('objRefs');
    expect({ ...r, objRefs: undefined }).toEqual({ ...plain, objRefs: undefined });
  });
});

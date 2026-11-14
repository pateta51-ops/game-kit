// The copy-on-write barrier and the working copy (ported from Warp's Edge). An action copies only what
// it writes to; the input state never changes.
import { describe, expect, it } from 'vitest';
import { adopt, closeDraft, copyJson, copyList, deepFreeze, EngineBugError, hashValue, openDraft, own, setCowChecks, type Draft } from './index';
import { bareState, type CounterState } from './fake/counter';

describe('write barrier (cow.ts)', () => {
  it('copies a container once per action, and returns the same copy afterwards', () => {
    const s = bareState();
    deepFreeze(s);
    const draft = { ...s } as Draft<CounterState>;
    const prev = openDraft(draft, false);
    try {
      const first = own(draft, 'rng');
      expect(first).not.toBe(s.rng);
      expect(first).toEqual(s.rng);
      expect(own(draft, 'rng')).toBe(first);
      first.a = 1; // writable: the copy is the action's own
      expect(s.rng.a).not.toBe(1);
    } finally {
      closeDraft(prev);
    }
  });

  it('returns the container itself outside an action (the caller owns all of it)', () => {
    const s = bareState();
    expect(own(s, 'rng')).toBe(s.rng);
  });

  it('adopt marks a new object as owned, so a later barrier does not copy it again', () => {
    const parent: { list: number[] } = { list: [] };
    const prev = openDraft(parent, false);
    try {
      const fresh = adopt([1, 2]);
      parent.list = fresh;
      expect(own(parent, 'list')).toBe(fresh);
    } finally {
      closeDraft(prev);
    }
  });

  it('in check mode, a barrier on a parent the action does not own is an engine bug', () => {
    const shared = { inner: { x: 1 } };
    const mine = { shared };
    const prev = openDraft(mine, false);
    setCowChecks(true);
    try {
      expect(() => own(shared, 'inner')).toThrow(EngineBugError);
    } finally {
      setCowChecks(false);
      closeDraft(prev);
    }
  });

  it('copyList copies a frozen list as well as a plain one', () => {
    const frozen = Object.freeze([1, 2, 3]);
    const copy = copyList(frozen);
    expect(copy).toEqual([1, 2, 3]);
    expect(Object.isFrozen(copy)).toBe(false);
    expect(copyList([4, 5])).toEqual([4, 5]);
  });
});

describe('copyJson (copy.ts)', () => {
  it('copies plain JSON deeply, with the same keys and order, and hashes the same', () => {
    const s = { ...bareState('copy'), stack: [{ kind: 'a', data: { n: [1, { m: 2 }] } }] };
    const copy = copyJson(s);
    expect(copy).toEqual(s);
    expect(copy).not.toBe(s);
    expect(copy.stack[0]).not.toBe(s.stack[0]);
    expect(Object.keys(copy)).toEqual(Object.keys(s));
    expect(hashValue(copy)).toBe(hashValue(s));
  });
});

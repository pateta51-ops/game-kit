import { describe, expect, it } from 'vitest';
import {
  bindHoverHold,
  createHoverHold,
  createInspect,
  createSelection,
  createToasts,
  onlyForcedAnswer,
  picksFor,
  probedAnswer,
  type Timers,
} from './index.ts';

function fakeTimers(): Timers & { advance: (ms: number) => void; pending: () => number } {
  let now = 0;
  let seq = 0;
  const jobs = new Map<number, { at: number; fn: () => void }>();
  return {
    set(fn, ms) {
      seq += 1;
      jobs.set(seq, { at: now + ms, fn });
      return seq;
    },
    clear(id) {
      if (typeof id === 'number') jobs.delete(id);
    },
    advance(ms) {
      now += ms;
      for (const [id, job] of [...jobs].sort((a, b) => a[1].at - b[1].at)) {
        if (job.at > now || !jobs.has(id)) continue;
        jobs.delete(id);
        job.fn();
      }
    },
    pending: () => jobs.size,
  };
}

describe('hover hold', () => {
  it('is not held until started, then held until the pointer moves 3 px', () => {
    const h = createHoverHold();
    expect(h.held()).toBe(false);
    h.move(100, 100);
    h.start();
    expect(h.held()).toBe(true);
    h.move(101, 101);
    expect(h.held()).toBe(true);
    h.move(103, 100);
    expect(h.held()).toBe(false);
  });

  it('started before any move, the first move releases it', () => {
    const h = createHoverHold();
    h.start();
    expect(h.held()).toBe(true);
    h.move(0, 0);
    expect(h.held()).toBe(false);
  });

  it('takes the distance as an option and measures from where it was started', () => {
    const h = createHoverHold(10);
    h.move(0, 0);
    h.start();
    h.move(6, 0);
    h.move(0, 6);
    expect(h.held()).toBe(true);
    h.move(6, 8);
    expect(h.held()).toBe(false);
  });

  it('binds to a target in the capture phase and unbinds', () => {
    const h = createHoverHold();
    const calls: string[] = [];
    const fns: ((e: { clientX: number; clientY: number }) => void)[] = [];
    const off = bindHoverHold(h, {
      addEventListener(type, fn, capture) {
        calls.push(`add ${type} ${String(capture)}`);
        fns.push(fn);
      },
      removeEventListener(type, fn, capture) {
        calls.push(`remove ${type} ${String(capture)} ${String(fn === fns[0])}`);
      },
    });
    h.start();
    fns[0]?.({ clientX: 5, clientY: 5 });
    expect(h.held()).toBe(false);
    off();
    expect(calls).toEqual(['add pointermove true', 'remove pointermove true true']);
    // compiles: a browser window is a target
    if (typeof window !== 'undefined') bindHoverHold(h, window)();
  });
});

describe('hover-rest inspector', () => {
  it('opens only after the pointer rests', () => {
    const t = fakeTimers();
    const s = createInspect<string>({ timers: t });
    s.getState().open('tile-a');
    t.advance(699);
    expect(s.getState().target).toBeNull();
    t.advance(1);
    expect(s.getState().target).toBe('tile-a');
  });

  it('moving to another piece restarts the rest; leaving cancels it', () => {
    const t = fakeTimers();
    const s = createInspect<string>({ timers: t, openMs: 100, closeMs: 10 });
    s.getState().open('tile-a');
    t.advance(60);
    s.getState().open('tile-b');
    t.advance(60);
    expect(s.getState().target).toBeNull();
    t.advance(40);
    expect(s.getState().target).toBe('tile-b');
    s.getState().closeNow();
    s.getState().open('tile-a');
    s.getState().close();
    t.advance(1000);
    expect(s.getState().target).toBeNull();
    expect(t.pending()).toBe(0);
  });

  it('openNow opens at once and drops a waiting open', () => {
    const t = fakeTimers();
    const s = createInspect<string>({ timers: t });
    s.getState().open('tile-a');
    s.getState().openNow('tile-b');
    expect(s.getState().target).toBe('tile-b');
    t.advance(5000);
    expect(s.getState().target).toBe('tile-b');
  });

  it('closes a moment after leaving, unless held; closeNow closes at once', () => {
    const t = fakeTimers();
    const s = createInspect<string>({ timers: t });
    s.getState().openNow('tile-a');
    s.getState().close();
    t.advance(179);
    expect(s.getState().target).toBe('tile-a');
    t.advance(1);
    expect(s.getState().target).toBeNull();
    s.getState().openNow('tile-a');
    s.getState().close();
    s.getState().hold();
    t.advance(5000);
    expect(s.getState().target).toBe('tile-a');
    s.getState().close();
    s.getState().closeNow();
    expect(s.getState().target).toBeNull();
    expect(t.pending()).toBe(0);
  });

  it('a waiting open cancels a waiting close when it fires', () => {
    const t = fakeTimers();
    const s = createInspect<string>({ timers: t, openMs: 50, closeMs: 100 });
    s.getState().openNow('tile-a');
    s.getState().close();
    s.getState().open('tile-b');
    t.advance(500);
    expect(s.getState().target).toBe('tile-b');
  });
});

describe('toasts', () => {
  it('a toast goes away by itself; one with a title stays until dismissed', () => {
    const t = fakeTimers();
    const s = createToasts<'info' | 'warn'>({ timers: t });
    const a = s.getState().push({ text: 'Saved', tone: 'info' });
    const b = s.getState().push({ text: 'Last round', tone: 'warn', title: 'Round 9' });
    expect([a, b]).toEqual([1, 2]);
    t.advance(5999);
    expect(s.getState().toasts.map((x) => x.id)).toEqual([1, 2]);
    t.advance(1);
    expect(s.getState().toasts).toEqual([{ id: 2, text: 'Last round', tone: 'warn', title: 'Round 9' }]);
    t.advance(60_000);
    expect(s.getState().toasts).toHaveLength(1);
    s.getState().dismiss(b);
    expect(s.getState().toasts).toEqual([]);
  });

  it('keeps at most max, oldest out first, and drops the timers of the ones pushed out', () => {
    const t = fakeTimers();
    const s = createToasts({ timers: t, max: 2, ms: 100 });
    for (const text of ['a', 'b', 'c']) s.getState().push({ text, tone: 'info' });
    expect(s.getState().toasts.map((x) => x.text)).toEqual(['b', 'c']);
    expect(t.pending()).toBe(2);
  });

  it('dismiss and clear drop their timers; ids are never reused; an unknown id is ignored', () => {
    const t = fakeTimers();
    const s = createToasts({ timers: t });
    const a = s.getState().push({ text: 'a', tone: 'info' });
    s.getState().push({ text: 'b', tone: 'info' });
    s.getState().dismiss(a);
    s.getState().dismiss(99);
    expect(t.pending()).toBe(1);
    s.getState().clear();
    expect(s.getState().toasts).toEqual([]);
    expect(t.pending()).toBe(0);
    expect(s.getState().push({ text: 'c', tone: 'info' })).toBe(3);
    s.getState().clear();
    s.getState().clear();
    expect(t.pending()).toBe(0);
  });

  it('max 0 shows nothing and starts no timer', () => {
    const t = fakeTimers();
    const s = createToasts({ timers: t, max: 0 });
    s.getState().push({ text: 'a', tone: 'info' });
    expect(s.getState().toasts).toEqual([]);
    expect(t.pending()).toBe(0);
  });
});

describe('selection bound to a store version', () => {
  const scope = { version: 4, promptId: 7, max: 2 };

  it('goes empty, some, full; a pick beyond max is ignored; unpicking goes back', () => {
    const s = createSelection<string>();
    expect(s.getState().selection).toEqual({ status: 'empty' });
    s.getState().toggle(scope, 'x');
    expect(s.getState().selection).toEqual({ status: 'some', version: 4, promptId: 7, picks: ['x'] });
    s.getState().toggle(scope, 'y');
    expect(s.getState().selection.status).toBe('full');
    s.getState().toggle(scope, 'z');
    expect(picksFor(s.getState().selection, scope)).toEqual(['x', 'y']);
    s.getState().toggle(scope, 'x');
    expect(s.getState().selection).toEqual({ status: 'some', version: 4, promptId: 7, picks: ['y'] });
    s.getState().toggle(scope, 'y');
    expect(s.getState().selection).toEqual({ status: 'empty' });
  });

  it('never survives another version or a returning prompt id', () => {
    const s = createSelection<string>();
    s.getState().toggle(scope, 'x');
    s.getState().toggle(scope, 'y');
    expect(picksFor(s.getState().selection, { version: 5, promptId: 7 })).toEqual([]);
    expect(picksFor(s.getState().selection, { version: 4, promptId: 8 })).toEqual([]);
    s.getState().toggle({ version: 5, promptId: 7, max: 2 }, 'z');
    expect(s.getState().selection).toEqual({ status: 'some', version: 5, promptId: 7, picks: ['z'] });
    expect(picksFor(s.getState().selection, scope)).toEqual([]);
  });

  it('reset empties it, and keeps the same object when already empty', () => {
    const s = createSelection<number>();
    const before = s.getState().selection;
    s.getState().reset();
    expect(s.getState().selection).toBe(before);
    s.getState().toggle({ version: 1, promptId: 'p', max: 1 }, 3);
    expect(s.getState().selection.status).toBe('full');
    s.getState().reset();
    expect(s.getState().selection).toEqual({ status: 'empty' });
  });

  it('max 0 takes nothing', () => {
    const s = createSelection<string>();
    s.getState().toggle({ version: 1, promptId: 1, max: 0 }, 'x');
    expect(s.getState().selection).toEqual({ status: 'empty' });
  });
});

describe('obvious answer', () => {
  const opt = (id: string, enabled: boolean): { id: string; enabled: boolean } => ({ id, enabled });

  it('answers only a forced prompt with exactly one enabled option', () => {
    expect(onlyForcedAnswer({ min: 1, options: [opt('a', false), opt('b', true)] }, true)).toEqual(['b']);
    expect(onlyForcedAnswer({ min: 1, options: [opt('a', true), opt('b', true)] }, true)).toBeNull();
    expect(onlyForcedAnswer({ min: 0, options: [opt('a', true)] }, true)).toBeNull();
    expect(onlyForcedAnswer({ min: 1, options: [opt('a', false)] }, true)).toBeNull();
    expect(onlyForcedAnswer({ min: 1, options: [] }, true)).toBeNull();
  });

  it('never with the setting off or for a prompt on the game never-list', () => {
    const p = { min: 1, options: [opt('a', true)] };
    expect(onlyForcedAnswer(p, false)).toBeNull();
    expect(onlyForcedAnswer(p, true, true)).toBeNull();
    expect(onlyForcedAnswer(p, true, false)).toEqual(['a']);
  });

  it('probedAnswer gives the answer only when the engine accepts it and it costs nothing', () => {
    interface S {
      coins: number;
      step: number;
    }
    const s: S = { coins: 3, step: 0 };
    const cost = (a: S, b: S): string | null => (b.coins < a.coins ? 'coins' : null);
    expect(probedAnswer(s, 'go', (x) => ({ ...x, step: 1 }), cost)).toBe('go');
    expect(probedAnswer(s, 'pay', (x) => ({ ...x, coins: 2 }), cost)).toBeNull();
    expect(probedAnswer(s, 'bad', () => null, cost)).toBeNull();
    expect(
      probedAnswer(
        s,
        'boom',
        () => {
          throw new Error('illegal');
        },
        cost,
      ),
    ).toBeNull();
    expect(s).toEqual({ coins: 3, step: 0 });
  });
});

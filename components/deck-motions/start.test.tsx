import { afterEach, describe, expect, it, vi } from 'vitest';
import { dealFrom, finishDeckMotions } from './ui.ts';

const rect = { left: 0, top: 0, width: 10, height: 14 } as DOMRect;
const setup = () => {
  document.body.innerHTML = '<div data-pile="deck"><i></i></div><div id="slot"></div>';
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect);
  HTMLElement.prototype.animate = function () {
    let ok!: () => void;
    const finished = new Promise<Animation>((r) => { ok = () => { r(a); }; });
    const a = { finished, finish: () => { ok(); } } as unknown as Animation;
    return a;
  };
};
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); finishDeckMotions(); });

const slot = () => document.getElementById('slot');
const moves = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${String(i)}`, dir: 'out' as const, pile: 'deck', at: slot, faceDown: false }));
const run = (speed: number, signal?: AbortSignal) => {
  vi.useFakeTimers();
  setup();
  const got: [number, string, number][] = [];
  const t0 = Date.now();
  const d = dealFrom(moves(3), { speed, signal, onCardStart: (i, id) => { got.push([i, id, Date.now() - t0]); } });
  return { got, d };
};

describe('K402 onCardStart and signal', () => {
  it('fires each start at the plan stagger at speed 1 and 2', () => {
    for (const speed of [1, 2]) {
      const { got, d } = run(speed);
      vi.advanceTimersByTime(d.plan.total + 10);
      expect(got).toEqual(d.plan.timed.map((t, i) => [i, `c${String(i)}`, t.delay]));
      expect(d.plan.timed[1]?.delay).toBe(90 * speed);
      finishDeckMotions();
    }
  });
  it('fires all at once, in order, at speed 0', () => {
    const { got } = run(0);
    expect(got).toEqual([[0, 'c0', 0], [1, 'c1', 0], [2, 'c2', 0]]);
  });
  it('stops further starts on abort and ends at the end state', async () => {
    const ac = new AbortController();
    const { got, d } = run(1, ac.signal);
    expect(got).toHaveLength(1);
    ac.abort();
    vi.advanceTimersByTime(5000);
    expect(got).toHaveLength(1);
    await d.done;
    expect(document.querySelectorAll('[data-motion-standin]')).toHaveLength(0);
  });
  it('fires no start with a signal already aborted, at speed 1 or 0', () => {
    for (const speed of [1, 0]) {
      const ac = new AbortController();
      ac.abort();
      const { got, d } = run(speed, ac.signal);
      vi.advanceTimersByTime(d.plan.total + 10);
      expect(got).toEqual([]);
    }
  });
  it('still fires the start of a move whose place is missing, at its planned time', () => {
    vi.useFakeTimers();
    setup();
    const got: [number, number][] = [];
    const t0 = Date.now();
    const ms = [{ ...moves(1)[0]!, at: () => null }, ...moves(2).map((m, i) => ({ ...m, id: `d${String(i)}` }))];
    const d = dealFrom(ms, { speed: 1, onCardStart: (i) => { got.push([i, Date.now() - t0]); } });
    vi.advanceTimersByTime(d.plan.total + 10);
    expect(got).toEqual(d.plan.timed.map((t, i) => [i, t.delay]));
    expect(got).toHaveLength(3);
  });
});

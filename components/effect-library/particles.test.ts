// The pure parts of the canvas kit, and what each helper asks of a recording context (no pixels).
import { describe, expect, it } from 'vitest';
import { specTime } from './canvas';
import { arc, canDraw, ease, edge, embers, glow, impact, landing, noise, pulse, rng, seg, smoke, sparks, star } from './particles';

type Call = Parameters<typeof specTime>[1];

function rec(): { ctx: CanvasRenderingContext2D; calls: string[]; sets: Record<string, unknown[]>; n: (m: string) => number } {
  const calls: string[] = [];
  const sets: Record<string, unknown[]> = {};
  const ctx = new Proxy(
    {},
    {
      get:
        (_t, k) =>
        (...a: unknown[]) => {
          calls.push(`${String(k)}(${a.map((x) => (typeof x === 'number' ? x.toFixed(3) : String(x))).join(',')})`);
          return { addColorStop: () => undefined };
        },
      set: (_t, k, v) => {
        (sets[String(k)] ??= []).push(v);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, sets, n: (m) => calls.filter((c) => c.startsWith(`${m}(`)).length };
}

describe('particle kit: pure parts', () => {
  it('rng and noise are seeded and in range', () => {
    const a = rng(42);
    const b = rng(42);
    const xs = Array.from({ length: 50 }, () => a());
    expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(rng(43)()).not.toBe(rng(42)());
    expect(noise(3.7, 5)).toBe(noise(3.7, 5));
    for (let x = 0; x < 20; x += 0.37) expect(Math.abs(noise(x, 2))).toBeLessThanOrEqual(1);
  });
  it('seg, pulse and every easing start at 0 and end at 1', () => {
    expect([seg(0, 10, 20), seg(15, 10, 20), seg(99, 10, 20)]).toEqual([0, 0.5, 1]);
    expect([pulse(10, 10, 20), pulse(20, 10, 20)]).toEqual([0, 0]);
    expect(pulse(12.5, 10, 20)).toBeCloseTo(1);
    expect([seg(9, 10, 10), seg(10, 10, 10), seg(11, 10, 10), seg(5, 20, 10), seg(15, 20, 10)]).toEqual([0, 1, 1, 0, 1]);
    expect([pulse(9, 10, 10), pulse(10, 10, 10), pulse(11, 10, 10)]).toEqual([0, 0, 0]);
    for (const f of Object.values(ease)) {
      expect(f(0)).toBeCloseTo(0);
      expect(f(1)).toBeCloseTo(1);
    }
  });
  it('edge walks the perimeter of a box and wraps', () => {
    const box = { x: 0, y: 0, w: 100, h: 50 };
    expect(edge(box, 0.25, 0)).toEqual([75, 0]);
    expect(edge(box, 0.5, 0)).toEqual([100, 50]);
    expect(edge(box, 1.25, 0)).toEqual([75, 0]);
    expect(edge(box, -0.25, 2)).toEqual([25, 52]);
  });
  it('canDraw is false without a window', () => {
    expect(canDraw()).toBe(false);
  });
  it('specTime gives the spec time at any speed', () => {
    expect(specTime(50, { dur: 100, step: { dur: 200 } } as unknown as Call)).toBe(100);
    expect(specTime(50, { dur: 0, step: { dur: 0 } } as unknown as Call)).toBe(50);
  });
});

describe('particle kit: what a frame draws', () => {
  it('sparks: none before the start, all in flight, none after their life; the same seed gives the same frame', () => {
    const o = { seed: 7, n: 12, x: 100, y: 100, t0: 50 };
    const at = (t: number, seed = 7, u = 1, extra: { n?: number; color?: string } = {}) => {
      const r = rec();
      sparks(r.ctx, t, { ...o, seed, ...extra }, u);
      return r;
    };
    expect(at(50).n('stroke')).toBe(0);
    expect(at(150).n('stroke')).toBe(12);
    expect(at(600).n('stroke')).toBe(0);
    expect(at(150).calls).toEqual(at(150).calls);
    expect(at(150, 8).calls).not.toEqual(at(150).calls);
    expect(at(150, 7, 2).calls).not.toEqual(at(150).calls);
    expect([at(150).n('save'), at(150).n('restore')]).toEqual([1, 1]);
    expect(at(150, 7, 1, { n: 0 }).n('stroke')).toBe(0);
    expect(new Set(at(150, 7, 1, { color: 'rgba(1,2,3,1)' }).sets['strokeStyle'])).toEqual(new Set(['rgba(1,2,3,1)']));
  });
  it('embers and smoke: every mote while alive, none before or after', () => {
    const o = { seed: 3, n: 9, x: 0, y: 0, t0: 0 };
    for (const [f, mid, late] of [
      [embers, 300, 1400],
      [smoke, 400, 2000],
    ] as const) {
      const count = (t: number): number => {
        const r = rec();
        f(r.ctx, t, o);
        return r.n('fillRect');
      };
      expect([count(-1), count(mid), count(late)]).toEqual([0, 9, 0]);
    }
  });
  it('glow draws nothing at zero alpha or radius', () => {
    const r = rec();
    glow(r.ctx, 0, 0, 10, '1,2,3', 0);
    glow(r.ctx, 0, 0, 0, '1,2,3', 1);
    expect(r.calls).toEqual([]);
    glow(r.ctx, 5, 5, 10, '1,2,3', 1);
    expect(r.calls).toContain('fillRect(-5.000,-5.000,20.000,20.000)');
  });
  it('impact: a glow pop and sparks during the hit, nothing long after', () => {
    const a = rec();
    impact(a.ctx, 60, 10, 10, 0, '9,9,9', 5);
    expect([a.n('fillRect'), a.n('stroke')]).toEqual([2, 14]);
    const b = rec();
    impact(b.ctx, 900, 10, 10, 0, '9,9,9', 5);
    expect([b.n('fillRect'), b.n('stroke')]).toEqual([0, 0]);
  });
  it('landing: one ring inside its 260 ms only', () => {
    const r = rec();
    landing(r.ctx, 0, 0, 0, 0, '1,2,3');
    landing(r.ctx, 260, 0, 0, 0, '1,2,3');
    expect(r.calls).toEqual([]);
    landing(r.ctx, 100, 0, 0, 0, '1,2,3');
    expect(r.n('ellipse')).toBe(1);
    expect(String(r.sets['strokeStyle']?.[0])).toContain('rgba(1,2,3,0.55');
  });
  it('arc: three strokes and at most a fork, in the colour given, re-rolled per `hz`', () => {
    const at = (t: number) => {
      const r = rec();
      arc(r.ctx, t, 0, 0, 100, 0, { rgb: '1,2,3', seed: 4 });
      return r;
    };
    const a = at(10);
    expect(a.n('stroke')).toBeGreaterThanOrEqual(3);
    expect(a.n('stroke')).toBeLessThanOrEqual(4);
    expect(String(a.sets['strokeStyle']?.[0])).toContain('1,2,3');
    expect(at(20).calls).toEqual(a.calls);
    expect(at(100).calls).not.toEqual(a.calls);
    const plain = rec();
    arc(plain.ctx, 10, 0, 0, 100, 0, { fork: false });
    expect(plain.n('stroke')).toBe(3);
  });
  it('star: ten points in the colours given', () => {
    const r = rec();
    star(r.ctx, 0, 0, 10, 0, 0.5, '1,2,3', '4,5,6');
    expect([r.n('lineTo'), r.sets['fillStyle'], r.sets['shadowColor']]).toEqual([10, ['rgba(1,2,3,0.5)'], ['rgba(4,5,6,0.5)']]);
  });
});

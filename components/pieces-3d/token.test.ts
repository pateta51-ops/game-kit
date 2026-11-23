import { describe, expect, it } from 'vitest';
import { area, edgeColour, extrude, simplify, tokenSize, traceAlpha, type Pt } from './token.ts';

// synthetic alpha shapes: a disc, a hexagon, a non-convex notched shape (an L with a bite), drawn by an inside test per pixel
const W = 120, H = 100;
const img = (inside: (x: number, y: number) => boolean) => { const a = new Uint8ClampedArray(W * H * 4); for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) if (inside(x + 0.5, y + 0.5)) { const o = (y * W + x) * 4; a[o] = 200; a[o + 1] = 100; a[o + 2] = 50; a[o + 3] = 255; } return a; };
const poly = (P: Pt[]) => (x: number, y: number) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i] as Pt, [xj, yj] = P[j] as Pt; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const segD = (q: Pt, a: Pt, b: Pt) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy); };
const toPoly = (q: Pt, P: Pt[]) => Math.min(...P.map((a, i) => segD(q, a, P[(i + 1) % P.length] as Pt)));
const ngon = (n: number, cx: number, cy: number, r: number, k = 0): Pt[] => Array.from({ length: n }, (_, i) => [cx + r * Math.cos(k + (2 * Math.PI * i) / n), cy + r * Math.sin(k + (2 * Math.PI * i) / n)]);
const SHAPES: [string, Pt[]][] = [
  ['disc', ngon(256, 60, 50, 38)],
  ['hexagon', ngon(6, 60, 50, 40, Math.PI / 6)],
  ['non-convex', [[10, 10], [100, 10], [100, 40], [60, 40], [50, 60], [40, 40], [40, 90], [10, 90]]],
];
const both = (t: Pt[], P: Pt[]) => {
  // the traced pixel centres sit half a pixel inside the true edge; the simplified outline both ways within 2 px
  const tc = t.map(([x, y]) => [x + 0.5, y + 0.5] as Pt);
  const samples = P.flatMap((a, i) => { const b = P[(i + 1) % P.length] as Pt; return Array.from({ length: 20 }, (_, k) => [a[0] + ((b[0] - a[0]) * k) / 20, a[1] + ((b[1] - a[1]) * k) / 20] as Pt); });
  return [Math.max(...tc.map((q) => toPoly(q, P))), Math.max(...samples.map((q) => toPoly(q, tc)))];
};

describe('pieces-3d: extruded token (K718)', () => {
  for (const [name, P] of SHAPES) {
    it(`K718 the outline traced from a ${name}'s alpha matches the shape within 2 px (a pixel or two), and simplifies within 2 px with far fewer points`, () => {
      const a = img(poly(P)), t = traceAlpha(a, W, H), s = simplify(t);
      const [out, back] = both(t, P);
      expect(out).toBeLessThanOrEqual(2);
      expect(back).toBeLessThanOrEqual(2);
      const [so, sb] = both(s, P);
      expect(so).toBeLessThan(2);
      expect(sb).toBeLessThan(2);
      expect(s.length).toBeLessThan(t.length / 2);
      expect(new Set(t.map((q) => q.join())).size).toBe(t.length); // each boundary pixel once: the trace closed and stopped
      expect(Math.abs(Math.abs(area(s)) - Math.abs(area(P))) / Math.abs(area(P))).toBeLessThan(0.06);
    });
    it(`K718 the ${name}'s solid is closed: front and back n - 2 triangles, the side 2n, every edge in two triangles, opposite ways`, () => {
      const s = simplify(traceAlpha(img(poly(P)), W, H)), n = s.length, m = extrude(s, { w: W, h: H }, { w: 60, h: 50, d: 4 });
      expect(m.tris).toEqual({ front: n - 2, back: n - 2, side: 2 * n });
      expect(m.idx.length / 3).toBe(2 * (n - 2) + 2 * n);
      expect([...m.kind].filter((k) => k === 2).length).toBe(4 * n);
      const key = (i: number) => [0, 1, 2].map((c) => Math.round((m.pos[3 * i + c] ?? 0) * 1e4)).join();
      const edges = new Map<string, number>();
      for (let t = 0; t < m.idx.length; t += 3) for (let e = 0; e < 3; e += 1) {
        const a = key(m.idx[t + e] ?? 0), b = key(m.idx[t + ((e + 1) % 3)] ?? 0);
        edges.set(`${a}|${b}`, (edges.get(`${a}|${b}`) ?? 0) + 1);
      }
      for (const [k, c] of edges) { const [a, b] = k.split('|'); expect(c).toBe(1); expect(edges.get(`${b ?? ''}|${a ?? ''}`)).toBe(1); }
      // the front faces +z, the back -z: the triangles wind counter-clockwise seen from outside
      let fa = 0;
      for (let t = 0; t < m.idx.length; t += 3) {
        const [i, j, k] = [m.idx[t], m.idx[t + 1], m.idx[t + 2]].map((v) => v ?? 0) as [number, number, number], q = (v: number, c: number) => m.pos[3 * v + c] ?? 0;
        if (m.kind[i] === 0) fa += (q(j, 0) - q(i, 0)) * (q(k, 1) - q(i, 1)) - (q(j, 1) - q(i, 1)) * (q(k, 0) - q(i, 0));
      }
      expect(fa).toBeGreaterThan(0);
    });
  }

  it('K718 the size is mm x pxPerMm: the solid spans w x h and the thickness', () => {
    const sz = tokenSize({ w: 25, h: 20, thickness: 2 }, 3);
    expect(sz).toEqual({ w: 75, h: 60, d: 6 });
    const m = extrude(simplify(traceAlpha(img(poly(SHAPES[1]?.[1] ?? [])), W, H)), { w: W, h: H }, sz), r = (c: number) => { const v = [...m.pos].filter((_, i) => i % 3 === c); return Math.max(...v) - Math.min(...v); };
    expect(r(0)).toBeCloseTo(75, 5);
    expect(r(1)).toBeCloseTo(60, 5);
    expect(r(2)).toBeCloseTo(6, 5);
  });

  it('K718 the back maps the front seen through, or its own scan mirrored; the edge colour comes from the scan', () => {
    const s = simplify(traceAlpha(img(poly(SHAPES[2]?.[1] ?? [])), W, H)), a = extrude(s, { w: W, h: H }, { w: 1, h: 1, d: 1 }), b = extrude(s, { w: W, h: H }, { w: 1, h: 1, d: 1 }, true);
    const back = (m: typeof a) => [...m.kind].flatMap((k, i) => (k === 1 ? [m.uv[2 * i] ?? 0] : []));
    const fr = [...a.kind].flatMap((k, i) => (k === 0 ? [a.uv[2 * i] ?? 0] : []));
    expect(back(a)).toEqual(fr);
    expect(back(b).map((u) => +(1 - u).toFixed(6))).toEqual(fr.map((u) => +u.toFixed(6)));
    const d = img(poly(SHAPES[0]?.[1] ?? [])); expect(edgeColour(d, W, traceAlpha(d, W, H), 1)).toBe('#c86432');
  });
});

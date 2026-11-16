import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ID, apply, cube, front, mesh, rest, trapezohedron, tumble, turned } from './solids';
import { SEAM, chevronAt, chevronPoints, chevrons, flipRange, seamLineAt, offRest, rolled, turnOf, twoArcSeam } from './ball';

const TILT = (15 * Math.PI) / 180;
describe('pieces-3d: the code-built pieces', () => {
  it('the d6 cube shows the rolled value on its front face for 1 to 6, at rest and when a tumble or a turn ends', () => {
    const c = cube();
    for (let v = 1; v <= 6; v += 1) {
      expect(front(c, rest(c, v, TILT))).toBe(v);
      expect(front(c, tumble(c, v, TILT, 1, v * 3))).toBe(v);
      expect(front(c, turned(c, v, TILT, 0))).toBe(v);
      expect(apply(rest(c, v, TILT), c.faces[v - 1]?.up ?? [0, 0, 0])[1]).toBeGreaterThan(0.9); // upright
    }
    expect(c.faces.map((f, i) => c.faces.findIndex((g) => g.n.every((x, k) => x === -(f.n[k] ?? 0))) + i + 2)).toEqual([7, 7, 7, 7, 7, 7]);
    expect(tumble(c, 3, TILT, 0.3, 5)).not.toEqual(rest(c, 3, TILT));
  });
  it('the d10 is a ten-sided solid of ten kite faces and shows each of 1 to 10 on its face toward the player', () => {
    const d = trapezohedron();
    expect(d.faces).toHaveLength(10);
    for (const f of d.faces) for (const p of f.pts) expect(Math.abs((p[0] - f.pts[0]![0]) * f.n[0] + (p[1] - f.pts[0]![1]) * f.n[1] + (p[2] - f.pts[0]![2]) * f.n[2])).toBeLessThan(1e-9); // each kite is flat
    for (let v = 1; v <= 10; v += 1) {
      expect(front(d, rest(d, v, TILT))).toBe(v);
      expect(front(d, tumble(d, v, TILT, 1, v))).toBe(v);
    }
  });
  it('edges and corners are truly rounded in the shape (radius 12% of the side), with no vertex outside the sharp solid', () => {
    const c = cube(), m = mesh(c, 8);
    let far = 0, bent = 0;
    for (let i = 0; i < m.pos.length; i += 3) {
      const p = [m.pos[i] ?? 0, m.pos[i + 1] ?? 0, m.pos[i + 2] ?? 0], n = [m.nor[i] ?? 0, m.nor[i + 1] ?? 0, m.nor[i + 2] ?? 0];
      expect(Math.max(...p.map(Math.abs))).toBeLessThanOrEqual(1 + 1e-6);
      expect(Math.hypot(...n)).toBeCloseTo(1, 5);
      far = Math.max(far, Math.hypot(...p));
      if (n.filter((x) => Math.abs(x) > 0.05).length > 1) bent += 1;
    }
    expect(c.r / 2).toBeCloseTo(0.12, 5);
    expect(far).toBeCloseTo((1 - c.r) * Math.sqrt(3) + c.r, 3); // the corner is a sphere of the radius, not a point
    expect(bent).toBeGreaterThan(100);
    expect(mesh(trapezohedron(), 6).idx.length).toBe(10 * 6 * 6 * 6);
  });
  it('the ball makes one full turn per 345 px of travel and is back in its rest view after it', () => {
    expect(turnOf(345)).toBeCloseTo(2 * Math.PI, 10);
    rolled(ID, 345, 0).forEach((x, i) => { expect(x).toBeCloseTo(ID[i] ?? 0, 8); });
    expect(offRest(rolled(ID, 372, 0)).angle).toBeCloseTo(turnOf(27), 6); // 27 px past a full turn
    expect(apply(rolled(ID, 345 / 4, 0), [0, 0, 1])[0]).toBeCloseTo(1, 6); // rolling right carries the near point to the right
    expect(apply(rolled(ID, 0, 345 / 4), [0, 0, 1])[1]).toBeCloseTo(-1, 6); // rolling down the screen carries it down
  });
  it('the turn per distance follows the size and the travel per turn a game gives', () => {
    expect(turnOf(220, 70)).toBeCloseTo((2 * Math.PI * 220) / ((345 / 110) * 70), 10);
    expect(turnOf(Math.PI * 50, 50, Math.PI)).toBeCloseTo(2 * Math.PI, 10);
    rolled(ID, Math.PI * 50, 0, 50, Math.PI).forEach((x, i) => { expect(x).toBeCloseTo(ID[i] ?? 0, 8); });
    expect(offRest(ID).angle).toBe(0);
  });
  it('the seam is a closed curve on the unit sphere; a game may give its own point count', () => {
    expect(SEAM).toHaveLength(240);
    for (const p of twoArcSeam(60)) expect(Math.hypot(...p)).toBeCloseTo(1, 9);
    expect(twoArcSeam(60)).toHaveLength(60);
  });
  it('geometry counts: faces, vertices and triangles of each solid', () => {
    expect(cube().faces).toHaveLength(6);
    const m = mesh(cube(), 14);
    expect(m.pos.length / 3).toBe(6 * 15 * 15);
    expect(m.idx.length / 3).toBe(6 * 14 * 14 * 2);
    expect(m.uv.length / 2).toBe(m.pos.length / 3);
    expect(Math.max(...m.idx)).toBeLessThan(65536);
    expect(mesh(trapezohedron()).pos.length / 3).toBe(10 * 15 * 15);
  });
});

describe('pieces-3d: resting tilt', () => {
  it('p3-tilt tilts a static piece by --piece-tilt', () => {
    const css = readFileSync(new URL('./pieces3d.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.p3-tilt\{[^}]*rotateX\(var\(--piece-tilt,15deg\)\)/);
  });
  it('XD-63: 56 chevrons by default, 13+ on each visible arc at rest, every V symmetric with a 70-80 degree opening, pointing along the seam', () => {
    const { k, s } = chevrons(SEAM, 56), L = s[SEAM.length] ?? 0;
    expect(L).not.toBeCloseTo(2 * Math.PI, 1);
    expect(k.length).toBe(56);
    // visible arcs at rest: runs of stitches facing the viewer (+z)
    const vis = k.map((c) => c.A[2] > 0), runs: number[] = [];
    const start = vis.findIndex((v, i) => v && !vis[(i + 55) % 56]);
    for (let i = 0; i < 56; i += 1) { const j = (start + i) % 56; if (vis[j]) { if (!vis[(j + 55) % 56]) runs.push(0); runs[runs.length - 1] = (runs[runs.length - 1] ?? 0) + 1; } }
    expect(runs.length).toBe(2);
    for (const r of runs) expect(r).toBeGreaterThanOrEqual(13);
    const d = (a: readonly number[], b: readonly number[]) => Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0));
    for (const c of k) {
      const [A, e1, e2] = chevronPoints(c), l1 = d(A, e1), l2 = d(A, e2);
      expect(Math.abs(l1 - l2)).toBeLessThan(1e-9);
      expect(l1).toBeCloseTo(d(chevronPoints(k[0]!)[0], chevronPoints(k[0]!)[1]), 9);
      const v1 = e1.map((x, i) => x - (A[i] ?? 0)), v2 = e2.map((x, i) => x - (A[i] ?? 0)), ang = (Math.acos(v1.reduce((m, x, i) => m + x * (v2[i] ?? 0), 0) / (l1 * l2)) * 180) / Math.PI;
      expect(ang).toBeGreaterThan(70); expect(ang).toBeLessThan(80);
      // apex points along the seam: the arms' mid lies behind the apex on -T, not across it
      const mid = [0, 1, 2].map((i) => ((e1[i] ?? 0) + (e2[i] ?? 0)) / 2 - (A[i] ?? 0)), dt = mid.reduce((m, x, i) => m + x * (c.T[i] ?? 0), 0), dn = mid.reduce((m, x, i) => m + x * (c.N[i] ?? 0), 0);
      expect(dt).toBeLessThan(0); expect(Math.abs(dn)).toBeLessThan(1e-9);
    }
    // drawn: the apex and both arm ends are inked, the middle between neighbours and far off the seam are not
    const near = (p: readonly number[]) => SEAM.reduce((b, q, i) => (q[0] * (p[0] ?? 0) + q[1] * (p[1] ?? 0) + q[2] * (p[2] ?? 0) > (SEAM[b] as readonly number[]).reduce((m, x, j) => m + x * (p[j] ?? 0), 0) ? i : b), 0);
    const [A, e1, e2] = chevronPoints(k[5]!);
    for (const p of [A, e1, e2]) expect(chevronAt(SEAM, near(p), p)).toBeGreaterThan(0.9);
    const far: [number, number, number] = [A[0] + 0.3 * k[5]!.N[0], A[1] + 0.3 * k[5]!.N[1], A[2] + 0.3 * k[5]!.N[2]];
    expect(chevronAt(SEAM, near(far), far)).toBe(0);
    expect(chevronAt(SEAM, 0, SEAM[0]!, 28)).toBeGreaterThanOrEqual(0); // count is a look option
  });
  it('XD-63: stitchFlip points the two seam halves opposite ways, switching at the far points; stitchWidth and seamLine honoured', () => {
    const a = chevrons(SEAM, 56).k, fl = flipRange(true)!, b = chevrons(SEAM, 56, fl).k, n = SEAM.length;
    expect(fl).toEqual([0.25, 0.75]);
    // switch points are the seam points furthest from the viewer at rest
    expect(SEAM[n / 4]![2]).toBeCloseTo(Math.min(...SEAM.map((p) => p[2])), 3);
    expect(SEAM[(3 * n) / 4]![2]).toBeCloseTo(Math.min(...SEAM.map((p) => p[2])), 3);
    let flipped = 0;
    a.forEach((c, j) => {
      const dot = c.T.reduce((m, x, i) => m + x * (b[j]!.T[i] ?? 0), 0);
      expect(b[j]!.A).toEqual(c.A);
      expect(Math.abs(Math.abs(dot) - 1)).toBeLessThan(1e-12);
      if (dot < 0) flipped += 1;
      // identical V apart from direction
      const d = (p: readonly number[], q: readonly number[]) => Math.hypot(...p.map((x, i) => x - (q[i] ?? 0)));
      const [A1, e1] = chevronPoints(c), [A2, e2] = chevronPoints(b[j]!);
      expect(d(A2, e2)).toBeCloseTo(d(A1, e1), 9);
    });
    expect(flipped).toBe(28);
    // the two visible arcs (around curve index 0 and n/2) now point the same screen way
    const top = b[0]!, bot = b[28]!;
    expect(top.T[0] * bot.T[0] + top.T[1] * bot.T[1]).toBeGreaterThan(0);
    const ua = a[0]!, ub = a[28]!;
    expect(ua.T[0] * ub.T[0] + ua.T[1] * ub.T[1]).toBeLessThan(0);
    // drawn with the flip: arm ends inked
    for (const j of [3, 20]) for (const p of chevronPoints(b[j]!)) { const at = SEAM.reduce((m, q, i) => (q[0] * p[0] + q[1] * p[1] + q[2] * p[2] > SEAM[m]![0] * p[0] + SEAM[m]![1] * p[1] + SEAM[m]![2] * p[2] ? i : m), 0); expect(chevronAt(SEAM, at, p, 56, undefined, fl)).toBeGreaterThan(0.9); }
    // width: half-width 0.12, same opening
    const [A, e1, e2] = chevronPoints(a[5]!, 0.12), [, f1] = chevronPoints(a[5]!);
    const N = a[5]!.N, across = (e: readonly number[]) => Math.abs(e.reduce((m, x, i) => m + (x - (A[i] ?? 0)) * (N[i] ?? 0), 0));
    expect(across(e1) / across(f1)).toBeCloseTo(0.12 / 0.14, 1); // projection onto the sphere bends it slightly
    expect(across(e2)).toBeCloseTo(across(e1), 9);
    // seam line: through the apex and between samples, not 0.05 off
    expect(seamLineAt(SEAM, 0, a[0]!.A, 0.01)).toBe(1);
    const m: [number, number, number] = [0, 1, 2].map((i) => (SEAM[10]![i]! + SEAM[11]![i]!) / 2) as [number, number, number];
    expect(seamLineAt(SEAM, 10, m, 0.01)).toBe(1);
    const off: [number, number, number] = [m[0] + 0.05 * a[0]!.N[0], m[1] + 0.05 * a[0]!.N[1], m[2] + 0.05 * a[0]!.N[2]];
    expect(seamLineAt(SEAM, 10, off, 0.01)).toBe(0);
  });
});

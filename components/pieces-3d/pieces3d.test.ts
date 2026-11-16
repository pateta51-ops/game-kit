import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ID, apply, cube, front, mesh, rest, trapezohedron, tumble, turned } from './solids';
import { SEAM, chevronAt, offRest, rolled, turnOf, twoArcSeam } from './ball';

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
  it('XD-63: chevron stitches are 28 V marks along the seam, none on a gap, all pointing the same way, with no line along it', () => {
    const n = SEAM.length, at = (i: number) => chevronAt(SEAM, i, SEAM[i] as [number, number, number]);
    const on = SEAM.map((_, i) => at(i) > 0.5), rises = on.filter((b, i) => b && !on[(i + n - 1) % n]).length;
    expect(rises).toBe(28);
    expect(on.filter(Boolean).length).toBeLessThan(n / 4); // marks, not a line
    // off the seam by the half width, a stitch shows only where the V's arms end, again once per period, and not on the other side's vertex
    const [p0, p1, p2] = SEAM[0] as [number, number, number], [q0, q1, q2] = SEAM[1] as [number, number, number], t0 = q0 - p0, t1 = q1 - p1, t2 = q2 - p2, h = Math.hypot(t0, t1, t2);
    const s0 = (p1 * t2 - p2 * t1) / h, s1 = (p2 * t0 - p0 * t2) / h, s2 = (p0 * t1 - p1 * t0) / h;
    const o = (u: number, w: number): [number, number, number] => { const r0 = p0 + u * s0 + (w * t0) / h, r1 = p1 + u * s1 + (w * t1) / h, r2 = p2 + u * s2 + (w * t2) / h, l = Math.hypot(r0, r1, r2); return [r0 / l, r1 / l, r2 / l]; };
    const arm = (u: number) => Array.from({ length: 200 }, (_, k) => chevronAt(SEAM, 0, o(u, (k - 100) * 0.0015))).some((x) => x > 0.9);
    expect(arm(0.14)).toBe(true); expect(arm(-0.14)).toBe(true); expect(arm(0.3)).toBe(false);
  });
});

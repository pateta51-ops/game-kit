// Code-built solids with truly rounded edges and corners: a cube and a ten-sided die (pentagonal trapezohedron).
// Pure: no DOM, nothing of any game. A face's index + 1 is its printed value.
export type V3 = readonly [number, number, number];
/** 3x3, row-major */
export type M3 = readonly number[];
export interface Face { pts: V3[]; n: V3; up: V3; c: V3 }
export interface Solid { faces: Face[]; r: number; reach: number; cols: number; rows: number }
export interface Mesh { pos: Float32Array; nor: Float32Array; uv: Float32Array; idx: Uint16Array }

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const apply = (m: M3, v: V3): V3 => [(m[0] ?? 0) * v[0] + (m[1] ?? 0) * v[1] + (m[2] ?? 0) * v[2], (m[3] ?? 0) * v[0] + (m[4] ?? 0) * v[1] + (m[5] ?? 0) * v[2], (m[6] ?? 0) * v[0] + (m[7] ?? 0) * v[1] + (m[8] ?? 0) * v[2]];
export const mmul = (a: M3, b: M3): M3 => Array.from({ length: 9 }, (_, i) => [0, 1, 2].reduce((s, k) => s + (a[3 * Math.floor(i / 3) + k] ?? 0) * (b[3 * k + (i % 3)] ?? 0), 0));
export const transpose = (m: M3): M3 => [0, 3, 6, 1, 4, 7, 2, 5, 8].map((i) => m[i] ?? 0);
export const ID: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
export const rotX = (a: number): M3 => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
export const rotY = (a: number): M3 => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
export const rotAxis = (u: V3, a: number): M3 => {
  const [x, y, z] = norm(u), c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
};

function face(pts: V3[], apex?: V3): Face {
  const c = mul(pts.reduce(add, [0, 0, 0]), 1 / pts.length);
  let n = norm(cross(sub(pts[1] as V3, pts[0] as V3), sub(pts[2] as V3, pts[0] as V3)));
  if (dot(n, c) < 0) { pts = [...pts].reverse(); n = mul(n, -1); }
  const t = apex ? sub(apex, c) : Math.abs(n[1]) > 0.5 ? [0, 0, 1] as V3 : [0, 1, 0] as V3;
  return { pts, n, c, up: norm(sub(t, mul(n, dot(t, n)))) };
}
const finish = (faces: Face[], r: number, cols: number): Solid => ({ faces, r, cols, rows: Math.ceil(faces.length / cols), reach: Math.max(...faces.flatMap((f) => f.pts.map((p) => Math.hypot(...p)))) });

/** A cube of side 2; opposite faces add to 7; `r` about 12% of the side. */
export function cube(r = 0.24): Solid {
  const N: V3[] = [[0, 0, 1], [0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, -1, 0], [0, 0, -1]];
  return finish(N.map((n) => {
    const u: V3 = Math.abs(n[1]) > 0.5 ? [0, 0, 1] : [0, 1, 0], x = cross(u, n);
    return face([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a = 0, b = 0]) => add(n, add(mul(x, a), mul(u, b)))));
  }), r, 4);
}
/** Ten identical kite faces around two apexes; belt radius 1. */
export function trapezohedron(r = 0.1, h = 1.05): Solid {
  const k = Math.cos(Math.PI / 5), c = (h * (1 - k)) / (1 + k);
  const belt = (i: number): V3 => { const a = (i * Math.PI) / 5; return [Math.cos(a), Math.sin(a), i % 2 ? c : -c]; };
  return finish(Array.from({ length: 10 }, (_, i) => { const apex: V3 = [0, 0, i % 2 ? -h : h]; return face([apex, belt(i - 1), belt(i), belt(i + 1)], apex); }), r, 4);
}

// the closest point of triangle abc to p (Ericson, Real-Time Collision Detection 5.1.5)
function closest(p: V3, a: V3, b: V3, c: V3): V3 {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, mul(ab, d1 / (d1 - d3)));
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, mul(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, mul(sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6))));
  const k = 1 / (va + vb + vc);
  return add(a, add(mul(ab, vb * k), mul(ac, vc * k)));
}

/** The rounded surface: every point of the sharp solid is pulled onto the solid shrunk by `r` and pushed out by `r` again. */
export function mesh(s: Solid, n = 14): Mesh {
  const d = dot(s.faces[0]?.n ?? [0, 0, 1], s.faces[0]?.pts[0] ?? [0, 0, 1]), k = (d - s.r) / d;
  const tris = s.faces.flatMap((f) => { const q = f.pts.map((p) => mul(p, k)); return [[q[0], q[1], q[2]], [q[0], q[2], q[3]]] as [V3, V3, V3][]; });
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const w = (i: number) => 0.5 - 0.5 * Math.cos((Math.PI * i) / n); // more rows near the edges, where the surface bends
  s.faces.forEach((f, fi) => {
    const [a, b, c, e] = f.pts as [V3, V3, V3, V3], x = cross(f.up, f.n), base = pos.length / 3;
    const ext = Math.max(...f.pts.flatMap((p) => [Math.abs(dot(sub(p, f.c), x)), Math.abs(dot(sub(p, f.c), f.up))]));
    for (let j = 0; j <= n; j += 1) for (let i = 0; i <= n; i += 1) {
      const u = w(i), v = w(j);
      const p = add(add(mul(a, (1 - u) * (1 - v)), mul(b, u * (1 - v))), add(mul(c, u * v), mul(e, (1 - u) * v)));
      let q: V3 = [0, 0, 0], best = Infinity;
      for (const t of tris) { const z = closest(p, t[0], t[1], t[2]), l = Math.hypot(...sub(p, z)); if (l < best) { best = l; q = z; } }
      const m = norm(sub(p, q)), o = add(q, mul(m, s.r));
      pos.push(...o); nor.push(...m);
      uv.push(((fi % s.cols) + 0.5 + (0.48 * dot(sub(p, f.c), x)) / ext) / s.cols, (Math.floor(fi / s.cols) + 0.5 - (0.48 * dot(sub(p, f.c), f.up)) / ext) / s.rows);
    }
    for (let j = 0; j < n; j += 1) for (let i = 0; i < n; i += 1) { const o = base + j * (n + 1) + i; idx.push(o, o + 1, o + n + 2, o, o + n + 2, o + n + 1); }
  });
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uv), idx: new Uint16Array(idx) };
}

/** The turn that brings a value's face toward the viewer (+z), its top up. */
export const faceUp = (s: Solid, value: number): M3 => { const f = s.faces[value - 1] ?? s.faces[0]; return f ? [...cross(f.up, f.n), ...f.up, ...f.n] : ID; };
/** At rest: the value toward the player, tipped back by `tilt` so the near side shows under it. */
export const rest = (s: Solid, value: number, tilt: number): M3 => mmul(rotX(-tilt), faceUp(s, value));
/** The value of the face most toward the viewer. */
export const front = (s: Solid, m: M3): number => s.faces.reduce((b, f, i) => (apply(m, f.n)[2] > apply(m, (s.faces[b] as Face).n)[2] ? i : b), 0) + 1;
const rnd = (seed: number, i: number) => { const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return x - Math.floor(x); };
/** A tumble on the solid's own axes that lands on `value`: `p` 0 to 1. */
export function tumble(s: Solid, value: number, tilt: number, p: number, seed = 1, turns = 2): M3 {
  const q = Math.min(1, Math.max(0, p)), left = (1 - q) ** 2;
  const axis: V3 = [rnd(seed, 1) - 0.5, rnd(seed, 2) - 0.5, (rnd(seed, 3) - 0.5) * 0.6];
  return mmul(rotX(-tilt), mmul(rotAxis(axis, left * turns * 2 * Math.PI), faceUp(s, value)));
}
/** A turn about the upright axis: `a` 0 is the face at rest. */
export const turned = (s: Solid, value: number, tilt: number, a: number): M3 => mmul(rotX(-tilt), mmul(rotY(a), faceUp(s, value)));

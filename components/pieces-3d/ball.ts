// A seamed ball as a true sphere, drawn on a small canvas from the sphere's equation and a seam curve computed in code.
// No model file, no dependency. The seams travel around the ball as it turns.
import { ID, mmul, rotAxis, transpose, type M3, type V3 } from './solids';

/** `curve`: points on the unit sphere along the seam (default `twoArcSeam()`); `perTurn`: px of travel per turn for each px across. */
export interface BallLook { leather: string; seam?: string; curve?: V3[] | undefined; stitch?: 'bars' | 'chevron'; stitchCount?: number }
// V half width 0.14 (14% of the diameter across), depth so the opening angle is 75 degrees
export const CHEV_HW = 0.14, CHEV_DEP = 0.14 / Math.tan((37.5 * Math.PI) / 180);
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v: V3): V3 => { const h = Math.hypot(...v); return [v[0] / h, v[1] / h, v[2] / h]; };
export interface Chevron { A: V3; T: V3; N: V3 }
const CH = new WeakMap<V3[], Map<number, { s: number[]; P: number; k: Chevron[] }>>();
/** Seam arc lengths (measured) and `count` evenly spaced stitches, each with an orthonormal frame: apex A on the seam, T along it, N = A x T across it. */
export const chevrons = (S: V3[], count: number): { s: number[]; P: number; k: Chevron[] } => {
  let m = CH.get(S); if (!m) { m = new Map(); CH.set(S, m); }
  let c = m.get(count);
  if (c) return c;
  const n = S.length, s = [0];
  for (let i = 1; i <= n; i += 1) { const a = S[i % n] as V3, b = S[i - 1] as V3; s.push((s[i - 1] ?? 0) + Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])); }
  const L = s[n] ?? 1, P = L / count, k: Chevron[] = [];
  let i = 0;
  for (let j = 0; j < count; j += 1) {
    const at = j * P; while ((s[i + 1] ?? L) < at) i += 1;
    const a = S[i] as V3, b = S[(i + 1) % n] as V3, f = (at - (s[i] ?? 0)) / ((s[i + 1] ?? L) - (s[i] ?? 0) || 1);
    const A = unit([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]), d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], q = d[0] * A[0] + d[1] * A[1] + d[2] * A[2];
    const T = unit([d[0] - q * A[0], d[1] - q * A[1], d[2] - q * A[2]]);
    k.push({ A, T, N: cross(A, T) });
  }
  c = { s, P, k }; m.set(count, c); return c;
};
/** The three points of stitch `j` on the unit sphere: apex, end of the +N arm, end of the -N arm. */
export const chevronPoints = (st: Chevron): [V3, V3, V3] => {
  const { A, T, N } = st, e = (sg: number): V3 => unit([A[0] + sg * CHEV_HW * N[0] - CHEV_DEP * T[0], A[1] + sg * CHEV_HW * N[1] - CHEV_DEP * T[1], A[2] + sg * CHEV_HW * N[2] - CHEV_DEP * T[2]]);
  return [A, e(1), e(-1)];
};
/** Chevron stitch coverage (0..1) at unit-sphere point `o` whose nearest seam point is `at`: V stitches (XD-63), width 14% and stroke 2.5% of the diameter, `count` along the whole seam, all pointing along it, no line. Each V is drawn in its own stitch's tangent plane, so all are identical and symmetric. */
export const chevronAt = (S: V3[], at: number, o: V3, count = 56): number => {
  const c = chevrons(S, count), j0 = Math.floor((c.s[at] ?? 0) / c.P);
  let best = 0;
  for (let dj = -1; dj <= Math.ceil(CHEV_DEP / c.P) + 1; dj += 1) {
    const st = c.k[(((j0 + dj) % count) + count) % count] as Chevron, { A, T, N } = st;
    if (o[0] * A[0] + o[1] * A[1] + o[2] * A[2] < 0.9) continue;
    const px = Math.abs(o[0] * N[0] + o[1] * N[1] + o[2] * N[2]), py = o[0] * T[0] + o[1] * T[1] + o[2] * T[2];
    // V: apex (0, 0), ends (+-hw, -dep); distance to the nearer arm, antialiased over 0.012
    const bx = CHEV_HW, by = -CHEV_DEP, f = Math.min(1, Math.max(0, (px * bx + py * by) / (bx * bx + by * by)));
    best = Math.max(best, Math.min(1, Math.max(0, (0.025 + 0.006 - Math.hypot(px - bx * f, py - by * f)) / 0.012)));
  }
  return best;
};
export const PER_TURN = 345 / 110;
/** The turn of a ball `size` px across that rolls `px` without sliding: one full turn per `perTurn * size` px. */
export const turnOf = (px: number, size = 110, perTurn = PER_TURN): number => (2 * Math.PI * px) / (perTurn * size);
/** The ball's turn after rolling by (dx, dy) screen pixels from the turn `from`. */
export const rolled = (from: M3, dx: number, dy: number, size = 110, perTurn = PER_TURN): M3 => { const d = Math.hypot(dx, dy); return d ? mmul(rotAxis([dy / d, dx / d, 0], turnOf(d, size, perTurn)), from) : from; };
/** The angle left between a turn and the rest view, and its axis. */
export const offRest = (m: M3): { axis: V3; angle: number } => {
  const c = Math.min(1, Math.max(-1, ((m[0] ?? 1) + (m[4] ?? 1) + (m[8] ?? 1) - 1) / 2)), a: V3 = [(m[7] ?? 0) - (m[5] ?? 0), (m[2] ?? 0) - (m[6] ?? 0), (m[3] ?? 0) - (m[1] ?? 0)];
  return { axis: Math.hypot(...a) > 1e-6 ? a : [0, 1, 0], angle: Math.acos(c) };
};

/** The two-arc seam (Bourke's curve): `n` points on the unit sphere; `a` sets how far the arcs swing. */
export const twoArcSeam = (n = 240, a = 0.4): V3[] => Array.from({ length: n }, (_, i) => {
  const t = (4 * Math.PI * i) / n, b = Math.PI / 2 - (Math.PI / 2 - a) * Math.cos(t), c = t / 2 + a * Math.sin(2 * t);
  return [Math.sin(b) * Math.cos(c), Math.sin(b) * Math.sin(c), Math.cos(b)];
});
export const SEAM = twoArcSeam();
const bufs = new WeakMap<HTMLCanvasElement, ImageData>();
const rgb = (s: string): V3 => { const h = s.trim().replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as unknown as V3; };

/** Draws the ball turned by `m` (identity: the rest view), lit from the top-left. Colours are #rrggbb. */
export function paintBall(c: HTMLCanvasElement, m: M3 = ID, look: BallLook = { leather: '#f6f3ea' }): void {
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return;
  const g = c.getContext('2d'), n = c.width;
  if (!g || !n) return;
  let img = bufs.get(c);
  if (img?.width !== n) { img = g.createImageData(n, n); bufs.set(c, img); }
  const d = img.data, inv = transpose(m), L = [-0.45, 0.6, 0.66].map((x) => x / Math.hypot(0.45, 0.6, 0.66)) as unknown as V3;
  const [lr, lg, lb] = rgb(look.leather), [sr, sg, sb] = rgb(look.seam ?? (look.stitch === 'chevron' ? '#e63a30' : '#c8202a')), R = n / 2, S = look.curve ?? SEAM, N = S.length;
  for (let py = 0; py < n; py += 1) for (let px = 0; px < n; px += 1) {
    const x = (px + 0.5 - R) / R, y = -(py + 0.5 - R) / R, r2 = x * x + y * y;
    if (r2 >= 1) continue;
    const z = Math.sqrt(1 - r2), o0 = (inv[0] ?? 0) * x + (inv[1] ?? 0) * y + (inv[2] ?? 0) * z, o1 = (inv[3] ?? 0) * x + (inv[4] ?? 0) * y + (inv[5] ?? 0) * z, o2 = (inv[6] ?? 0) * x + (inv[7] ?? 0) * y + (inv[8] ?? 0) * z;
    let best = -2, at = 0;
    for (let i = 0; i < N; i += 1) { const s = S[i] as V3, k = s[0] * o0 + s[1] * o1 + s[2] * o2; if (k > best) { best = k; at = i; } }
    const ang = Math.acos(Math.min(1, best));
    // the stitches: short bars across the seam, a thin groove along it
    const stitch = look.stitch === 'chevron' ? (ang < 0.25 ? chevronAt(S, at, [o0, o1, o2], look.stitchCount) : 0) : ang < 0.012 ? 0.55 : ang < 0.1 && ang > 0.02 && at % 6 < 2 ? 1 : 0;
    const lit = 0.62 + 0.5 * Math.max(0, x * L[0] + y * L[1] + z * L[2]), k = (py * n + px) * 4;
    d[k] = Math.min(255, (lr + (sr - lr) * stitch) * lit); d[k + 1] = Math.min(255, (lg + (sg - lg) * stitch) * lit); d[k + 2] = Math.min(255, (lb + (sb - lb) * stitch) * lit);
    d[k + 3] = 255 * Math.min(1, (1 - Math.sqrt(r2)) * R);
  }
  g.putImageData(img, 0, 0);
}

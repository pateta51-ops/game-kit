// A seamed ball as a true sphere, drawn on a small canvas from the sphere's equation and a seam curve computed in code.
// No model file, no dependency. The seams travel around the ball as it turns.
import { ID, mmul, rotAxis, transpose, type M3, type V3 } from './solids';

/** `curve`: points on the unit sphere along the seam (default `twoArcSeam()`); `perTurn`: px of travel per turn for each px across. */
export interface BallLook { leather: string; seam: string; curve?: V3[] | undefined }
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
export function paintBall(c: HTMLCanvasElement, m: M3 = ID, look: BallLook = { leather: '#f6f3ea', seam: '#c8202a' }): void {
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return;
  const g = c.getContext('2d'), n = c.width;
  if (!g || !n) return;
  let img = bufs.get(c);
  if (img?.width !== n) { img = g.createImageData(n, n); bufs.set(c, img); }
  const d = img.data, inv = transpose(m), L = [-0.45, 0.6, 0.66].map((x) => x / Math.hypot(0.45, 0.6, 0.66)) as unknown as V3;
  const [lr, lg, lb] = rgb(look.leather), [sr, sg, sb] = rgb(look.seam), R = n / 2, S = look.curve ?? SEAM, N = S.length;
  for (let py = 0; py < n; py += 1) for (let px = 0; px < n; px += 1) {
    const x = (px + 0.5 - R) / R, y = -(py + 0.5 - R) / R, r2 = x * x + y * y;
    if (r2 >= 1) continue;
    const z = Math.sqrt(1 - r2), o0 = (inv[0] ?? 0) * x + (inv[1] ?? 0) * y + (inv[2] ?? 0) * z, o1 = (inv[3] ?? 0) * x + (inv[4] ?? 0) * y + (inv[5] ?? 0) * z, o2 = (inv[6] ?? 0) * x + (inv[7] ?? 0) * y + (inv[8] ?? 0) * z;
    let best = -2, at = 0;
    for (let i = 0; i < N; i += 1) { const s = S[i] as V3, k = s[0] * o0 + s[1] * o1 + s[2] * o2; if (k > best) { best = k; at = i; } }
    const ang = Math.acos(Math.min(1, best));
    // the stitches: short bars across the seam, a thin groove along it
    const stitch = ang < 0.012 ? 0.55 : ang < 0.1 && ang > 0.02 && at % 6 < 2 ? 1 : 0;
    const lit = 0.62 + 0.5 * Math.max(0, x * L[0] + y * L[1] + z * L[2]), k = (py * n + px) * 4;
    d[k] = Math.min(255, (lr + (sr - lr) * stitch) * lit); d[k + 1] = Math.min(255, (lg + (sg - lg) * stitch) * lit); d[k + 2] = Math.min(255, (lb + (sb - lb) * stitch) * lit);
    d[k + 3] = 255 * Math.min(1, (1 - Math.sqrt(r2)) * R);
  }
  g.putImageData(img, 0, 0);
}

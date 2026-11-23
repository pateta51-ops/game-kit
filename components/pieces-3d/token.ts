// K718: a die-cut token as a true extruded solid. Pure (no DOM): the outline traced from a scan's alpha, simplified,
// triangulated, and extruded to a thickness. Owner rule: an outline pushed to a thickness, no modelled mesh.
import type { Mesh } from './solids.ts';

export type Pt = [number, number];
export interface TokenMm { w: number; h: number; thickness: number }
export interface TokenMesh extends Mesh { kind: Float32Array; tris: { front: number; back: number; side: number } }
/** At most this many outline points go into a solid (6 vertices each, well under the Uint16 index limit); a longer outline is simplified more. */
export const MAX_POINTS = 400;

/** The px size of a token: its real mm times the game's px-per-mm scale. */
export const tokenSize = (mm: TokenMm, pxPerMm: number) => ({ w: mm.w * pxPerMm, h: mm.h * pxPerMm, d: mm.thickness * pxPerMm });

/** The outer outline of the first opaque shape (alpha >= `cut`) in raster order, as pixel centres, clockwise on screen (y down). `rgba`: 4 bytes a pixel. */
export function traceAlpha(rgba: ArrayLike<number>, w: number, h: number, cut = 128): Pt[] {
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && (rgba[(y * w + x) * 4 + 3] ?? 0) >= cut;
  let s = -1;
  for (let i = 0; i < w * h && s < 0; i += 1) if ((rgba[i * 4 + 3] ?? 0) >= cut) s = i;
  if (s < 0) return [];
  // Moore neighbour trace, Jacob's stop: back at the start, entered the same way
  const D: Pt[] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const sx = s % w, sy = Math.floor(s / w), out: Pt[] = [[sx, sy]];
  let x = sx, y = sy, d = 6, d0 = -1;
  for (let n = 0; n < 4 * w * h; n += 1) {
    let k = 0;
    for (; k < 8; k += 1) { const t = (d + (d % 2 ? 5 : 6) + k) % 8, [dx, dy] = D[t] as Pt; if (on(x + dx, y + dy)) { d = t; break; } }
    if (k === 8) break;
    if (x === sx && y === sy) { if (d === d0) break; if (d0 < 0) d0 = d; }
    const [dx, dy] = D[d] as Pt; x += dx; y += dy;
    if (x !== sx || y !== sy) out.push([x, y]);
  }
  return out;
}

/** Fewer points, none more than `tol` px off the closed outline (Douglas-Peucker on both halves). */
export function simplify(p: Pt[], tol = 0.75): Pt[] {
  if (p.length < 4) return p;
  const rdp = (a: number, b: number, keep: boolean[]) => {
    const [ax, ay] = p[a] as Pt, [bx, by] = p[b % p.length] as Pt, L = Math.hypot(bx - ax, by - ay);
    let far = -1, fd = tol;
    for (let i = a + 1; i < b; i += 1) {
      const [px, py] = p[i] as Pt, dd = L ? Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / L : Math.hypot(px - ax, py - ay);
      if (dd > fd) { fd = dd; far = i; }
    }
    if (far < 0) return;
    keep[far] = true; rdp(a, far, keep); rdp(far, b, keep);
  };
  let m = 0, md = 0;
  p.forEach(([x, y], i) => { const dd = Math.hypot(x - (p[0] as Pt)[0], y - (p[0] as Pt)[1]); if (dd > md) { md = dd; m = i; } });
  const keep = p.map((_, i) => i === 0 || i === m);
  rdp(0, m, keep); rdp(m, p.length, keep);
  return p.filter((_, i) => keep[i]);
}

/** Signed area: positive when counter-clockwise in a y-up frame. */
export const area = (p: Pt[]) => p.reduce((s, [x, y], i) => { const [u, v] = p[(i + 1) % p.length] as Pt; return s + x * v - u * y; }, 0) / 2;

const cr = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
/** True when the closed outline neither crosses nor touches itself (no pinch, no figure-eight, no repeated point, no fold back). */
export function isSimple(p: Pt[]): boolean {
  const n = p.length;
  if (n < 3 || new Set(p.map((q) => q.join())).size < n) return false;
  const on = (a: Pt, b: Pt, q: Pt) => Math.min(a[0], b[0]) <= q[0] && q[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= q[1] && q[1] <= Math.max(a[1], b[1]);
  const hit = (a: Pt, b: Pt, c: Pt, d: Pt) => {
    const d1 = cr(c, d, a), d2 = cr(c, d, b), d3 = cr(a, b, c), d4 = cr(a, b, d);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    return (d1 === 0 && on(c, d, a)) || (d2 === 0 && on(c, d, b)) || (d3 === 0 && on(a, b, c)) || (d4 === 0 && on(a, b, d));
  };
  for (let i = 0; i < n; i += 1) {
    const a = p[i] as Pt, b = p[(i + 1) % n] as Pt, c = p[(i + 2) % n] as Pt;
    // a fold back onto the last edge
    if (cr(a, b, c) === 0 && (c[0] - b[0]) * (b[0] - a[0]) + (c[1] - b[1]) * (b[1] - a[1]) < 0) return false;
    for (let j = i + 2; j < n; j += 1) if (!(i === 0 && j === n - 1) && hit(a, b, p[j] as Pt, p[(j + 1) % n] as Pt)) return false;
  }
  return true;
}

/** Ear clipping of a simple polygon (counter-clockwise, y up): n - 2 triangles as index triples; null when the outline is not simple or no ear is left. */
export function triangulate(p: Pt[]): number[] | null {
  if (!isSimple(p)) return null;
  const idx = p.map((_, i) => i), out: number[] = [];
  const inside = (q: Pt, a: Pt, b: Pt, c: Pt) => cr(a, b, q) >= 0 && cr(b, c, q) >= 0 && cr(c, a, q) >= 0;
  while (idx.length > 3) {
    let cut = -1, best = -1;
    for (let i = 0; i < idx.length; i += 1) {
      const ia = idx[(i + idx.length - 1) % idx.length] as number, ib = idx[i] as number, ic = idx[(i + 1) % idx.length] as number, a = p[ia] as Pt, b = p[ib] as Pt, c = p[ic] as Pt, k = cr(a, b, c);
      if (k <= 0) continue;
      if (idx.some((j) => j !== ia && j !== ib && j !== ic && inside(p[j] as Pt, a, b, c))) continue;
      // the fattest ear: fewer slivers
      const q = k / (Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(c[0] - b[0], c[1] - b[1]) * Math.hypot(a[0] - c[0], a[1] - c[1]) || 1);
      if (q > best) { best = q; cut = i; }
    }
    if (cut < 0) return null;
    out.push(idx[(cut + idx.length - 1) % idx.length] as number, idx[cut] as number, idx[(cut + 1) % idx.length] as number);
    idx.splice(cut, 1);
  }
  out.push(...idx);
  return out.length === 3 * (p.length - 2) ? out : null;
}

/**
 * The extruded solid of an outline in image px (`img` w x h, y down), scaled so the outline's box is `size` w x h and `size.d` thick,
 * centred, y up, the front at +z. uv: the front maps the image; the back maps it mirrored when `ownBack` (a back scan seen from behind)
 * and as the front otherwise (the front seen through). `kind`: 0 front, 1 back, 2 side. Side normals are smooth where the outline turns
 * less than `crease` radians. More than MAX_POINTS points: simplified further first. Null (fail closed: keep the flat chip) when the
 * outline is not simple (a pinch, a figure-eight) and so cannot be filled.
 */
export function extrude(outline: Pt[], img: { w: number; h: number }, size: { w: number; h: number; d: number }, ownBack = false, crease = 0.6): TokenMesh | null {
  for (let t = 0.75, o = outline; outline.length > MAX_POINTS; t *= 1.5) outline = simplify(o, t);
  const xs = outline.map((q) => q[0]), ys = outline.map((q) => q[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), bw = Math.max(...xs) - x0 || 1, bh = Math.max(...ys) - y0 || 1;
  let p: Pt[] = outline.map(([x, y]) => [((x - x0) / bw - 0.5) * size.w, (0.5 - (y - y0) / bh) * size.h]);
  let src = outline;
  if (area(p) < 0) { p = [...p].reverse(); src = [...outline].reverse(); }
  const n = p.length, z = size.d / 2, tri = triangulate(p);
  if (!tri) return null;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], kind: number[] = [], idx: number[] = [];
  const U = (i: number, mirror: boolean): Pt => { const [x, y] = src[i] as Pt, u = (x + 0.5) / img.w; return [mirror ? 1 - u : u, (y + 0.5) / img.h]; };
  for (const [k, zz, nz] of [[0, z, 1], [1, -z, -1]] as const) {
    const base = pos.length / 3;
    p.forEach(([x, y], i) => { pos.push(x, y, zz); nor.push(0, 0, nz); uv.push(...U(i, k === 1 && ownBack)); kind.push(k); });
    for (let t = 0; t < tri.length; t += 3) idx.push(...(k === 0 ? [tri[t], tri[t + 1], tri[t + 2]] : [tri[t], tri[t + 2], tri[t + 1]]).map((v) => base + (v as number)));
  }
  const en = p.map(([x, y], i) => { const [u, v] = p[(i + 1) % n] as Pt, l = Math.hypot(u - x, v - y) || 1; return [(v - y) / l, -(u - x) / l] as Pt; });
  const vn = (i: number, e: number): Pt => {
    const a = en[(i + n - 1) % n] as Pt, b = en[i % n] as Pt, own = en[e] as Pt;
    if (Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]))) > crease) return own;
    const s = Math.hypot(a[0] + b[0], a[1] + b[1]) || 1;
    return [(a[0] + b[0]) / s, (a[1] + b[1]) / s];
  };
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n, a = p[i] as Pt, b = p[j] as Pt, na = vn(i, i), nb = vn(j, i), base = pos.length / 3, along = i / n;
    for (const [q, m, zz] of [[a, na, z], [b, nb, z], [b, nb, -z], [a, na, -z]] as const) { pos.push(q[0], q[1], zz); nor.push(m[0], m[1], 0); uv.push(along, 0); kind.push(2); }
    idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uv), kind: new Float32Array(kind), idx: new Uint16Array(idx), tris: { front: tri.length / 3, back: tri.length / 3, side: 2 * n } };
}

/** The mean colour of the scan just inside its outline (#rrggbb), darkened a little: the board core seen on the side. */
export function edgeColour(rgba: ArrayLike<number>, w: number, outline: Pt[], dark = 0.8): string {
  const s = [0, 0, 0];
  for (const [x, y] of outline) for (let c = 0; c < 3; c += 1) s[c] = (s[c] ?? 0) + (rgba[(y * w + x) * 4 + c] ?? 0);
  return `#${s.map((v) => Math.round((v / Math.max(1, outline.length)) * dark).toString(16).padStart(2, '0')).join('')}`;
}

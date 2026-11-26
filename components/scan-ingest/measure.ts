// Finding a printed board's boxes and colour rows on its scan, from RGBA pixels (a canvas in the browser, napi canvas or
// a synthetic array in tests).
// The game passes its box list (`BoxSpec`) and pixel tests; sources in component.json. Coordinates are in the scan's pixels.
import type { Box } from './board.ts';

export type Px = Uint8ClampedArray | Uint8Array;
/** A pixel test: `i` is the index of the pixel's red byte. */
export type PxTest = (d: Px, i: number) => boolean;

/** Hue (degrees), saturation and value of a pixel. */
export function hsv(d: Px, i: number): [number, number, number] {
  const r = d[i]! / 255,
    g = d[i + 1]! / 255,
    b = d[i + 2]! / 255;
  const mx = Math.max(r, g, b);
  const c = mx - Math.min(r, g, b);
  let h = 0;
  if (c > 0) {
    if (mx === r) h = (((g - b) / c) % 6) * 60;
    else if (mx === g) h = ((b - r) / c + 2) * 60;
    else h = ((r - g) / c + 4) * 60;
    if (h < 0) h += 360;
  }
  return [h, mx === 0 ? 0 : c / mx, mx];
}

/** A pixel test from hue, saturation and value ranges; a hue range with from > to wraps past 360 (reds). */
export function hueTest(h: [number, number], s: [number, number] = [0, 1], v: [number, number] = [0, 1]): PxTest {
  return (d, i) => {
    const [H, S, V] = hsv(d, i);
    const inH = h[0] <= h[1] ? H >= h[0] && H <= h[1] : H >= h[0] || H <= h[1];
    return inH && S >= s[0] && S <= s[1] && V >= v[0] && V <= v[1];
  };
}

/** A pixel test: within `tol` (sum of channel differences) of a colour. */
export const nearTest =
  (c: [number, number, number], tol: number): PxTest =>
  (d, i) =>
    Math.abs(d[i]! - c[0]) + Math.abs(d[i + 1]! - c[1]) + Math.abs(d[i + 2]! - c[2]) < tol;

/** Share of row `y` from x0 to x1 that passes `test`. */
export function rowFraction(d: Px, w: number, y: number, x0: number, x1: number, test: PxTest): number {
  let n = 0;
  for (let x = x0; x < x1; x++) if (test(d, (y * w + x) * 4)) n++;
  return n / Math.max(1, x1 - x0);
}

/** First y in [from, to) where `ok(y)` holds for `run` rows in a row. */
export function firstRun(from: number, to: number, run: number, ok: (y: number) => boolean): number | null {
  let n = 0;
  for (let y = from; y < to; y++) {
    n = ok(y) ? n + 1 : 0;
    if (n >= run) return y - run + 1;
  }
  return null;
}

export interface Blob extends Box {
  /** Share of the window that passes the test minus the share of the ring just outside it. */
  fill: number;
}

/**
 * Isolated solid boxes of one colour in a region: windows of width `min` to `max` (heights 1, 0.85, 0.75 of the width) mostly
 * of that colour while the margin around them is not, so a patch of the same colour in the art (no such edge) is not taken.
 * Integral image of the mask on a 2 px grid; best first, non-overlapping, at most 8; each grown while the strip beyond it
 * is still mostly the colour (a box with a big letter in it is first found as a window inside it).
 */
export function findBlobs(d: Px, w: number, h: number, test: PxTest, region: Box, min: number, max: number, minFill = 0.45): Blob[] {
  const step = 2;
  const x0 = Math.max(0, region.x - Math.round(max * 0.2));
  const y0 = Math.max(0, region.y - Math.round(max * 0.2));
  const x1 = Math.min(w, region.x + region.w + Math.round(max * 0.2));
  const y1 = Math.min(h, region.y + region.h + Math.round(max * 0.2));
  const gw = Math.ceil((x1 - x0) / step);
  const gh = Math.ceil((y1 - y0) / step);
  const ii = new Int32Array((gw + 1) * (gh + 1));
  for (let gy = 0; gy < gh; gy++) {
    let run = 0;
    for (let gx = 0; gx < gw; gx++) {
      if (test(d, ((y0 + gy * step) * w + x0 + gx * step) * 4)) run++;
      ii[(gy + 1) * (gw + 1) + gx + 1] = ii[gy * (gw + 1) + gx + 1]! + run;
    }
  }
  const sum = (ax: number, ay: number, bx: number, by: number): number => {
    const cx0 = Math.max(0, ax),
      cy0 = Math.max(0, ay),
      cx1 = Math.min(gw, bx),
      cy1 = Math.min(gh, by);
    if (cx1 <= cx0 || cy1 <= cy0) return 0;
    return ii[cy1 * (gw + 1) + cx1]! - ii[cy0 * (gw + 1) + cx1]! - ii[cy1 * (gw + 1) + cx0]! + ii[cy0 * (gw + 1) + cx0]!;
  };
  const fx: number[] = [],
    fy: number[] = [],
    fw: number[] = [],
    fh: number[] = [],
    ff: number[] = [];
  const sizeStep = Math.max(2, Math.round((max - min) / 10));
  const RATIOS = [1, 0.85, 0.75];
  // a grid point whose largest window holds too little for the smallest window to pass is skipped for every size
  let maxW = 0,
    maxH = 0,
    minArea = Infinity;
  for (let sw = min; sw <= max; sw += sizeStep)
    for (const ratio of RATIOS) {
      const ww = Math.round(sw / step),
        hh = Math.round((sw * ratio) / step);
      maxW = Math.max(maxW, ww);
      maxH = Math.max(maxH, hh);
      minArea = Math.min(minArea, ww * hh);
    }
  const need = minFill * minArea * 0.999 - 1;
  const next = new Int32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    let k = gw;
    for (let gx = gw - 1; gx >= 0; gx--) {
      if (sum(gx, gy, gx + maxW, gy + maxH) >= need) k = gx;
      next[gy * gw + gx] = k;
    }
  }
  for (let sw = min; sw <= max; sw += sizeStep)
    for (const ratio of RATIOS) {
      const ww = Math.round(sw / step),
        hh = Math.round((sw * ratio) / step);
      const m = Math.max(2, Math.round(ww * 0.18));
      for (let gy = Math.max(0, Math.round((region.y - y0) / step)); gy + hh <= gh && y0 + gy * step <= region.y + region.h; gy++)
        for (let gx = Math.max(0, Math.round((region.x - x0) / step)); gx + ww <= gw && x0 + gx * step <= region.x + region.w; gx++) {
          gx = next[gy * gw + gx]!;
          if (gx + ww > gw || x0 + gx * step > region.x + region.w) break;
          const top = gy * (gw + 1),
            bot = (gy + hh) * (gw + 1);
          const inSum = ii[bot + gx + ww]! - ii[top + gx + ww]! - ii[bot + gx]! + ii[top + gx]!;
          const inner = inSum / (ww * hh);
          if (inner < minFill) continue;
          const ring = (sum(gx - m, gy - m, gx + ww + m, gy + hh + m) - inSum) / ((ww + 2 * m) * (hh + 2 * m) - ww * hh);
          if (ring > 0.3) continue;
          fx.push(x0 + gx * step);
          fy.push(y0 + gy * step);
          fw.push(ww * step);
          fh.push(hh * step);
          ff.push(inner - ring);
        }
    }
  const strip = (x: number, y: number, sw: number, sh: number): number => {
    let n = 0,
      t = 0;
    for (let yy = y; yy < y + sh; yy += 2)
      for (let xx = x; xx < x + sw; xx += 2) {
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        t++;
        if (test(d, (yy * w + xx) * 4)) n++;
      }
    return t ? n / t : 0;
  };
  const grow = (f: Blob): Blob => {
    const g = { ...f };
    const lim = Math.round(f.w / 3);
    for (const side of ['b', 'r', 't', 'l'] as const)
      for (let i = 0; i < lim; i += 2) {
        const ok =
          side === 'b' ? strip(g.x, g.y + g.h, g.w, 2) : side === 't' ? strip(g.x, g.y - 2, g.w, 2) : side === 'r' ? strip(g.x + g.w, g.y, 2, g.h) : strip(g.x - 2, g.y, 2, g.h);
        if (ok < 0.35) break;
        if (side === 'b') g.h += 2;
        else if (side === 'r') g.w += 2;
        else if (side === 't') {
          g.y -= 2;
          g.h += 2;
        } else {
          g.x -= 2;
          g.w += 2;
        }
      }
    return g;
  };
  const out: Blob[] = [];
  const taken = new Uint8Array(ff.length);
  while (out.length < 8) {
    let best = -1;
    for (let i = 0; i < ff.length; i++) {
      if (taken[i] || (best >= 0 && !(ff[i]! > ff[best]!))) continue;
      const x = fx[i]!,
        y = fy[i]!,
        bw = fw[i]!,
        bh = fh[i]!;
      if (out.some((o) => x < o.x + o.w && o.x < x + bw && y < o.y + o.h && o.y < y + bh)) {
        taken[i] = 1;
        continue;
      }
      best = i;
    }
    if (best < 0) break;
    taken[best] = 1;
    out.push(grow({ x: fx[best]!, y: fy[best]!, w: fw[best]!, h: fh[best]!, fill: ff[best]! }));
  }
  return out;
}

/** One printed box of a board, as the game describes it; regions and sizes are fractions of the scan's width/height. */
export interface BoxSpec {
  id: string;
  /** The box's printed colour. */
  test: PxTest;
  /** Where to look, normalised (0..1) on the scan. */
  region: Box;
  /** Smallest and largest box width, as fractions of the scan's width. */
  size: [number, number];
  minFill?: number;
  /** Width over height range a box must have (default 0.72..1.45, near square); null for any. */
  ratio?: [number, number] | null;
  /** Where the box usually is (normalised), drawn there until or unless it is found. */
  usual?: Box;
}

export interface Geometry {
  scanW: number;
  scanH: number;
  /** The boxes found, in scan pixels (null: not found on this scan). */
  boxes: Record<string, Box | null>;
  /** Colour rows found (`findRows`), in scan pixels. */
  bands: Band[];
}

/** The printed boxes of a scan: for each spec the best isolated blob of its colour in its region. */
export function measureBoxes(w: number, h: number, d: Px, specs: readonly BoxSpec[]): Record<string, Box | null> {
  const out: Record<string, Box | null> = {};
  for (const s of specs) {
    const reg = { x: Math.round(s.region.x * w), y: Math.round(s.region.y * h), w: Math.round(s.region.w * w), h: Math.round(s.region.h * h) };
    const [lo, hi] = s.ratio === null ? [0, Infinity] : (s.ratio ?? [0.72, 1.45]);
    const found = findBlobs(d, w, h, s.test, reg, s.size[0] * w, s.size[1] * w, s.minFill ?? 0.3).filter((b) => b.w / b.h > lo && b.w / b.h < hi);
    const best = found.sort((a, b) => b.fill - a.fill)[0];
    out[s.id] = best ? { x: best.x, y: best.y, w: best.w, h: best.h } : null;
  }
  return out;
}

export interface Band {
  id: string;
  y0: number;
  y1: number;
}

/**
 * The rows of the given colours, top to bottom, in exactly the order `order` asks, or null when they cannot be told apart:
 * a scan row counts for a colour when most of its non-white pixels from x0 to x1 (fractions) pass the test; runs split by
 * a line of text closer than `gap` (fraction of the height) are joined; runs shorter than `minH` are dropped.
 */
export function findRows(
  w: number,
  h: number,
  d: Px,
  tests: Record<string, PxTest>,
  order: readonly string[],
  opts: { from?: number; to?: number; x0?: number; x1?: number; gap?: number; minH?: number; share?: number } = {},
): Band[] | null {
  if (!order.length) return [];
  const { from = 0, to = 1, x0 = 0.2, x1 = 0.94, gap = 0.03, minH = 0.035, share = 0.5 } = opts;
  const runs: Band[] = [];
  for (const id of new Set(order)) {
    const test = tests[id];
    if (!test) return null;
    let cur: Band | null = null;
    const list: Band[] = [];
    for (let y = Math.round(from * h); y < Math.round(to * h); y++) {
      let n = 0,
        t = 0;
      for (let x = Math.round(w * x0); x < Math.round(w * x1); x += 3) {
        const i = (y * w + x) * 4;
        if (d[i]! + d[i + 1]! + d[i + 2]! > 600) continue;
        t++;
        if (test(d, i)) n++;
      }
      if (t > 20 && n / t > share) {
        if (cur && y - cur.y1 <= Math.round(h * gap)) cur.y1 = y;
        else list.push((cur = { id, y0: y, y1: y }));
      }
    }
    runs.push(...list.filter((b) => b.y1 - b.y0 > h * minH));
  }
  runs.sort((a, b) => a.y0 - b.y0);
  return runs.map((b) => b.id).join() === order.join() ? runs : null;
}

/** A measure: what a game asks of its scan's pixels. */
export interface Asks {
  boxes: readonly BoxSpec[];
  rows?: { tests: Record<string, PxTest>; order: readonly string[]; opts?: Parameters<typeof findRows>[5] };
}

export function measureRgba(w: number, h: number, d: Px, asks: Asks): Geometry {
  return {
    scanW: w,
    scanH: h,
    boxes: measureBoxes(w, h, d, asks.boxes),
    bands: asks.rows ? (findRows(w, h, d, asks.rows.tests, asks.rows.order, asks.rows.opts) ?? []) : [],
  };
}

/** Somewhere to keep measured geometry across reloads (an IndexedDB key, say). */
export interface GeometryStore {
  get(key: string): Promise<Geometry | undefined>;
  set(key: string, g: Geometry): Promise<void>;
}

const cache = new Map<string, Promise<Geometry | null>>();

function decode(src: string, asks: Asks): Promise<Geometry | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth;
        cv.height = img.naturalHeight;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        resolve(measureRgba(cv.width, cv.height, ctx.getImageData(0, 0, cv.width, cv.height).data, asks));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * The measured geometry of a scan, decoded and measured once per `key` (the game's name for the scan and its asks, plus a
 * version it bumps when its asks change). With a `store`, a stored result is read first and a new one kept; a failed decode
 * (null) is never kept.
 */
export function loadGeometry(url: string, key: string, asks: Asks, store?: GeometryStore): Promise<Geometry | null> {
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      if (store) {
        try {
          const hit = await store.get(key);
          if (hit) return hit;
        } catch { /* An unavailable store still allows a fresh decode. */ }
      }
      const g = await decode(url, asks);
      if (g && store) {
        try { void store.set(key, g).catch(() => undefined); }
        catch { /* A storage write cannot invalidate decoded geometry. */ }
      }
      return g;
    })().catch(() => null);
    cache.set(key, p);
    const pending = p;
    void pending.then((g) => {
      if (g === null && cache.get(key) === pending) cache.delete(key);
    });
  }
  return p;
}

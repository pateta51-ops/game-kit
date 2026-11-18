// Pure geometry of a printed board scan with live state drawn over it, and of scans used as die-cut pieces at true size.
// Sources in component.json. Coordinates: `Box` in scan pixels where a function says so, otherwise normalised (0..1).
import type { CSSProperties } from 'react';
import type { Geometry } from './measure.ts';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Point {
  x: number;
  y: number;
}
export type Outline = readonly (readonly [number, number])[];

const pct = (n: number): string => `${String(Math.round(n * 10000) / 100)}%`;

/** A box in scan pixels on screen: the scan drawn `screenW` wide (any scale; the height follows the scan's shape). */
export function toScreen(b: Box, scanW: number, screenW: number): Box {
  const k = screenW / scanW;
  return { x: b.x * k, y: b.y * k, w: b.w * k, h: b.h * k };
}

/** A box in scan pixels as normalised fractions of the scan. */
export const normalise = (b: Box, scanW: number, scanH: number): Box => ({ x: b.x / scanW, y: b.y / scanH, w: b.w / scanW, h: b.h / scanH });

/** The CSS that places an element on a normalised box of an image, in percentages. */
export function boxStyle(b: Box): { left: string; top: string; width: string; height: string } {
  return { left: pct(b.x), top: pct(b.y), width: pct(b.w), height: pct(b.h) };
}

/** The CSS that centres an element on a normalised point of an image. */
export function pointStyle(p: Point): { left: string; top: string } {
  return { left: pct(p.x), top: pct(p.y) };
}

/** A found box a little larger on each side (`pad` of its short side), so a hairline of the printed box does not show round the drawn one. */
export function cover(b: Box | null, w: number, h: number, pad = 0.04): Box | null {
  if (!b) return null;
  const p = Math.round(Math.min(b.w, b.h) * pad);
  const x = Math.max(0, b.x - p);
  const y = Math.max(0, b.y - p);
  return { x, y, w: Math.min(w, b.x + b.w + p) - x, h: Math.min(h, b.y + b.h + p) - y };
}

/**
 * Where each box of the game's list is drawn, normalised: the box found on the scan (covered), else its usual place, else
 * none. `geo` undefined (not measured yet) uses the usual places; a box the scan should have but lacks is in `missing`, so
 * the game can draw its own face instead of a digital box beside the printed one.
 */
export function planOverlay(
  list: readonly { id: string; usual?: Box }[],
  geo: Geometry | null | undefined,
): { boxes: Record<string, Box>; missing: string[] } {
  const boxes: Record<string, Box> = {};
  const missing: string[] = [];
  for (const s of list) {
    const found = geo?.boxes[s.id];
    if (geo && found) boxes[s.id] = normalise(cover(found, geo.scanW, geo.scanH)!, geo.scanW, geo.scanH);
    else if (s.usual && !geo) boxes[s.id] = s.usual;
    else if (geo) missing.push(s.id);
  }
  return { boxes, missing };
}

/** A box of an image drawn at the top of a space (its width, its own shape `innerRatio`), in fractions of the mat (`matRatio`: width over height). */
export function boxWithin(space: Box, inner: Box, matRatio: number, innerRatio: number): Box {
  const height = (space.w * matRatio) / innerRatio;
  return { x: space.x + inner.x * space.w, y: space.y + inner.y * height, w: inner.w * space.w, h: inner.h * height };
}

/** The point of `value` on a track whose index is the value; past either end the last cell of that end; null with no track. */
export function trackPoint(track: readonly Point[] | undefined, value: number): Point | null {
  if (!track?.length) return null;
  return track[Math.max(0, Math.min(track.length - 1, Math.round(value)))] ?? null;
}

// ---- die-cut pieces ----

/** `polygon(..%)` from a normalised die-cut outline; undefined (no clip) for a missing, short or non-finite one. */
export function clipPathOf(outline: Outline | null | undefined): string | undefined {
  if (!outline || outline.length < 3) return undefined;
  if (outline.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) return undefined;
  return `polygon(${outline.map(([x, y]) => `${pct(x)} ${pct(y)}`).join(', ')})`;
}

/** How far a token's cut is drawn inside its scanned outline, as a part of its size (no rim of the scanner's ground). */
export const TOKEN_TRIM = 0.05;

/** An outline drawn `trim` of its size inside itself, towards the mean of its points. */
export function trimOutline(outline: Outline | null | undefined, trim = TOKEN_TRIM): [number, number][] | null | undefined {
  if (!outline) return outline;
  if (outline.length < 3) return outline.map(([x, y]) => [x, y]);
  const cx = outline.reduce((s, [x]) => s + x, 0) / outline.length;
  const cy = outline.reduce((s, [, y]) => s + y, 0) / outline.length;
  const k = 1 - trim * 2;
  return outline.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
}

/** A piece's size in mm along its picture's width and height, from its measured `sizeMm` (short, long); undefined without one. */
export function mmOf(p: { width: number; height: number; sizeMm?: readonly number[] | null | undefined } | undefined): { w: number; h: number } | undefined {
  const s = p?.sizeMm;
  if (!p || !s || !(s[0]! > 0) || !(s[1]! > 0)) return undefined;
  const long = Math.max(s[0]!, s[1]!),
    short = Math.min(s[0]!, s[1]!);
  return p.width >= p.height ? { w: long, h: short } : { w: short, h: long };
}

/** The CSS variables `--w-mm`, `--h-mm` of a piece (none without a measured size). */
export function mmStyle(p: Parameters<typeof mmOf>[0]): CSSProperties {
  const mm = mmOf(p);
  return mm ? ({ '--w-mm': String(mm.w), '--h-mm': String(mm.h) } as CSSProperties) : {};
}

/** The board's width in mm from a piece that fills a known space of it (the space's share of the board's width); `fallback` without a size. */
export function boardMm(space: Box, piece: Parameters<typeof mmOf>[0], fallback: number): number {
  const mm = mmOf(piece);
  return !mm || !(space.w > 0) ? fallback : mm.w / space.w;
}

/** The smallest and largest tilt `skewOf` straightens (degrees), and the share of its turned rectangle a hull must fill. */
export const SKEW_MIN = 1;
export const SKEW_MAX = 15;
export const SKEW_RECTANGULAR = 0.85;
const SKEWS = new WeakMap<Outline, { width: number; height: number; tilt: number }>();

function hullOf(points: Outline): (readonly [number, number])[] {
  const sorted = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o: readonly [number, number], p: readonly [number, number], q: readonly [number, number]) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const half = (list: (readonly [number, number])[]) => {
    const out: (readonly [number, number])[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

function rectangularity(points: Outline, tilt: number): number {
  const hull = hullOf(points);
  let area = 0;
  hull.forEach(([x1, y1], i) => {
    const [x2, y2] = hull[(i + 1) % hull.length]!;
    area += x1 * y2 - x2 * y1;
  });
  const r = (-tilt * Math.PI) / 180;
  const t = hull.map(([x, y]) => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)] as const);
  const xs = t.map(([x]) => x),
    ys = t.map(([, y]) => y);
  const box = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  return box > 0 ? Math.abs(area / 2) / box : 0;
}

/**
 * How far a scanned rectangle lies tilted (degrees, positive clockwise), from its outline: each edge's direction folded onto
 * the nearest side, the length-weighted median. 0 when upright, unclear, not nearly a rectangle (a die-cut), or no outline.
 */
export function skewOf(outline: Outline | null | undefined, width: number, height: number): number {
  if (!outline || outline.length < 3 || !(width > 0) || !(height > 0)) return 0;
  const known = SKEWS.get(outline);
  if (known && known.width === width && known.height === height) return known.tilt;
  const pts = outline.map(([x, y]) => [x * width, y * height] as const);
  const edges = pts
    .map(([x1, y1], i) => {
      const [x2, y2] = pts[(i + 1) % pts.length]!;
      const deg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      return { tilt: ((((deg + 45) % 90) + 90) % 90) - 45, length: Math.hypot(x2 - x1, y2 - y1) };
    })
    .sort((a, b) => a.tilt - b.tilt);
  const total = edges.reduce((s, e) => s + e.length, 0);
  let seen = 0,
    tilt = 0;
  for (const e of edges) {
    seen += e.length;
    if (seen >= total / 2) {
      const t = Math.round(e.tilt * 10) / 10;
      tilt = Math.abs(t) < SKEW_MIN || Math.abs(t) > SKEW_MAX || rectangularity(pts, t) <= SKEW_RECTANGULAR ? 0 : t;
      break;
    }
  }
  SKEWS.set(outline, { width, height, tilt });
  return tilt;
}

/** The CSS turn that stands a tilted scan upright, scaled so its turned corners stay in its box. */
export function uprightStyle(tilt: number): { transform: string } | Record<string, never> {
  if (tilt === 0) return {};
  const rad = (Math.abs(tilt) * Math.PI) / 180;
  return { transform: `rotate(${String(-tilt)}deg) scale(${String(Math.round((1 / (Math.cos(rad) + Math.sin(rad))) * 1000) / 1000)})` };
}

/** The cells of a cols x rows grid whose centre lies inside `outline` (even-odd, one scanline per row). */
export function rasterize(outline: Outline, cols: number, rows: number): Uint8Array {
  const cells = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const y = (r + 0.5) / rows;
    const xs: number[] = [];
    outline.forEach(([x1, y1], i) => {
      const [x2, y2] = outline[(i + 1) % outline.length]!;
      if (y1 > y !== y2 > y) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
    });
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k]! * cols - 0.5));
      const to = Math.min(cols - 1, Math.floor(xs[k + 1]! * cols - 0.5));
      for (let c = from; c <= to; c++) cells[r * cols + c] = 1;
    }
  }
  return cells;
}

/** Cells inside both over cells inside either (1 for two empty masks). */
export function overlap(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let both = 0,
    either = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === 1 && b[i] === 1) both++;
    if (a[i] === 1 || b[i] === 1) either++;
  }
  return either === 0 ? 1 : both / either;
}

export const SAME_SHAPE = 0.92;
export const MIN_SCANS = 3;

/**
 * One die-cut per shape: pieces of one `family` (the game's key: size and orientation) are sorted into shapes by overlap,
 * and in a shape of at least `MIN_SCANS` each piece takes the most typical outline (closest to the cells most agree on),
 * so a trace that wandered on a pale edge is replaced. `keep` pieces (pre-cut art) keep their own. Returns id -> outline.
 */
export function uniformOutlines(
  pieces: readonly { id: string; family: string; outline: Outline | null | undefined; landscape?: boolean; keep?: boolean }[],
  grid: [number, number] = [44, 32],
): Record<string, Outline> {
  const out: Record<string, Outline> = {};
  const families = new Map<string, typeof pieces>();
  for (const p of pieces) {
    if (p.outline) out[p.id] = p.outline;
    if (!p.outline || p.outline.length < 3 || p.outline.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) continue;
    families.set(p.family, [...(families.get(p.family) ?? []), p]);
  }
  for (const members of families.values()) {
    const [cols, rows] = members[0]!.landscape ? grid : [grid[1], grid[0]];
    const masks = members.map((p) => rasterize(p.outline!, cols, rows));
    const shapes: { leader: Uint8Array; members: number[] }[] = [];
    masks.forEach((m, i) => {
      const s = shapes.find((x) => overlap(x.leader, m) >= SAME_SHAPE);
      if (s) s.members.push(i);
      else shapes.push({ leader: m, members: [i] });
    });
    for (const s of shapes) {
      if (s.members.length < MIN_SCANS) continue;
      const votes = new Uint16Array(cols * rows);
      for (const i of s.members) masks[i]!.forEach((c, k) => (votes[k] = votes[k]! + c));
      const agreed = votes.map((v) => (v * 2 >= s.members.length ? 1 : 0));
      let best = s.members[0]!,
        score = -1;
      for (const i of s.members) {
        const o = overlap(masks[i]!, agreed);
        if (o > score) [best, score] = [i, o];
      }
      for (const i of s.members)
        if (i !== best && !members[i]!.keep && overlap(masks[i]!, masks[best]!) >= SAME_SHAPE) out[members[i]!.id] = members[best]!.outline!;
    }
  }
  return out;
}

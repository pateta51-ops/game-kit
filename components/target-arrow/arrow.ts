// Port of unstoppable-fan-prototype src/ui/play/arrow.ts (e395a7c4): the geometry of the targeting arrow. Pure; verbatim.

export interface Point {
  x: number;
  y: number;
}

/** A quadratic Bézier curve: from `p0` to `p2`, pulled toward `c`. */
export interface Quad {
  p0: Point;
  c: Point;
  p2: Point;
}

const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** How much the arrow bends: a part of its length, and at most this many px. */
export const BEND = 0.22;
export const MAX_BEND = 180;

/** The curve of an arrow from `from` to `to`: its control point lies off the middle of the chord, on the side above it. */
export function curveOf(from: Point, to: Point, bend = BEND, maxBend = MAX_BEND): Quad {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const mid = lerp(from, to, 0.5);
  if (length === 0) return { p0: from, c: mid, p2: to };
  // the two normals of the chord are (dy, -dx) and (-dy, dx): take the one pointing up the screen (a vertical chord bends left)
  let nx = dy / length;
  let ny = -dx / length;
  if (ny > 0 || (ny === 0 && nx > 0)) {
    nx = -nx;
    ny = -ny;
  }
  const off = Math.min(maxBend, length * bend);
  return { p0: from, c: { x: mid.x + nx * off, y: mid.y + ny * off }, p2: to };
}

/** The point of the curve at `t` (0 its start, 1 its end). */
export const pointOn = (q: Quad, t: number): Point => lerp(lerp(q.p0, q.c, t), lerp(q.c, q.p2, t), t);

/** The part of the curve from `t0` to `t1` (0 ≤ t0 ≤ t1 ≤ 1), itself a quadratic curve (de Casteljau). */
export function partOf(q: Quad, t0: number, t1: number): Quad {
  const a = Math.max(0, Math.min(1, t0));
  const b = Math.max(a, Math.min(1, t1));
  // [0, b] first, then the part of it from a / b
  const head: Quad = { p0: q.p0, c: lerp(q.p0, q.c, b), p2: pointOn(q, b) };
  if (b === 0) return { p0: q.p0, c: q.p0, p2: q.p0 };
  const s = a / b;
  return { p0: pointOn(head, s), c: lerp(head.c, head.p2, s), p2: head.p2 };
}

/** What the overlay draws: the body's path (SVG `d`), the head's three corners (SVG `points`), and the curve's rough length. */
export interface ArrowShape {
  d: string;
  head: string;
  length: number;
}

export const HEAD_LENGTH = 22;
export const HEAD_WIDTH = 24;

const fmt = (n: number): string => String(Math.round(n * 10) / 10);
const pt = (p: Point): string => `${fmt(p.x)} ${fmt(p.y)}`;

/** The rough length of a curve (its control polygon and its chord, averaged: close enough for a short arrow). */
export function lengthOf(q: Quad): number {
  const chord = Math.hypot(q.p2.x - q.p0.x, q.p2.y - q.p0.y);
  const polygon = Math.hypot(q.c.x - q.p0.x, q.c.y - q.p0.y) + Math.hypot(q.p2.x - q.c.x, q.p2.y - q.c.y);
  return (chord + polygon) / 2;
}

/**
 * The arrow on a curve: the head's tip at the curve's end, turned along the curve's last direction, and the body up to the head's
 * base. A curve shorter than two heads gets a smaller head; a curve of no length draws nothing.
 */
export function arrowShape(q: Quad, headLength = HEAD_LENGTH, headWidth = HEAD_WIDTH): ArrowShape {
  const length = lengthOf(q);
  if (length < 1) return { d: '', head: '', length: 0 };
  // the direction at the end: from the control point to the end (from the start when the control point lies on the end)
  let ux = q.p2.x - q.c.x;
  let uy = q.p2.y - q.c.y;
  if (Math.hypot(ux, uy) < 1e-6) {
    ux = q.p2.x - q.p0.x;
    uy = q.p2.y - q.p0.y;
  }
  const u = Math.hypot(ux, uy) || 1;
  ux /= u;
  uy /= u;
  const scale = Math.min(1, length / (headLength * 2));
  const hl = headLength * scale;
  const hw = headWidth * scale;
  const base = { x: q.p2.x - ux * hl, y: q.p2.y - uy * hl };
  const left = { x: base.x - uy * (hw / 2), y: base.y + ux * (hw / 2) };
  const right = { x: base.x + uy * (hw / 2), y: base.y - ux * (hw / 2) };
  // the body ends at the head's base: the curve from its start to there, pulled the same way
  const d = `M ${pt(q.p0)} Q ${pt(q.c)} ${pt(base)}`;
  return { d, head: `${pt(q.p2)} ${pt(left)} ${pt(right)}`, length };
}

/** A place on the page that a pointer can aim at: the option it stands for, and its box in the window. */
export interface Zone {
  id: string;
  rect: { left: number; top: number; width: number; height: number };
}

/**
 * The zone the pointer aims at: one whose box (grown by `pad` px) holds it; of several, the smallest (a card's button over a larger
 * place). None when the pointer is over no zone.
 */
export function aimedZone<Z extends Zone>(point: Point, zones: readonly Z[], pad = 6): Z | null {
  let best: Z | null = null;
  let area = Infinity;
  for (const zone of zones) {
    const { left, top, width, height } = zone.rect;
    if (!(width > 0) || !(height > 0)) continue;
    const inside =
      point.x >= left - pad &&
      point.x <= left + width + pad &&
      point.y >= top - pad &&
      point.y <= top + height + pad;
    if (inside && width * height < area) {
      best = zone;
      area = width * height;
    }
  }
  return best;
}

export const centreOf = (rect: Zone['rect']): Point => ({
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2,
});

/** The times of a strike at the normal speed, in ms: the arrow grows to the target, stays, collapses into it, and the hit plays. */
export const STRIKE_MS = { draw: 220, hold: 90, collapse: 150, hit: 420 } as const;

export interface StrikePlan {
  draw: number;
  hold: number;
  collapse: number;
  hit: number;
}

/**
 * How a strike plays (D-129): nothing at all without motion (`factor` 0: the speed is off or the system asks for less motion); the
 * hit alone without an arrow (a touch screen, or the arrow turned off); the collapse and the hit when the player aimed the arrow
 * at the target; and the whole stroke (grow, stay, collapse, hit) when the board answered on its own, or the keyboard did.
 */
export function strikePlan(options: { factor: number; arrow: boolean; aimed: boolean }): StrikePlan | null {
  const { factor, arrow, aimed } = options;
  if (!(factor > 0)) return null;
  const hit = STRIKE_MS.hit * factor;
  if (!arrow) return { draw: 0, hold: 0, collapse: 0, hit };
  const collapse = STRIKE_MS.collapse * factor;
  if (aimed) return { draw: 0, hold: 0, collapse, hit };
  return { draw: STRIKE_MS.draw * factor, hold: STRIKE_MS.hold * factor, collapse, hit };
}

/** The time from the answer to the hit: the damage tokens wait for it. */
export const untilHit = (plan: StrikePlan): number => plan.draw + plan.hold + plan.collapse;

/** Eased at both ends. */
export const ease = (t: number): number => {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
};

/**
 * The part of the curve the arrow shows `elapsed` ms into a strike: growing from the start, whole while it stays, then its tail
 * running into the head; `null` once it has collapsed.
 */
export function strikeFrame(q: Quad, plan: StrikePlan, elapsed: number): Quad | null {
  if (elapsed < plan.draw) return partOf(q, 0, ease(elapsed / plan.draw));
  const held = plan.draw + plan.hold;
  if (elapsed < held) return q;
  if (elapsed < held + plan.collapse) return partOf(q, ease((elapsed - held) / plan.collapse), 1);
  return null;
}

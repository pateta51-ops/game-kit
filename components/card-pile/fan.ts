// K219: fan geometry, ported from imperium-horizon-fan-prototype src/ui/board/table/fanLayout.ts (same in STCC), plus the flight curve,
// lift and backdrop-hole helpers of PeekPile.tsx. Pure arithmetic: no DOM, loads in node.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FanPlace {
  /** The card's box before it is turned: it turns by `turn` degrees about its bottom centre. */
  box: Box;
  turn: number;
  /** Which arc it lies in, 0 at the back. */
  row: number;
  /** Its place in that arc, from the left. */
  col: number;
}

/** The fan's shape, in card widths and degrees. */
const SHAPE = {
  /** The share of a card's width that shows beside the next card in an arc. */
  advance: 0.66,
  /** The turn between two cards of a short arc, and the most an arc turns from end to end. */
  turn: 9,
  spread: 50,
  /** How far each arc lies below the one behind it, in card heights. */
  rowDrop: 0.5,
} as const;

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** How many arcs `n` cards of width `w` need on a screen `width` wide (with `margin` kept free at both ends). */
export function arcsFor(n: number, w: number, width: number, margin: number): number {
  const perArc = Math.max(1, Math.floor((width - 2 * margin - w) / (SHAPE.advance * w)) + 1);
  return Math.max(1, Math.ceil(n / perArc));
}

/**
 * The places of `n` cards fanned out of `pile` (the box of its top card), each the size of that card, on a screen of
 * `screen` (all in pixels; `u` is the table's unit, 1/100 of the screen height of a 16:9 frame).
 */
export function fanPlaces(
  n: number,
  pile: Box,
  u: number,
  screen: { width: number; height: number },
  /** A line the fan stays above when it can (the decision panel's top, while the prompt picks from the pile). */
  ceiling?: number,
): FanPlace[] {
  if (n <= 0) return [];
  const w = pile.w;
  const h = pile.h;
  const margin = 1.5 * u;
  const rows = arcsFor(n, w, screen.width, margin);
  const per = Math.ceil(n / rows);
  const advance = SHAPE.advance * w;
  // each card about the pivot (0, 0) of its arc, then each arc lowered by its row
  const raw: { foot: { x: number; y: number }; turn: number; row: number; col: number }[] = [];
  for (let row = 0; row < rows; row += 1) {
    const m = Math.min(per, n - row * per);
    const step = m <= 1 ? 0 : Math.min(SHAPE.turn, SHAPE.spread / (m - 1));
    const radius = step === 0 ? 0 : advance / Math.sin(rad(step));
    for (let col = 0; col < m; col += 1) {
      const turn = (col - (m - 1) / 2) * step;
      const foot =
        step === 0
          ? { x: (col - (m - 1) / 2) * advance, y: 0 }
          : { x: radius * Math.sin(rad(turn)), y: radius * (1 - Math.cos(rad(turn))) };
      raw.push({ foot: { x: foot.x, y: foot.y + row * SHAPE.rowDrop * h }, turn, row, col });
    }
  }
  // the bounds of the turned cards
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const { foot, turn } of raw) {
    for (const [cx, cy] of [
      [-w / 2, 0],
      [w / 2, 0],
      [-w / 2, -h],
      [w / 2, -h],
    ] as const) {
      const x = foot.x + cx * Math.cos(rad(turn)) - cy * Math.sin(rad(turn));
      const y = foot.y + cx * Math.sin(rad(turn)) + cy * Math.cos(rad(turn));
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  // centred on the pile, kept on the screen
  const centre = pile.x + w / 2;
  const dx = Math.max(margin - minX, Math.min(centre - (minX + maxX) / 2, screen.width - margin - maxX));
  // above the pile (its lowest point a little below the pile's top) when it fits, else below it, kept on the screen
  const above = pile.y + 4 * u - maxY;
  const below = pile.y + h - 2 * u - minY;
  const dy0 = minY + above >= margin ? above : below;
  const floor = Math.min(screen.height - margin, ceiling ?? Infinity);
  const dy = Math.max(margin - minY, Math.min(dy0, floor - maxY));
  return raw.map(({ foot, turn, row, col }) => ({
    box: { x: foot.x + dx - w / 2, y: foot.y + dy - h, w, h },
    turn,
    row,
    col,
  }));
}

export interface Point {
  x: number
  y: number
}
export const EDGE_CAP = 8
/** How many cards' edges show under the top card of a pile of `count` (one per card beneath, at most EDGE_CAP). */
export const edgesFor = (count: number): number => (count <= 1 ? 0 : Math.min(EDGE_CAP, count - 1))

/** The motion at speed 1 (ms); a game's speed factor scales it, 0 is none. */
export const MOTION = { fly: 520, flyStep: 70, backdrop: 260, hover: 160 } as const
export const MAX_STAGGER_MS = 500
export const LIFT = { lift: 3, lifted: 30, rise: 6 } as const
export const EASE_FLIGHT = 'cubic-bezier(0.35, 0, 0.25, 1)'

export const px = (n: number): string => `${String(Math.round(n * 100) / 100)}px`
export const bottomCentre = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h })
/** The stagger between two cards: a long pile's cards leave faster so the whole fan takes about a second at most. */
export const stepFor = (n: number): number => Math.min(MOTION.flyStep, MAX_STAGGER_MS / Math.max(1, n - 1))
/** Length of the whole fly-out or gather at `speed` (ms); 0 at speed 0. */
export const totalMs = (n: number, speed: number): number => (MOTION.fly + (n - 1) * stepFor(n)) * speed

export const curve = (a: Point, c: Point, b: Point, t: number): Point => ({
  x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t ** 2 * b.x,
  y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t ** 2 * b.y,
})

export type Placed = FanPlace & { from: Box }

/** A card's flight from the pile to its place, as keyframes of the element drawn at its place: lifts off, curves, turns into place. */
export function flight(place: Placed, i: number, n: number, u: number): Keyframe[] {
  const start = bottomCentre(place.from)
  const end = bottomCentre(place.box)
  const pull = { x: start.x + (end.x - start.x) * 0.2, y: Math.min(start.y - place.from.h, end.y - place.box.h) - LIFT.rise * u }
  const small = place.from.w / place.box.w
  return Array.from({ length: 9 }, (_, k) => {
    const t = k / 8
    const at = curve(start, pull, end, t)
    const scale = (small + (1 - small) * t) * (1 + 0.05 * Math.sin(Math.PI * t))
    return {
      offset: t,
      transform: `translate(${px(at.x - end.x)}, ${px(at.y - end.y)}) rotate(${String(-place.turn * (1 - t))}deg) scale(${String(scale)})`,
      zIndex: Math.round(n - i + 2 * i * t),
    }
  })
}
/** The same flight run backwards (the gather). */
export const gatherFlight = (place: Placed, i: number, n: number, u: number): Keyframe[] =>
  flight(place, i, n, u).reverse().map((k) => ({ ...k, offset: 1 - (k.offset ?? 0) }))

/** The room a lifted card makes: its neighbours in its arc move aside, the nearest the most (px). */
export function spreadOf(place: FanPlace, lifted: FanPlace | undefined, u: number): number {
  if (lifted === undefined || place === lifted || place.row !== lifted.row) return 0
  const far = Math.abs(place.col - lifted.col)
  return Math.sign(place.col - lifted.col) * Math.max(0, 2.6 - 0.8 * (far - 1)) * u
}
/** How much a hovered card grows: to about 30 % of the screen height. */
export const liftScale = (place: FanPlace, u: number): number => (place.box.h > 0 ? (LIFT.lifted * u) / place.box.h : 1)
/** The shift that keeps a lifted card on the screen (px). */
export function liftShift(place: FanPlace, u: number, screen: { width: number; height: number }): Point {
  const foot = bottomCentre(place.box)
  const w = place.box.w * liftScale(place, u)
  const h = place.box.h * liftScale(place, u)
  const left = foot.x - w / 2
  const top = foot.y - LIFT.lift * u - h
  return {
    x: Math.max(0, u - left) - Math.max(0, left + w - (screen.width - u)),
    y: Math.max(0, u - top) - Math.max(0, foot.y - (screen.height - u)),
  }
}
/** The backdrop's outline: the whole screen with the holes cut out (even-odd). */
export function holesPath(holes: readonly Box[]): string {
  if (holes.length === 0) return 'none'
  const rect = (b: Box): string => `${px(b.x)} ${px(b.y)}, ${px(b.x + b.w)} ${px(b.y)}, ${px(b.x + b.w)} ${px(b.y + b.h)}, ${px(b.x)} ${px(b.y + b.h)}, ${px(b.x)} ${px(b.y)}, 0 0`
  return `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${holes.map(rect).join(', ')})`
}

// K250: the timing of a deal, pure. Ported from STCC src/ui/motion/dealing.ts (main 8e6f55b, D-424, D-428), itself a port of
// halogenandtoast/LordOfTheRings frontend/src/composables/dealing.ts (a3f3c01). BSD-3 notice: LICENSE-LordOfTheRings.txt in this folder.
export const DEAL_MS = 520;
export const STAGGER_MS = 90;
/** The refill starts once the departing card has landed (a share of its flight), plus this pause. */
export const REFILL_AFTER = 1;
export const REFILL_GAP_MS = 160;
/** A card flying to a far empty place flies this much longer. */
export const REFILL_FAR_SCALE = 1.5;
/** A refill card lifts this much as it turns over its pile. */
export const REFILL_LIFT = 1.06;
/** The owner-approved riffle (STCC D-428, #83). */
export const RIFFLE_MS = 2200;
export const RIFFLE_CARDS = 12;
/** K396: the approved riffle study's phases (ms at speed 1: split/tilt in, riffle, bridge, square/tilt out), 3000 ms in all. */
export const RIFFLE_STUDY_MS = [450, 1350, 750, 450] as const;
/** The default phases: the study's, scaled to RIFFLE_MS so planDeal's dealAt still matches. */
export const RIFFLE_PHASES_MS: readonly number[] = RIFFLE_STUDY_MS.map((ms) => ms * RIFFLE_MS / 3000);
/** Cards drawn in the top-view and side-view riffles. */
export const RIFFLE_DECK_CARDS = 20;
/** The unit (px) at which the riffle's pixel offsets were measured (3840x2160). */
export const MOCK_U = 21.6;
/** K406: a turn-over: the lift at edge-on, the perspective distance (px), and the share of the travel the turn spans. */
export const FLIP_LIFT = 1.08;
export const FLIP_PERSPECTIVE = 800;
export const FLIP_START = 0.25;
export const FLIP_END = 0.75;

/** A place: a pile id (`data-pile`), or a function giving the element where the card is shown. */
export type At = string | (() => HTMLElement | null);
export interface Move {
  id: string;
  /** `out`: from `pile` to `at`. `in`: from `at` to `pile`. */
  dir: 'out' | 'in';
  pile: string;
  at: At;
  /** Turns over on the way (a back leaves a pile, a card goes face down into one). K406: unset = the pile's `data-face` (face down unless "up"); a pile marked `data-face="down"` always turns. */
  faceDown?: boolean;
  /** A refill: waits for the departing card, may fly far, lifts. */
  refill?: boolean;
  far?: boolean;
  /** K443: start from a computed place: `x`,`y` px added to the pile-derived offset, `tilt` start rotation (deg), `scale` times the pile-derived start scale. */
  from?: { x?: number; y?: number; tilt?: number; scale?: number };
  /** K443: resting rotation in degrees (the card's own turn); default 0. */
  turn?: number;
}
export interface Timed {
  move: Move;
  delay: number;
  ms: number;
  /** Scale reached mid-flight (1 = none). */
  lift: number;
  /** A card that goes face down into a pile vanishes at its end so the pile can shuffle. */
  vanish: boolean;
}
export interface DealPlan {
  timed: Timed[];
  /** Piles that riffle once the cards going in have landed. */
  shuffling: string[];
  shuffleAt: number;
  dealAt: number;
  total: number;
}

/** A deck cycle: the top of the discard goes into the deck (face down, it shuffles with the rest). */
export const cycleMove = (id: string, discard: string, deck: string): Move => ({ id, dir: 'in', pile: deck, at: discard, faceDown: true });

/**
 * Times for moves: cards going in first, one after another; then the piles in `shuffled` that received one riffle; then cards
 * coming out in turn; refills start together after the departing card (`departs`) has landed, never waiting for a shuffle.
 * `speed` scales every time; at 0 (or less) nothing moves: the plan is empty.
 */
export function planDeal(moves: readonly Move[], opts: { speed?: number | undefined; shuffled?: readonly string[] | undefined; departs?: boolean | undefined; riffleMs?: number | undefined; dealMs?: number | undefined; staggerMs?: number | undefined } = {}): DealPlan {
  const speed = opts.speed ?? 1;
  if (speed <= 0 || moves.length === 0) return { timed: [], shuffling: [], shuffleAt: 0, dealAt: 0, total: 0 };
  const deal = (opts.dealMs ?? DEAL_MS) * speed;
  const stagger = (opts.staggerMs ?? STAGGER_MS) * speed;
  const ins = moves.filter((m) => m.dir === 'in');
  const outs = moves.filter((m) => m.dir === 'out');
  const shuffling = [...new Set((opts.shuffled ?? []).filter((p) => ins.some((m) => m.pile === p)))];
  const shuffleAt = ins.length ? (ins.length - 1) * stagger + deal : 0;
  const dealAt = shuffling.length ? shuffleAt + (opts.riffleMs ?? RIFFLE_MS) * speed : 0;
  const refillAt = opts.departs ? deal * REFILL_AFTER + REFILL_GAP_MS * speed : 0;
  const timed: Timed[] = ins.map((move, i) => ({ move, delay: i * stagger, ms: deal, lift: 1, vanish: move.faceDown === true }));
  let dealt = 0;
  for (const move of outs) {
    if (move.refill) timed.push({ move, delay: refillAt, ms: deal * (move.far ? REFILL_FAR_SCALE : 1), lift: REFILL_LIFT, vanish: false });
    else {
      timed.push({ move, delay: dealAt + dealt * stagger, ms: deal, lift: 1, vanish: false });
      dealt += 1;
    }
  }
  const total = Math.max(...timed.map((t) => t.delay + t.ms), shuffling.length ? dealAt : 0);
  return { timed, shuffling, shuffleAt, dealAt, total };
}

export interface FlipOpts {
  /** Scale at edge-on (default FLIP_LIFT; a refill's lift when it has one). */
  lift?: number | undefined;
  /** Perspective distance in px (default FLIP_PERSPECTIVE). */
  perspective?: number | undefined;
  /** Where in the travel (0..1) the turn starts and ends (default FLIP_START, FLIP_END). */
  start?: number | undefined;
  end?: number | undefined;
  axis?: 'x' | 'y' | undefined;
  direction?: 1 | -1 | undefined;
  /** The second side fades out at the end (a card going into a pile). */
  vanish?: boolean | undefined;
  /** K443: the lift's shape: 0..1 across the turn gives the share of the lift (default a sine: 0, 1 at the middle, 0). */
  liftCurve?: ((u: number) => number) | undefined;
  /** K445: resize-box mode: the keyframes animate left/top/width/height from `from` to `to` (px) and carry no perspective(): the parent holds one, fixed (`perspective` of the result, default 4x the start height). */
  box?: { from: { left: number; top: number; width: number; height: number }; to: { left: number; top: number; width: number; height: number } } | undefined;
}

/**
 * K406: a real turn-over from `from` (offset and scale of the start against the rest place) to rest. Both sides fly the same
 * path; the first turns 0 to 90 degrees about its own axis with perspective, the second -90 to 0; they swap at edge-on, lifting.
 */
export function flipFrames(from: { x: number; y: number; sx: number; sy: number; rot?: number | undefined; rest?: number | undefined }, o: FlipOpts = {}): { first: Keyframe[]; second: Keyframe[]; perspective: number } {
  const s = Math.min(Math.max(o.start ?? FLIP_START, 0), 1);
  const e = Math.max(Math.min(Math.max(o.end ?? FLIP_END, 0), 1), s);
  const m = (s + e) / 2;
  const eps = 0.0001;
  const lift = o.lift ?? FLIP_LIFT;
  const rot = o.axis === 'y' ? 'rotateX' : 'rotateY';
  const sg = o.direction ?? 1;
  const n = (v: number) => String(Math.round(v * 1e4) / 1e4);
  const bx = o.box;
  const persp = o.perspective ?? (bx ? bx.from.height * 4 : FLIP_PERSPECTIVE);
  const at = (p: number, deg: number): Keyframe => {
    const q = 1 - p;
    const l = e > s && p > s && p < e ? 1 + (lift - 1) * (o.liftCurve ? o.liftCurve((p - s) / (e - s)) : Math.sin(Math.PI * (p - s) / (e - s))) : 1;
    if (bx) {
      const b = (k: 'left' | 'top' | 'width' | 'height') => `${n(bx.from[k] * q + bx.to[k] * p)}px`;
      return { left: b('left'), top: b('top'), width: b('width'), height: b('height'), transform: `scale(${n(l)})${from.rot || from.rest ? ` rotate(${n((from.rot ?? 0) * q + (from.rest ?? 0) * p)}deg)` : ''} ${rot}(${n(deg * sg)}deg)` };
    }
    return { transform: `translate(${n(from.x * q)}px, ${n(from.y * q)}px) scale(${n(from.sx * q + p)}, ${n(from.sy * q + p)}) scale(${n(l)})${from.rot || from.rest ? ` rotate(${n((from.rot ?? 0) * q + (from.rest ?? 0) * p)}deg)` : ''} perspective(${n(persp)}px) ${rot}(${n(deg * sg)}deg)` };
  };
  const offs = [...new Set([0, s, (s + m) / 2, m, Math.min(m + eps, 1), (m + e) / 2, e, 1])].sort((a, b) => a - b);
  const turn = (p: number, a: number, b: number) => (b > a ? Math.min(Math.max((p - a) / (b - a), 0), 1) : p >= b ? 1 : 0);
  const first = offs.map((p) => ({ offset: p, ...at(p, 90 * turn(p, s, m)), opacity: p <= m ? 1 : 0 }));
  const second = offs.map((p) => ({ offset: p, ...at(p, p <= m ? -90 : -90 + 90 * turn(p, m, e)), opacity: p <= m ? 0 : o.vanish && p === 1 ? 0 : 1 }));
  return { first, second, perspective: persp };
}

/** Keyframes of card `n` of the riffle (the approved shuffle v2: constants and offsets unchanged). `k` is unit / MOCK_U. */
export function riffleFrames(n: number, width: number, k: number): Keyframe[] {
  const half = RIFFLE_CARDS / 2;
  const side = n < half ? -1 : 1;
  const level = n % half; // 0 = the bottom of its half: released first
  const rank = level * 2 + (side < 0 ? 0 : 1); // L, R, L, R ...: the order the cards land
  const px = (v: number) => `${String(v * k)}px`;
  const held = `translate(${String(side * width * 1.0)}px, ${px(-52 - (half - 1 - level) * 2.6)}) rotate(${String(side * 11)}deg)`;
  const inAir = `translate(${String(side * width * 0.5)}px, ${px(-130 - level * 6)}) rotate(${String(side * 4)}deg)`;
  const landed = `translate(${String(side * width * 0.16)}px, ${px(-rank * 3.8)}) rotate(${String(side * 2.6)}deg)`;
  const squared = `translate(0, ${px(-rank * 1.0)}) rotate(0deg)`;
  const drop = 0.3 + rank * 0.032;
  const land = drop + 0.075;
  return [
    { offset: 0, transform: `translate(0, ${px(-n * 0.9)})`, easing: 'ease-out' },
    { offset: 0.2, transform: held, easing: 'linear' },
    { offset: drop, transform: held, easing: 'cubic-bezier(0.3, 0.1, 0.6, 1)' },
    { offset: drop + 0.04, transform: inAir, easing: 'cubic-bezier(0.5, 0, 0.75, 0.6)' },
    { offset: land, transform: landed, easing: 'linear' },
    { offset: 0.8, transform: landed, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
    { offset: 0.88, transform: squared, easing: 'linear' },
    { offset: 0.9, transform: `translate(0, ${px(-rank * 1.0 - 16)})`, easing: 'cubic-bezier(0.5, 0, 0.9, 0.5)' },
    { offset: 0.94, transform: `translate(0, ${px(-rank * 1.0)})`, easing: 'ease-out' },
    { offset: 0.97, transform: `translate(0, ${px(-rank * 1.0 - 5)})`, easing: 'ease-in' },
    { offset: 1, transform: 'none' },
  ];
}

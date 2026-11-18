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

/** A place: a pile id (`data-pile`), or a function giving the element where the card is shown. */
export type At = string | (() => HTMLElement | null);
export interface Move {
  id: string;
  /** `out`: from `pile` to `at`. `in`: from `at` to `pile`. */
  dir: 'out' | 'in';
  pile: string;
  at: At;
  /** Turns over on the way (a back leaves a pile, a card goes face down into one). */
  faceDown: boolean;
  /** A refill: waits for the departing card, may fly far, lifts. */
  refill?: boolean;
  far?: boolean;
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
export function planDeal(moves: readonly Move[], opts: { speed?: number | undefined; shuffled?: readonly string[] | undefined; departs?: boolean | undefined; riffleMs?: number | undefined } = {}): DealPlan {
  const speed = opts.speed ?? 1;
  if (speed <= 0 || moves.length === 0) return { timed: [], shuffling: [], shuffleAt: 0, dealAt: 0, total: 0 };
  const deal = DEAL_MS * speed;
  const stagger = STAGGER_MS * speed;
  const ins = moves.filter((m) => m.dir === 'in');
  const outs = moves.filter((m) => m.dir === 'out');
  const shuffling = [...new Set((opts.shuffled ?? []).filter((p) => ins.some((m) => m.pile === p)))];
  const shuffleAt = ins.length ? (ins.length - 1) * stagger + deal : 0;
  const dealAt = shuffling.length ? shuffleAt + (opts.riffleMs ?? RIFFLE_MS) * speed : 0;
  const refillAt = opts.departs ? deal * REFILL_AFTER + REFILL_GAP_MS * speed : 0;
  const timed: Timed[] = ins.map((move, i) => ({ move, delay: i * stagger, ms: deal, lift: 1, vanish: move.faceDown }));
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

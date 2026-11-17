// K243: the motion of a market row, pure. Timing from Rome src/ui/motion/frames.ts and dealing.ts (DEAL_MS 520, STAGGER_MS 90;
// the market slide 520 from its catalog.ts), adapted there from STCC dealing.ts, a port of halogenandtoast/LordOfTheRings
// (commit a3f3c01). BSD-3 notice: LICENSE-LordOfTheRings.txt in this folder.
export const DEAL_MS = 520;
export const STAGGER_MS = 90;
export const SLIDE_MS = 520;

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export interface Motion {
  readonly kind: 'slide' | 'deal';
  readonly card: string;
  /** Slide: the slot it came from. Deal: undefined (from the deck). */
  readonly from?: number;
  readonly to: number;
  readonly delay: number;
  readonly ms: number;
}

/** What moved between two views of a row: survivors slide first, then the new cards are dealt left to right with a stagger. Times scaled by `speed`; none at 0. */
export function rowMotions(prev: readonly (string | null)[], next: readonly (string | null)[], speed = 1): Motion[] {
  if (speed <= 0) return [];
  const out: Motion[] = [];
  next.forEach((card, to) => {
    if (card === null) return;
    const from = prev.indexOf(card);
    if (from >= 0 && from !== to) out.push({ kind: 'slide', card, from, to, delay: 0, ms: SLIDE_MS * speed });
  });
  const wait = out.length > 0 ? SLIDE_MS * speed : 0;
  let k = 0;
  next.forEach((card, to) => {
    if (card === null || prev.includes(card)) return;
    out.push({ kind: 'deal', card, to, delay: wait + k * STAGGER_MS * speed, ms: DEAL_MS * speed });
    k += 1;
  });
  return out;
}

/** Keyframes taking a card from `from` (a deck, or its old slot) to its place `to`: translate and scale, ending at rest. */
export const flyFrames = (from: Box, to: Box): Keyframe[] => [
  { transform: `translate(${String(from.x - to.x)}px, ${String(from.y - to.y)}px) scale(${String(from.w / to.w)}, ${String(from.h / to.h)})`, transformOrigin: 'top left' },
  { transform: 'translate(0px, 0px) scale(1, 1)', transformOrigin: 'top left' },
];

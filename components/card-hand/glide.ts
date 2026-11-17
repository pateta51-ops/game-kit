// K218: a card played from the hand glides into play (Unstoppable src/ui/board/playMotion.ts, FLIP): the hand notes the card's
// box when it is tapped; the element that shows it in play takes the note and glides from there.
export interface Rect { left: number; top: number; width: number; height: number }

/** A note older than this (ms) was not a play (a refused tap): forgotten. */
const MAX_AGE = 2500;
const launches = new Map<string, { rect: Rect; at: number }>();
const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());

export function noteLaunch(id: string, rect: Rect, at: number = now()): void {
  for (const [k, l] of launches) if (at - l.at > MAX_AGE) launches.delete(k);
  launches.set(id, { rect, at });
}
export function takeLaunch(id: string, at: number = now()): Rect | null {
  const l = launches.get(id);
  launches.delete(id);
  return l === undefined || at - l.at > MAX_AGE ? null : l.rect;
}

const s = (n: number): string => String(Math.round(n * 1000) / 1000);
/** From `from` to `to` (boxes in the window): starts where it was at its size there, rises a little, settles. Uses `translate` and `scale`, so the element's own `transform` is kept. */
export function playKeyframes(from: Rect, to: Rect): Keyframe[] {
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const sc = to.width > 0 ? from.width / to.width : 1;
  const lift = Math.min(48, Math.hypot(dx, dy) * 0.12);
  return [
    { translate: `${s(dx)}px ${s(dy)}px`, scale: s(sc), opacity: 1 },
    { translate: `${s(dx * 0.45)}px ${s(dy * 0.45 - lift)}px`, scale: s((sc + 1) / 2 + 0.06), opacity: 1, offset: 0.55 },
    { translate: '0px 0px', scale: '1', opacity: 1 },
  ];
}

/** A new card rises into the hand (Imperium's `fx-rise`). */
export const riseKeyframes = (): Keyframe[] => [{ translate: '0 1.2rem', opacity: 0.2 }, { translate: '0 0', opacity: 1 }];

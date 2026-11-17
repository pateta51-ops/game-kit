/* eslint-disable react-refresh/only-export-components */
// K218: the hand. Ported from Imperium src/ui/board/table/FloatingHand.tsx (the fan, strips, marks, tap, drag source, draw-in)
// with Unstoppable's arc (fan.ts) and play glide (glide.ts, Hand.tsx noteFromHand/useGlideIn). The game's name, glossary,
// settings, cost badges and words are gone: the face is a render prop, the marks come from useBoardPick and picked-state.
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import type { ZoneView } from '../card-zones/index.ts';
import type { Drag } from '../drag-drop/ui.tsx';
import type { Speed } from '../motion-frame/index.ts';
import { pickedAttrs } from '../picked-state/index.ts';
import type { BoardPick } from '../prompt-host/ui.ts';
import './card-hand.css';
import { fanOf, HAND_MS, msAt, PLAY_MS, RISE_MS, type Tilt } from './fan.ts';
import { noteLaunch, playKeyframes, riseKeyframes, takeLaunch } from './glide.ts';

export interface CardHandProps {
  /** A zone's view: a `null` card (or a zone with only a count) is a back; no id of it is in the DOM. */
  readonly view: ZoneView;
  /** The game's card face for a card id. */
  readonly face: (id: string) => ReactNode;
  /** The back (default: an empty `data-part="back"` box the game styles). */
  readonly back?: () => ReactNode;
  /** Marks, picked state and taps of the open prompt (legal, barred, armed); omit for a hand that only shows. */
  readonly pick?: BoardPick;
  /** A drag from components/drag-drop: the strip is a source, the fan `data-drop-block`, the dragged card hidden in the fan. */
  readonly drag?: Drag;
  /** Animation speed factor; 0, 'instant' or reduced motion: none. */
  readonly speed?: Speed;
  readonly tilt?: Partial<Tilt>;
  /** The game's words: the fan's name and a card's button name. */
  readonly label?: string;
  readonly cardLabel?: (id: string) => string;
  /** The slot above the lifted card (what a click does). */
  readonly hint?: (id: string) => ReactNode;
}

const animate = (el: Element | null | undefined, frames: Keyframe[], duration: number, easing: string): void => {
  if (el === null || el === undefined || duration === 0 || typeof (el as HTMLElement).animate !== 'function') return;
  (el as HTMLElement).animate(frames, { duration, easing });
};

export function CardHand({ view, face, back, pick, drag, speed = 1, tilt, label, cardLabel, hint }: CardHandProps) {
  const cards: readonly (string | null)[] = view.cards ?? Array.from({ length: view.count ?? 0 }, () => null);
  const n = cards.length;
  const keys = cards.map((c, i) => c ?? `back:${String(i)}`);
  const root = useRef<HTMLDivElement | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const keyList = keys.join('\n');
  const hand = msAt(HAND_MS, speed);
  const rise = msAt(RISE_MS, speed);
  useLayoutEffect(() => {
    const before = seen.current;
    seen.current = new Set(keyList === '' ? [] : keyList.split('\n'));
    if (before === null) return;
    for (const key of seen.current) {
      if (!before.has(key)) animate([...(root.current?.querySelectorAll('[data-part="card"]') ?? [])].find((e) => e.getAttribute('data-key') === key), riseKeyframes(), rise, 'ease-out');
    }
  }, [keyList, rise]);
  const any = (pick?.picks.length ?? 0) > 0;
  return (
    <div ref={root} data-part="hand" data-count={n} style={{ '--hand-ms': `${String(hand)}ms` } as CSSProperties} onClickCapture={drag?.onClickCapture}>
      <ol data-part="fan" data-drop-block="" aria-label={label} style={{ '--n': n } as CSSProperties}>
        {cards.map((id, i) => {
          const { k, angle, drop } = fanOf(i, n, tilt);
          const mark = id === null ? undefined : pick?.marks[id];
          const style = { '--i': i, '--k': k, '--rot': `${angle.toFixed(2)}deg`, '--drop': drop.toFixed(4) } as CSSProperties;
          return (
            <li key={keys[i]} data-part="card" data-key={keys[i]} data-card={id ?? undefined} data-mark={mark} data-dragging={id !== null && drag?.dragging?.source === id ? '' : undefined} style={style} {...(id === null ? {} : pickedAttrs(pick?.picks.includes(id) === true, any))}>
              {id === null ? (
                <span data-part="strip" aria-hidden="true" />
              ) : (
                <button
                  type="button"
                  data-part="strip"
                  aria-label={cardLabel?.(id)}
                  aria-disabled={mark === 'barred' ? true : undefined}
                  {...(drag?.sourceProps(id) ?? {})}
                  onClick={(e) => {
                    if (pick === undefined) return;
                    if ((mark === 'legal' || mark === 'armed') && msAt(PLAY_MS, speed) > 0) {
                      const f = e.currentTarget.parentElement?.querySelector('[data-part="face"]');
                      if (f) noteLaunch(id, f.getBoundingClientRect());
                    }
                    pick.tap(id);
                  }}
                />
              )}
              <div data-part="face" aria-hidden={id === null ? true : undefined}>{id === null ? (back?.() ?? <div data-part="back" />) : face(id)}</div>
              {id !== null && hint !== undefined ? <span data-part="hint">{hint(id)}</span> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The element that shows a played card in play carries `data-glide="<card id>"` inside `root`; the cards of `ids` that were just tapped in a hand glide in from there. */
export function useGlideIn(root: RefObject<HTMLElement | null>, ids: readonly string[], speed: Speed = 1): void {
  const key = ids.join('\n');
  useLayoutEffect(() => {
    const dur = msAt(PLAY_MS, speed);
    for (const id of key === '' ? [] : key.split('\n')) {
      const from = takeLaunch(id);
      const to = [...(root.current?.querySelectorAll('[data-glide]') ?? [])].find((e) => e.getAttribute('data-glide') === id);
      if (from !== null && to !== undefined) animate(to, playKeyframes(from, to.getBoundingClientRect()), dur, 'cubic-bezier(0.3, 0.7, 0.2, 1)');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, speed]);
}

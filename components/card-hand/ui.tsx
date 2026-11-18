/* eslint-disable react-refresh/only-export-components */
// K218: the hand. Ported from Imperium src/ui/board/table/FloatingHand.tsx (the fan, strips, marks, tap, drag source, draw-in)
// with Unstoppable's arc (fan.ts) and play glide (glide.ts, Hand.tsx noteFromHand/useGlideIn). The game's name, glossary,
// settings, cost badges and words are gone: the face is a render prop, the marks come from useBoardPick and picked-state.
import { useLayoutEffect, useRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode, type RefObject } from 'react';
import type { ZoneView } from '../card-zones/index.ts';
import type { Drag } from '../drag-drop/ui.tsx';
import type { Speed } from '../motion-frame/index.ts';
import { pickedAttrs } from '../picked-state/index.ts';
import type { BoardPick } from '../prompt-host/ui.ts';
import './card-hand.css';
import { fanOf, HAND_MS, msAt, PLAY_MS, RISE_MS, type Tilt } from './fan.ts';
import { bindHoverTilt, type HoverTilt } from './hover-tilt.ts';
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
  readonly hoverTilt?: HoverTilt;
  /** The game's words: the fan's name and a card's button name. */
  readonly label?: string;
  readonly cardLabel?: (id: string) => string;
  /** The slot above the lifted card (what a click does). */
  readonly hint?: (id: string) => ReactNode;
  /** K253: the game's own props on a card's click target (title, aria-pressed/expanded, data-*, className, handlers). The kit's type, data-part, aria-label, aria-disabled, drag props and onClick win; a game `onClick` is composed (called first, then the kit's). */
  readonly stripProps?: (id: string) => ButtonHTMLAttributes<HTMLButtonElement> & Record<`data-${string}`, string | number | undefined>;
  /** K253: a tap with its event. Given, it replaces `pick.tap(id)` (call it yourself); the play-glide note is still made for a legal or armed card. A double-click's second click (`detail` > 1) is never reported. */
  readonly onTap?: (id: string, info: TapInfo) => void;
  /** K253: a mark and its reason per card, over the prompt's. `mark` replaces `data-mark` (any word: `dim` is dim but selectable, the kit only treats `barred` as disabled); `why` is `data-why` and the strip's title unless `stripProps` gives one. */
  readonly markOf?: (id: string) => { readonly mark?: string; readonly why?: string } | undefined;
  /** K253: the face slot takes pointer events (a hover glow or badge inside the face); the strip stays above it for the click. */
  readonly faceEvents?: boolean;
  /** K253: on a phone with `phoneTap: 'all'`, a tap on any card (named by the prompt or not) calls `onSheet(id)` and nothing else. */
  readonly phone?: boolean;
  readonly phoneTap?: 'all';
  readonly onSheet?: (id: string) => void;
  /** K262: `grid` lays whole cards in rows inside a scrolling band (the phone hand); default `fan`. No fan geometry, lift or hint in the grid; marks, taps, strips, drag and draw-in are the same. */
  readonly layout?: 'fan' | 'grid';
  /** K262 grid: columns (default 2 as Imperium's phone; the game passes 3 or 5 when the dock or width asks). A height cap `--hand-band-h` (none by default) makes the band scroll inside; gaps `--hand-gap-x` 12px, `--hand-gap-y` 16px. */
  readonly columns?: number;
  /** K262 grid: a height cap for the band (any CSS length); the band then scrolls inside. Without it the hand grows and nothing scrolls or clips. Sets `--hand-band-h` and `data-scroll`. */
  readonly bandHeight?: string;
  /** K262 grid: the header above the cards, the game's words (the count and the hand size); `data-part="head"`. */
  readonly header?: ReactNode;
  /** K262 grid: shown instead of the band when the hand is empty (`data-part="empty"`). */
  readonly empty?: ReactNode;
}

export interface TapInfo {
  /** A key's click has `detail` 0. */
  readonly via: 'pointer' | 'key';
  readonly detail: number;
}

const animate = (el: Element | null | undefined, frames: Keyframe[], duration: number, easing: string): void => {
  if (el === null || el === undefined || duration === 0 || typeof (el as HTMLElement).animate !== 'function') return;
  (el as HTMLElement).animate(frames, { duration, easing });
};

export function CardHand({ view, face, back, pick, drag, speed = 1, tilt, hoverTilt, label, cardLabel, hint, stripProps, onTap, markOf, faceEvents, phone, phoneTap, onSheet, layout, columns, bandHeight, header, empty }: CardHandProps) {
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
  const grid = layout === 'grid';
  const tiltSpeed = hand > 0 && hoverTilt !== undefined ? (hoverTilt.speed ?? speed) : 0;
  const maxDeg = hoverTilt?.maxDeg;
  const lift = hoverTilt?.lift;
  const tiltEnabled = typeof tiltSpeed === 'number' && tiltSpeed > 0;
  useLayoutEffect(() => {
    if (root.current === null || !tiltEnabled) return;
    return bindHoverTilt(root.current, { maxDeg: maxDeg ?? 6, lift: lift ?? 8, speed: tiltSpeed });
  }, [tiltEnabled, tiltSpeed, maxDeg, lift, keyList, grid]);
  const any = (pick?.picks.length ?? 0) > 0;
  return (
    <div ref={root} data-part="hand" data-count={n} data-layout={grid ? 'grid' : undefined} data-scroll={grid && bandHeight !== undefined ? '' : undefined} data-face-events={faceEvents === true ? '' : undefined} style={{ '--hand-ms': `${String(hand)}ms`, ...(grid && bandHeight !== undefined ? { '--hand-band-h': bandHeight } : {}) } as CSSProperties} onClickCapture={drag?.onClickCapture}>
      {grid && header !== undefined ? <div data-part="head">{header}</div> : null}
      {grid && n === 0 && empty !== undefined ? <div data-part="empty">{empty}</div> : <ol data-part={grid ? 'grid' : 'fan'} data-drop-block="" aria-label={label} style={{ '--n': n, ...(grid && columns !== undefined ? { '--cols': columns } : {}) } as CSSProperties}>
        {cards.map((id, i) => {
          const { k, angle, drop } = fanOf(i, n, tilt);
          const extra = id === null ? undefined : markOf?.(id);
          const mark = id === null ? undefined : (extra?.mark ?? pick?.marks[id]);
          const mine = id === null ? undefined : stripProps?.(id);
          const style = { '--i': i, '--k': k, '--rot': `${angle.toFixed(2)}deg`, '--drop': drop.toFixed(4) } as CSSProperties;
          return (
            <li key={keys[i]} data-part="card" data-key={keys[i]} data-card={id ?? undefined} data-mark={mark} data-why={extra?.why} data-dragging={id !== null && drag?.dragging?.source === id ? '' : undefined} style={style} {...(id === null ? {} : pickedAttrs(pick?.picks.includes(id) === true, any))}>
              {id === null ? (
                <span data-part="strip" aria-hidden="true" />
              ) : (
                <button
                  data-kit
                  title={extra?.why}
                  {...mine}
                  type="button"
                  data-part="strip"
                  aria-label={cardLabel?.(id)}
                  aria-disabled={mark === 'barred' ? true : undefined}
                  {...(drag?.sourceProps(id) ?? {})}
                  onPointerDown={mine?.onPointerDown === undefined && drag === undefined ? undefined : (e) => { mine?.onPointerDown?.(e); drag?.sourceProps(id).onPointerDown(e); }}
                  onClick={(e) => {
                    mine?.onClick?.(e);
                    if (onTap !== undefined && e.detail > 1) return;
                    if (phone === true && phoneTap === 'all' && onSheet !== undefined) { onSheet(id); return; }
                    if (pick === undefined && onTap === undefined) return;
                    if ((mark === 'legal' || mark === 'armed') && msAt(PLAY_MS, speed) > 0 && (onTap === undefined || e.detail > 0)) {
                      const f = e.currentTarget.parentElement?.querySelector('[data-part="face"]');
                      if (f) noteLaunch(id, f.getBoundingClientRect());
                    }
                    if (onTap !== undefined) onTap(id, { via: e.detail > 0 ? 'pointer' : 'key', detail: e.detail });
                    else pick?.tap(id);
                  }}
                />
              )}
              <div data-part="face" aria-hidden={id === null ? true : undefined}>{id === null ? (back?.() ?? <div data-part="back" />) : hoverTilt !== undefined ? <div data-part="tilt">{face(id)}</div> : face(id)}</div>
              {!grid && id !== null && hint !== undefined ? <span data-part="hint">{hint(id)}</span> : null}
            </li>
          );
        })}
      </ol>}
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

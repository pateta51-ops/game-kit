// Port of unstoppable-fan-prototype src/ui/board/TokenFlights.tsx (D-089, D-099, D-129, D-159), generalised: places, the token's
// picture, how a place is found and the hold before take-off come from the game. A portal layer in page coordinates (a scroll
// carries the flights); 700 ms eased arc with a small rise and 1.15 scale mid-way, 110 ms stagger, at most 24 in the air.
// Speed 0, reduced motion, `enabled` false and an undo (`undoNo` changed) show the final state at once, nothing in the ledger.
import { useEffect, useLayoutEffect, useRef, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { movesBetween, type Move, type Placement, type SupplyOf } from './flights.ts';
import type { FlightLedger } from './ledger.ts';

export const FLIGHT_MS = 700;
export const STAGGER_MS = 110;
const MAX_FLYING = 24;

/** What a flying token looks like: an image at `size` px (the game knows its scale); `clip` is a CSS clip-path (die-cut) that moves with it. */
export interface TokenArt {
  src: string;
  size: number;
  clip?: string;
}

export interface TokenFlightsProps {
  /** The tokens the view draws now. The first one only sets the baseline: nothing flies when the table first appears. */
  placement: Placement;
  supplyOf: SupplyOf;
  /** This table's ledger; draw with `shownTokens` and friends from `useFlightLedger(ledger)`. */
  ledger: FlightLedger;
  /** The token's picture, or null for a flight to skip. */
  render: (move: Move) => TokenArt | null;
  /** The settings' speed factor: 1 normal, 2 slow, 0 none. */
  speed: number;
  /** A number that changes on undo, redo or load: that change settles at once. */
  undoNo?: number;
  /** False (the game's own switch, e.g. physical tokens off): settle. */
  enabled?: boolean;
  /** Default: the `prefers-reduced-motion` media query. */
  reduced?: () => boolean;
  /** The element of a place on the page; default `[data-place="<key>"]`, else `[data-res="<key>"]` (the counter part). */
  find?: (place: string) => Element | null;
  /** A token has landed (also when cut short): bump a counter, play a sound. */
  onLand?: (move: Move) => void;
  /** Hold a token before take-off (a targeting arrow's strike): call `launch` when it may set off. Default: at once. */
  hold?: (move: Move, launch: () => void) => void;
  flightMs?: number;
  staggerMs?: number;
  maxFlying?: number;
}

const esc = (s: string): string => (typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(s) : s);
const onScreen = (el: Element): boolean => {
  const r = el.getBoundingClientRect();
  return (r.width > 0 || r.height > 0) && r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight;
};
/** The first match with a non-empty rect on screen (a phone tab or hidden panel may hold another), else null. */
const defaultFind = (place: string): Element | null =>
  [...document.querySelectorAll(`[data-place="${esc(place)}"], [data-res="${esc(place)}"]`)].find(onScreen) ?? null;
const defaultReduced = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function middleOf(el: Element | null): { x: number; y: number } | null {
  if (el === null) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left + window.scrollX + r.width / 2, y: r.top + window.scrollY + r.height / 2 };
}

export function TokenFlights(p: TokenFlightsProps): ReactElement {
  const { placement, supplyOf, ledger, render, speed, undoNo = 0, enabled = true } = p;
  const before = useRef<Placement | null>(null);
  const lastUndo = useRef(undoNo);
  const layer = useRef<HTMLDivElement | null>(null);
  const live = useRef<Set<() => void>>(new Set());
  const key = JSON.stringify(placement);

  const settle = (): void => {
    const cuts = [...live.current];
    live.current.clear();
    for (const cut of cuts) cut();
    ledger.clear();
  };
  // the table gone, nothing is in the air
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { settle(); }, []);

  useLayoutEffect(() => {
    const was = before.current;
    before.current = placement;
    const undone = lastUndo.current !== undoNo;
    lastUndo.current = undoNo;
    const into = layer.current;
    const off = undone || speed === 0 || !enabled || (p.reduced ?? defaultReduced)();
    if (off) settle();
    if (was === null || into === null || off) return;
    const moves = movesBetween(was, placement, supplyOf);
    if (moves.length === 0 || typeof into.animate !== 'function') return;
    const find = p.find ?? defaultFind;
    const flightMs = (p.flightMs ?? FLIGHT_MS) * speed;
    let i = 0;
    for (const move of moves) {
      if (live.current.size >= (p.maxFlying ?? MAX_FLYING)) break;
      const from = middleOf(find(move.from));
      const to = middleOf(find(move.to));
      const art = render(move);
      if (from === null || to === null || art === null) continue;
      const delay = i * (p.staggerMs ?? STAGGER_MS) * speed;
      ledger.book(move);
      let state: 'waiting' | 'flying' | 'done' = 'waiting';
      let timer: ReturnType<typeof setTimeout> | undefined;
      let flight: { animation: Animation; el: HTMLElement } | undefined;
      const finish = (): void => {
        if (state === 'done') return;
        if (state === 'waiting') ledger.takeOff(move);
        state = 'done';
        ledger.land(move);
        live.current.delete(cut);
        p.onLand?.(move);
      };
      const cut = (): void => {
        if (timer !== undefined) clearTimeout(timer);
        const f = flight;
        finish();
        f?.el.remove();
        f?.animation.cancel();
      };
      live.current.add(cut);
      const takeOffNow = (): void => {
        if (state !== 'waiting') return;
        if (!into.isConnected) {
          finish();
          return;
        }
        state = 'flying';
        ledger.takeOff(move);
        flight = fly(into, art, from, to, flightMs, finish);
      };
      const launch = (): void => {
        if (state !== 'waiting') return;
        if (delay <= 0) takeOffNow();
        else timer = setTimeout(takeOffNow, delay);
      };
      if (p.hold !== undefined) p.hold(move, launch);
      else launch();
      i += 1;
    }
    // `key` stands for `placement`: a new object with the same tokens is no change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, undoNo]);

  return createPortal(
    <div
      data-part="token-flights"
      aria-hidden="true"
      ref={layer}
      style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, pointerEvents: 'none', zIndex: 1000 }}
    />,
    document.body,
  );
}

function fly(
  into: HTMLElement,
  art: TokenArt,
  from: { x: number; y: number },
  to: { x: number; y: number },
  duration: number,
  onLand: () => void,
): { animation: Animation; el: HTMLElement } {
  const el = document.createElement('img');
  el.setAttribute('data-part', 'token-flight');
  el.src = art.src;
  el.alt = '';
  el.draggable = false;
  el.style.position = 'absolute';
  el.style.pointerEvents = 'none';
  el.style.left = `${String(from.x - art.size / 2)}px`;
  el.style.top = `${String(from.y - art.size / 2)}px`;
  el.style.width = `${String(art.size)}px`;
  if (art.clip !== undefined) el.style.clipPath = art.clip;
  into.appendChild(el);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lift = Math.min(60, Math.hypot(dx, dy) * 0.15);
  const animation = el.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${String(dx / 2)}px, ${String(dy / 2 - lift)}px) scale(1.15)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${String(dx)}px, ${String(dy)}px) scale(1)`, opacity: 1 },
    ],
    // a token is picked up, carried and set down: slow at both ends
    { duration, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'both' },
  );
  const landed = (): void => {
    el.remove();
    onLand();
  };
  animation.onfinish = landed;
  animation.oncancel = landed;
  return { animation, el };
}

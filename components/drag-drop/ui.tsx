/* eslint-disable react-refresh/only-export-components, react-hooks/exhaustive-deps */
// K220 (Imperium src/ui/board/table/useHandDrag.ts, STCC's copy): drag a source onto a target, both option ids of the open
// prompt. A drop answers as tap source then tap target through useBoardPick.tapMany. The ghost follows the pointer without a
// render; on cancel it glides back to its source, on a legal drop it settles onto the target (Web Animations).
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { prefersReducedMotion, type Speed } from '../motion-frame/index.ts';
import type { BoardPick } from '../prompt-host/ui.ts';
import { dragStep, pressSource, type DragGesture, type DragInput } from './gesture.ts';

export { DRAG_THRESHOLD_PX, dragStep, pressSource, type DragGesture, type DragInput, type DragStep } from './gesture.ts';

export const ghostTransform = (p: { x: number; y: number }): string => `translate(${String(p.x)}px, ${String(p.y)}px) translate(-50%, -50%)`;

/** The prompt's keys: none acts while a source is dragged. */
const PROMPT_KEYS = /^([1-9]|e|E|Enter| )$/;
const BASE_MS = 180;

export interface Fly { readonly id: number; readonly source: string; readonly kind: 'back' | 'settle'; readonly from: { x: number; y: number }; readonly to: { x: number; y: number } }

export interface DragOptions {
  readonly pick: BoardPick;
  /** The open prompt's id: a gesture pressed under one prompt ends when another opens. */
  readonly promptId?: number | null;
  /** The settings on/off. */
  readonly enabled?: boolean;
  /** The taps a drop makes, in order (default: source then target). A game whose click on the source alone answers returns [source]. */
  readonly taps?: (source: string, target: string) => readonly string[];
  /** Animation speed factor (durations divide by it); 0 or 'instant' or reduced motion: none. */
  readonly speed?: Speed;
}

export interface Drag {
  /** The gesture while the ghost is dragged. */
  readonly dragging: DragGesture | null;
  /** A drag is under way or was cancelled and the pointer is still down: the board takes no pointer. */
  readonly held: boolean;
  /** The ghost's flight after a cancel or a drop (null when none or no animation). */
  readonly fly: Fly | null;
  readonly endFly: (id: number) => void;
  readonly ghostRef: { current: HTMLDivElement | null };
  /** Spread on a source element: `data-drag` and the press. */
  readonly sourceProps: (id: string) => { 'data-drag': string; onPointerDown: (e: ReactPointerEvent) => void };
  /** Put on the root of the sources (capture): swallows the click that follows a drag. */
  readonly onClickCapture: (e: { stopPropagation: () => void; preventDefault: () => void }) => void;
}

const centre = (el: Element | null): { x: number; y: number } | null => {
  if (el === null) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};
const q = (attr: string, id: string): Element | null => [...document.querySelectorAll(`[${attr}]`)].find((e) => e.getAttribute(attr) === id) ?? null;

export function useDragDrop({ pick, promptId = null, enabled = true, taps = (s, t) => [s, t], speed = 1 }: DragOptions): Drag {
  const [gesture, setGesture] = useState<DragGesture | null>(null);
  const [fly, setFly] = useState<Fly | null>(null);
  const live = useRef<DragGesture | null>(null);
  const pressedUnder = useRef<number | null>(null);
  const swallow = useRef(false);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const flyId = useRef(0);

  const legalMark = (id: string): boolean => pick.marks[id] === 'legal' || pick.marks[id] === 'armed';
  const legalTarget = (source: string, target: string): boolean => taps(source, target).every(legalMark);
  const duration = speed === 'instant' || speed <= 0 || prefersReducedMotion() ? 0 : BASE_MS / speed;

  /** The legal target under the point: the topmost `data-drop` below no `data-drop-block` (the hand's fan keeps its own cards). */
  const targetAt = (x: number, y: number, source: string): string | null => {
    for (const el of document.elementsFromPoint(x, y)) {
      if (el.closest('[data-drop-block]') !== null) return null;
      const id = el.closest('[data-drop]')?.getAttribute('data-drop');
      if (id !== undefined && id !== null) return legalTarget(source, id) ? id : null;
    }
    return null;
  };

  const start = (source: string, kind: Fly['kind'], from: { x: number; y: number }, target?: string): void => {
    if (duration === 0) return;
    const to = centre(kind === 'settle' && target !== undefined ? q('data-drop', target) : q('data-drag', source));
    if (to === null) return;
    setFly({ id: ++flyId.current, source, kind, from, to });
  };

  const feed = useEffectEvent((input: DragInput) => {
    const g = live.current;
    if (g === null) return;
    const step = dragStep(g, input);
    live.current = step.gesture;
    const next = step.gesture;
    if (next === null) {
      setGesture(null);
      if (step.swallowClick) {
        swallow.current = true;
        window.setTimeout(() => { swallow.current = false; }, 0);
      }
      if (g.phase === 'dragging' || g.phase === 'cancelled') {
        // the answer goes at the drop; the animation never delays it
        if (step.drop !== null) { pick.tapMany(taps(g.source, step.drop).filter((id) => !pick.picks.includes(id))); start(g.source, 'settle', g, step.drop); }
        else if (g.phase === 'dragging') start(g.source, 'back', g);
      }
      return;
    }
    if (next.phase === 'dragging' && g.phase === 'pressed') {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      window.getSelection()?.removeAllRanges();
    }
    if (next.phase === 'cancelled' && g.phase === 'dragging') start(g.source, 'back', g);
    if (next.phase !== g.phase || next.over !== g.over) setGesture(next);
    else if (ghostRef.current !== null) ghostRef.current.style.transform = ghostTransform(next);
  });

  const stillDraggable = gesture === null || legalMark(gesture.source);
  useEffect(() => {
    if (live.current === null) return;
    if (pressedUnder.current !== promptId || !stillDraggable) feed({ type: 'cancel' });
  }, [promptId, stillDraggable]);

  // data-drop-state: legal / over on every target while dragging
  useEffect(() => {
    if (gesture === null || gesture.phase !== 'dragging') return;
    const els = [...document.querySelectorAll<HTMLElement>('[data-drop]')];
    for (const el of els) {
      const id = el.getAttribute('data-drop') ?? '';
      if (id === gesture.over) el.setAttribute('data-drop-state', 'over');
      else if (legalTarget(gesture.source, id)) el.setAttribute('data-drop-state', 'legal');
    }
    return () => { for (const el of els) el.removeAttribute('data-drop-state'); };
  }, [gesture?.phase, gesture?.over, gesture?.source]);

  const pressed = gesture !== null;
  useEffect(() => {
    if (!pressed) return;
    const mine = (e: PointerEvent): boolean => live.current?.pointerId === e.pointerId;
    const overAt = (e: PointerEvent): string | null => (live.current === null ? null : targetAt(e.clientX, e.clientY, live.current.source));
    const move = (e: PointerEvent) => {
      if (!mine(e)) return;
      if ((e.buttons & 1) === 0) feed({ type: 'cancel' });
      else feed({ type: 'move', x: e.clientX, y: e.clientY, over: overAt(e) });
    };
    const up = (e: PointerEvent) => { if (mine(e)) feed({ type: 'release', over: overAt(e) }); };
    const lost = () => feed({ type: 'cancel' });
    const key = (e: KeyboardEvent) => {
      if (live.current?.phase !== 'dragging') return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); feed({ type: 'escape' }); }
      else if (PROMPT_KEYS.test(e.key)) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', lost);
    window.addEventListener('blur', lost);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', lost);
      window.removeEventListener('blur', lost);
      window.removeEventListener('keydown', key, true);
    };
  }, [pressed]);

  return {
    dragging: gesture !== null && gesture.phase === 'dragging' ? gesture : null,
    held: gesture !== null && gesture.phase !== 'pressed',
    fly,
    endFly: (id) => setFly((f) => (f !== null && f.id === id ? null : f)),
    ghostRef,
    sourceProps: (id) => ({
      'data-drag': id,
      onPointerDown: (e) => {
        if (e.button !== 0 || live.current !== null) return;
        const g = pressSource(id, e.pointerId, e.clientX, e.clientY, legalMark(id), enabled);
        if (g === null) return;
        pressedUnder.current = promptId;
        live.current = g;
        setGesture(g);
      },
    }),
    onClickCapture: (e) => {
      if (!swallow.current) return;
      swallow.current = false;
      e.stopPropagation();
      e.preventDefault();
    },
  };
}

/** The ghost: fixed, no pointer; `render(sourceId)` draws it (the game's card face). Look via `[data-part="ghost"]` and `data-flight`. */
export function DragGhost({ drag, render, speed = 1 }: { drag: Drag; render: (source: string) => React.ReactNode; speed?: Speed }) {
  const { dragging, fly, ghostRef, endFly } = drag;
  useLayoutEffect(() => {
    const el = ghostRef.current;
    if (fly === null || el === null) return;
    const ms = speed === 'instant' || speed <= 0 ? 0 : BASE_MS / speed;
    if (typeof el.animate !== 'function' || ms === 0) { endFly(fly.id); return; }
    const settle = fly.kind === 'settle';
    const a = el.animate(
      [{ transform: ghostTransform(fly.from), opacity: 1 }, { transform: ghostTransform(fly.to) + (settle ? ' scale(0.9)' : ''), opacity: settle ? 0.6 : 1 }],
      { duration: ms, easing: 'ease-out', fill: 'forwards' },
    );
    const done = () => endFly(fly.id);
    a.onfinish = done;
    a.oncancel = done;
    return () => a.cancel();
  }, [fly?.id]);
  const source = dragging?.source ?? fly?.source;
  if (source === undefined || (dragging === null && fly === null)) return null;
  const at = dragging ?? fly?.from;
  return (
    <div ref={ghostRef} data-part="ghost" data-flight={dragging !== null ? 'drag' : fly?.kind} data-source={source}
      style={{ position: 'fixed', left: 0, top: 0, pointerEvents: 'none', transform: at === undefined ? undefined : ghostTransform(at) }}>
      {render(source)}
    </div>
  );
}

// Port of unstoppable-fan-prototype src/ui/board/TargetArrow.tsx (e395a7c4), generalised: which prompts are target and damage
// prompts, the source card, where a target lies and the settings are the game's. While `prompt` (a target prompt) is open a curved
// arrow runs from the source to the pointer, snaps to the target under it (which gets `data-arrow-aim`), and collapses into the one
// chosen; a keyboard or automatic answer grows a quick arrow first. Then the hit (flash + shake) on damage targets, a glow on
// others; token flights wait for it (`strikes.hold`). A refused answer or an undo cancels. Decorative: aria-hidden, no pointer
// events. Speed 0 or reduced motion: no moving parts, a choice removes it. Touch: no arrow, only the hit. A modal hides it.
// Drawn through refs once a frame: a pointer move re-renders nothing.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { aimedZone, arrowShape, centreOf, curveOf, strikeFrame, strikePlan, untilHit, type Point, type Quad, type Zone } from './arrow.ts';
import type { Strike, StrikeStore } from './strike.ts';

export const AIM_ATTR = 'data-arrow-aim';

/** What the arrow needs of a prompt: an id and its options. */
export interface ArrowPrompt {
  id: string;
  options: readonly { id: string; disabled?: boolean }[];
}

export interface TargetArrowProps<P extends ArrowPrompt> {
  /** The open prompt when it asks for a target (the game's predicate), else null. */
  prompt: P | null;
  strikes: StrikeStore<P>;
  /** The element the arrow starts from: the card that asks, else a fallback anchor. */
  source: (prompt: P) => HTMLElement | null;
  /** Where an option lies on the board; default `[data-target-id="<id>"]`. */
  board?: (prompt: P, optionId: string) => HTMLElement | null;
  /** The prompt panel's elements for an option; default `[data-option="<id>"], [data-option-id="<id>"]` (prompt-host, drag-drop). */
  panel?: (prompt: P, optionId: string) => HTMLElement[];
  /** Does the target take damage (flash + shake) or only glow? Default: glow. */
  damage?: (prompt: P) => boolean;
  /** The settings' speed factor: 1 normal, 2 slow, 0 none. */
  speed: number;
  /** The game's switch for the arrow (default true). */
  enabled?: boolean;
  /** A number that changes on undo, redo or load: cancels the strike under way. */
  undoNo?: number;
  /** Default: `prefers-reduced-motion`. */
  reduced?: () => boolean;
  /** Default: `(pointer: fine)`; false means a touch screen. */
  finePointer?: () => boolean;
  /** The hit's flash is drawn over the target (the game sets `--target-arrow-hit` or styles `[data-part="target-hit"]`). */
  onHit?: (el: HTMLElement | null, damage: boolean) => void;
}

const esc = (s: string): string => (typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'));
const defaultReduced = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const defaultFine = (): boolean => typeof window.matchMedia !== 'function' || window.matchMedia('(pointer: fine)').matches;

function shown(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

interface Target {
  id: string;
  board: HTMLElement | null;
  zones: HTMLElement[];
}

const centre = (el: Element): Point => centreOf(el.getBoundingClientRect());
const dialogOpen = (): boolean => document.querySelector('[aria-modal="true"]') !== null;

const LAYER: CSSProperties = { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 2147483000 };
const SVG: CSSProperties = { position: 'fixed', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' };

export function TargetArrow<P extends ArrowPrompt>(props: TargetArrowProps<P>) {
  const { prompt, strikes, speed, enabled = true, undoNo } = props;
  const reduced = (props.reduced ?? defaultReduced)();
  const factor = reduced || !(speed > 0) ? 0 : speed;
  const svg = useRef<SVGSVGElement | null>(null);
  const hits = useRef<HTMLDivElement | null>(null);
  const [layer] = useState(() => {
    const el = document.createElement('div');
    el.setAttribute('data-part', 'target-arrow-layer');
    Object.assign(el.style, LAYER);
    return el;
  });
  useLayoutEffect(() => {
    document.body.appendChild(layer);
    return () => {
      layer.remove();
    };
  }, [layer]);
  const now = useRef({ prompt, enabled, factor, props });
  useLayoutEffect(() => {
    now.current = { prompt, enabled, factor, props };
  });
  const live = useRef({
    pointer: null as Point | null,
    touch: false,
    aimed: null as HTMLElement | null,
    frame: 0,
    striking: false,
    strikeNo: 0,
    targets: [] as Target[],
    resume: null as (() => void) | null,
    input: 'pointer',
    cancel: null as (() => void) | null,
    cut: null as (() => void) | null,
  });

  const targetsOf = (p: P): Target[] => {
    const { board = (_p: P, id: string) => shown(`[data-target-id="${esc(id)}"]`), panel } = now.current.props;
    return p.options
      .filter((o) => o.disabled !== true)
      .map((o) => {
        const b = board(p, o.id);
        const pn = panel !== undefined ? panel(p, o.id) : [...document.querySelectorAll<HTMLElement>(`[data-option="${esc(o.id)}"], [data-option-id="${esc(o.id)}"]`)];
        return { id: o.id, board: b, zones: [...(b === null ? [] : [b]), ...pn] };
      });
  };

  useEffect(() => {
    const onPointer = (): void => {
      live.current.input = 'pointer';
    };
    const onKey = (): void => {
      live.current.input = 'key';
    };
    document.addEventListener('pointerdown', onPointer, { capture: true, passive: true });
    document.addEventListener('keydown', onKey, { capture: true });
    return () => {
      document.removeEventListener('pointerdown', onPointer, { capture: true });
      document.removeEventListener('keydown', onKey, { capture: true });
    };
  }, []);

  useEffect(() => {
    live.current.cancel?.();
  }, [undoNo]);

  const draw = (q: Quad | null, state: 'follow' | 'strike', snapped = false): void => {
    const el = svg.current;
    if (el === null) return;
    if (q === null) {
      el.setAttribute('data-state', 'hidden');
      return;
    }
    const shape = arrowShape(q);
    for (const path of el.querySelectorAll('path')) path.setAttribute('d', shape.d);
    el.querySelector('polygon')?.setAttribute('points', shape.head);
    el.setAttribute('data-state', shape.d === '' ? 'hidden' : state);
    el.setAttribute('data-snapped', snapped ? 'true' : 'false');
  };

  const aim = (el: HTMLElement | null): void => {
    const was = live.current.aimed;
    if (was === el) return;
    was?.removeAttribute(AIM_ATTR);
    el?.setAttribute(AIM_ATTR, 'true');
    live.current.aimed = el;
  };

  const promptId = prompt?.id ?? null;
  const follows = prompt !== null && enabled;
  useEffect(() => {
    const state = live.current;
    if (!follows) {
      if (!state.striking) draw(null, 'follow');
      aim(null);
      return;
    }
    state.targets = [];
    const frame = (): void => {
      state.frame = 0;
      const p = now.current.prompt;
      if (state.striking || p === null) return;
      const pt = state.pointer;
      if (pt === null || state.touch || dialogOpen()) {
        aim(null);
        draw(null, 'follow');
        return;
      }
      const source = now.current.props.source(p);
      if (source === null) {
        draw(null, 'follow');
        return;
      }
      if (state.targets.length === 0 || state.targets.some((t) => t.zones.some((z) => !z.isConnected))) state.targets = targetsOf(p);
      const zones: (Zone & { el: HTMLElement; board: HTMLElement | null })[] = state.targets.flatMap((t) =>
        t.zones.map((el) => ({ id: t.id, el, board: t.board, rect: el.getBoundingClientRect() })),
      );
      const over = aimedZone(pt, zones);
      const at = over === null ? null : (over.board ?? over.el);
      const q = curveOf(centre(source), at === null ? pt : centre(at));
      aim(at);
      draw(q, 'follow', at !== null);
    };
    const schedule = (): void => {
      if (state.frame === 0) state.frame = window.requestAnimationFrame(frame);
    };
    const onMove = (event: PointerEvent): void => {
      state.touch = event.pointerType === 'touch';
      state.pointer = { x: event.clientX, y: event.clientY };
      schedule();
    };
    const onLeave = (): void => {
      state.pointer = null;
      schedule();
    };
    state.resume = schedule;
    const dialogs = typeof MutationObserver === 'undefined' ? null : new MutationObserver(schedule);
    dialogs?.observe(document.body, { childList: true });
    document.addEventListener('focusin', schedule);
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerdown', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      if (state.frame !== 0) window.cancelAnimationFrame(state.frame);
      state.frame = 0;
      if (state.resume === schedule) state.resume = null;
      dialogs?.disconnect();
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerdown', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      aim(null);
      if (!state.striking) draw(null, 'follow');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follows, promptId]);

  useEffect(() => {
    const off = strikes.on((strike: Strike<P>) => {
        const state = live.current;
        const { enabled: on, factor: f, props: cur } = now.current;
        const arrow = on && !state.touch && (cur.finePointer ?? defaultFine)();
        const aimed = !strike.auto && state.input === 'pointer' && svg.current?.getAttribute('data-state') === 'follow';
        const plan = strikePlan({ factor: f, arrow, aimed });
        const byId = new Map(targetsOf(strike.prompt).map((t) => [t.id, t]));
        const ends = [...new Set(strike.ids)].flatMap((id) => {
          const t = byId.get(id);
          const el = t?.board ?? t?.zones[0] ?? null;
          return el === null ? [] : [{ el: t?.board ?? null, rect: el.getBoundingClientRect() }];
        });
        const source = cur.source(strike.prompt);
        const first = ends[0];
        const q = source === null || first === undefined ? null : curveOf(centre(source), centreOf(first.rect));
        aim(null);
        state.cut?.();
        if (plan === null || first === undefined) {
          draw(null, 'follow');
          return;
        }
        const hold = strikes.beginHold();
        state.striking = true;
        state.strikeNo += 1;
        const no = state.strikeNo;
        if (state.frame !== 0) window.cancelAnimationFrame(state.frame);
        state.frame = 0;
        let over = false;
        const finish = (struck: boolean): void => {
          if (over) return;
          over = true;
          if (state.cancel === cancel) state.cancel = null;
          if (state.cut === cut) state.cut = null;
          if (struck) {
            const damage = cur.damage?.(strike.prompt) === true;
            for (const end of ends) {
              if (damage) hit(hits.current, end.rect, end.el, plan.hit);
              else glow(end.el, plan.hit);
              cur.onHit?.(end.el, damage);
            }
          }
          strikes.endHold(hold);
          if (no !== state.strikeNo) return;
          state.striking = false;
          draw(null, 'follow');
          state.resume?.();
        };
        const cancel = (): void => {
          finish(false);
        };
        const cut = (): void => {
          finish(true);
        };
        state.cancel = cancel;
        state.cut = cut;
        if (q === null || untilHit(plan) === 0) {
          finish(true);
          return;
        }
        const start = performance.now();
        let frames = 0;
        const step = (): void => {
          if (over) return;
          frames += 1;
          // the game refused the answer: its prompt is still open once the board has drawn again
          if (frames > 1 && now.current.prompt?.id === strike.prompt.id) {
            cancel();
            return;
          }
          const part = dialogOpen() ? null : strikeFrame(q, plan, performance.now() - start);
          if (part === null) {
            finish(true);
            return;
          }
          draw(part, 'strike', true);
          window.requestAnimationFrame(step);
        };
        window.requestAnimationFrame(step);
    });
    return () => {
      off();
      live.current.cancel?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strikes]);

  return createPortal(
    <>
      <svg ref={svg} style={SVG} aria-hidden="true" focusable="false" data-part="target-arrow" data-state="hidden" data-snapped="false" data-motion={factor > 0 ? 'on' : 'off'}>
        <path data-part="target-arrow-edge" fill="none" d="" />
        <path data-part="target-arrow-body" fill="none" d="" />
        <polygon data-part="target-arrow-head" points="" />
      </svg>
      <div ref={hits} aria-hidden="true" data-part="target-hits" style={LAYER} />
    </>,
    layer,
  );
}

/** A target that takes no damage: a short brightening of its place. */
function glow(el: HTMLElement | null, ms: number): void {
  if (el?.isConnected !== true || typeof el.animate !== 'function') return;
  el.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.25)', offset: 0.35 }, { filter: 'brightness(1)' }], { duration: ms, easing: 'ease-out' });
}

/** The hit on a damage target: a flash over its middle, in the window, and its place shaken. */
function hit(into: HTMLElement | null, rect: DOMRect, el: HTMLElement | null, ms: number): void {
  if (into === null) return;
  const flash = document.createElement('div');
  flash.setAttribute('data-part', 'target-hit');
  const size = Math.max(48, Math.min(rect.width, rect.height) * 0.9);
  const { x, y } = centreOf(rect);
  Object.assign(flash.style, {
    position: 'fixed',
    borderRadius: '50%',
    background: 'var(--target-arrow-hit, transparent)',
    left: `${String(x - size / 2)}px`,
    top: `${String(y - size / 2)}px`,
    width: `${String(size)}px`,
    height: `${String(size)}px`,
  });
  into.appendChild(flash);
  if (typeof flash.animate !== 'function') {
    flash.remove();
    return;
  }
  const burst = flash.animate(
    [{ transform: 'scale(0.25)', opacity: 1 }, { transform: 'scale(1)', opacity: 0.85, offset: 0.35 }, { transform: 'scale(1.35)', opacity: 0 }],
    { duration: ms, easing: 'ease-out' },
  );
  const gone = (): void => {
    flash.remove();
  };
  burst.onfinish = gone;
  burst.oncancel = gone;
  if (el?.isConnected === true && typeof el.animate === 'function')
    el.animate(
      [{ translate: '0 0' }, { translate: '-5px 1px' }, { translate: '4px -1px' }, { translate: '-3px 0' }, { translate: '2px 0' }, { translate: '0 0' }],
      { duration: ms * 0.75, easing: 'ease-out' },
    );
}

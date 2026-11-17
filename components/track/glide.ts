import { useLayoutEffect, useRef, type RefObject } from 'react';
import { withReducedMotion, type Speed } from '../motion-frame/index.ts';
import { GLIDE_CURVE, glideFrames, glideMs } from './track.ts';

export type Pace = () => Speed;
export const paceOf = (speed?: Pace): Speed => withReducedMotion(speed ? speed() : 1);

export interface GlideHook {
  speed?: Pace;
  backward?: boolean | undefined;
  /** any value that changes on undo or redo: the marker jumps then */
  undone?: unknown;
}

/**
 * FLIP: the marker (`[data-marker]` inside the current space of `list`) glides from the old space to the new, 650 ms, a small rise and 1.15 scale.
 * Forward only unless `backward`; an undo or redo (`undone` changes), speed 0 or reduced motion jump.
 */
export function useMarkerGlide(list: RefObject<HTMLElement | null>, index: number, o: GlideHook = {}): void {
  const was = useRef(index);
  const lastUndo = useRef(o.undone);
  useLayoutEffect(() => {
    const from = was.current;
    was.current = index;
    const undone = lastUndo.current !== o.undone;
    lastUndo.current = o.undone;
    const ms = glideMs(from, index, { backward: o.backward, undone, speed: paceOf(o.speed) });
    const el = list.current;
    if (!el || ms <= 0) return;
    const old = el.children[from];
    const now = el.children[index];
    if (!old || !now) return;
    const a = old.getBoundingClientRect();
    const b = now.getBoundingClientRect();
    const dx = a.left + a.width / 2 - (b.left + b.width / 2);
    const dy = a.top + a.height / 2 - (b.top + b.height / 2);
    if (dx === 0 && dy === 0) return;
    for (const piece of now.querySelectorAll<HTMLElement>('[data-marker]')) {
      if (typeof piece.animate !== 'function') continue;
      const base = getComputedStyle(piece).transform;
      piece.animate(glideFrames(dx, dy, base === 'none' || base === '' ? '' : base), { duration: ms, easing: GLIDE_CURVE });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, o.undone]);
}

let registered = false;
/** Registers the CSS number `--v` so a bar can be filled by an animation (once; a no-op where CSS.registerProperty is missing). */
export function registerFill(): void {
  if (registered) return;
  registered = true;
  try {
    CSS.registerProperty({ name: '--v', syntax: '<number>', inherits: true, initialValue: '0' });
  } catch {
    // already registered by the game's CSS, or no support
  }
}


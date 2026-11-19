export interface BoardSwap {
  select?: string;
  stagger?: number;
  dur?: number;
  ease?: string;
  enter?: 'fade' | 'from' | 'live';
  fromOpacity?: number;
  leave?: 'ghost' | 'none';
  maxStagger?: number;
}

export function measureBoard(swap: BoardSwap, clone = false) {
  const seen = new Map<string, { node: HTMLElement; rect: DOMRect; ghost?: HTMLElement }>();
  for (const node of document.querySelectorAll<HTMLElement>(swap.select ?? '[data-motion-key]')) {
    const key = node.dataset.motionKey;
    if (!key || node.closest('[data-motion-ghost]')) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    seen.set(key, { node, rect, ...(clone && { ghost: node.cloneNode(true) as HTMLElement }) });
  }
  return seen;
}

// Warp's Edge useFlip/flyBack, with Imperium's landing hold and capped stagger.
export function flyBoard(
  swap: BoardSwap,
  before: ReturnType<typeof measureBoard>,
  factor: number,
  at: (ms: number, f: () => void) => void,
  open: Set<() => void>,
): number {
  const after = measureBoard(swap);
  const duration = (swap.dur ?? 420) * factor;
  if (!(duration > 0)) return 0;
  let count = 0;
  let end = 0;
  const fly = (node: HTMLElement, frames: Keyframe[], cleanup?: () => void, live = false): void => {
    const delay = Math.min(count++, live ? Infinity : swap.maxStagger ?? 8) * (swap.stagger ?? 70) * factor;
    if (cleanup) open.add(cleanup);
    const anim = node.animate(frames, { duration, delay, fill: 'backwards', easing: swap.ease ?? 'cubic-bezier(.2,.8,.2,1)' });
    if (cleanup) open.delete(cleanup);
    const finish = (): void => {
      open.delete(finish);
      try {
        anim.cancel();
      } finally {
        cleanup?.();
      }
    };
    open.add(finish);
    end = Math.max(end, duration + delay);
    at(duration + delay, finish);
  };
  const ghostAt = (ghost: HTMLElement, rect: DOMRect): void => {
    ghost.removeAttribute('data-motion-key');
    ghost.setAttribute('data-motion-ghost', '');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    ghost.removeAttribute('id');
    for (const child of ghost.querySelectorAll('[id]')) child.removeAttribute('id');
    Object.assign(ghost.style, {
      position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`,
      width: `${rect.width}px`, height: `${rect.height}px`, boxSizing: 'border-box',
      margin: '0', pointerEvents: 'none', zIndex: '60',
    });
    document.body.append(ghost);
  };
  for (const [key, { node, rect }] of after) {
    if (typeof node.animate !== 'function') continue;
    const old = before.get(key);
    const source = node.dataset.motionFrom;
    const from = old?.rect ?? ((swap.enter === 'from' || swap.enter === 'live') && source
      ? document.querySelector(source)?.getBoundingClientRect() : undefined);
    const frames: Keyframe[] = [{ opacity: 0 }, { opacity: getComputedStyle(node).opacity || '1' }];
    if (from !== undefined && from.width > 0 && from.height > 0) {
      const dx = from.left - rect.left;
      const dy = from.top - rect.top;
      const sx = from.width / rect.width;
      const sy = from.height / rect.height;
      if (old && dx === 0 && dy === 0 && sx === 1 && sy === 1) continue;
      frames[0] = { transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` };
      frames[1] = { transformOrigin: '0 0', transform: 'translate(0px, 0px) scale(1, 1)' };
    }
    if (old) {
      fly(node, frames);
      continue;
    }
    if (swap.enter === 'live' && from !== undefined) {
      frames[0] = { ...frames[0], opacity: swap.fromOpacity ?? 0.2 };
      frames[1] = { ...frames[1], opacity: getComputedStyle(node).opacity || '1' };
      fly(node, frames, undefined, true);
      continue;
    }
    const ghost = node.cloneNode(true) as HTMLElement;
    const visibility = node.style.getPropertyValue('visibility');
    const priority = node.style.getPropertyPriority('visibility');
    ghostAt(ghost, rect);
    node.setAttribute('data-motion-landing', '');
    node.style.setProperty('visibility', 'hidden', 'important');
    fly(ghost, frames, () => {
      ghost.remove();
      node.removeAttribute('data-motion-landing');
      node.style.setProperty('visibility', visibility, priority);
    });
  }
  for (const [key, { rect, ghost }] of before) {
    if (after.has(key) || ghost === undefined || typeof ghost.animate !== 'function') continue;
    ghostAt(ghost, rect);
    fly(ghost, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.4)' }], () => ghost.remove());
  }
  return end;
}

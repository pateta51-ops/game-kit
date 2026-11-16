// Ambience: a decorative layer confined to the box of one page element; hidden while motion is Off.
import type { Speed } from '../motion-frame/index.ts';
import { canDraw } from './particles.ts';

export interface AmbienceOptions {
  /** the page element whose box confines the layer; none: the layer is hidden */
  target: () => Element | null | undefined;
  speed: () => Speed;
  /** draws one frame on a canvas the size of the box; `t` is ms shown so far, in speed-1 time. Without it the layer is an empty box the game's CSS fills. */
  draw?: (ctx: CanvasRenderingContext2D, t: number, w: number, h: number) => void;
  className?: string;
  parent?: HTMLElement;
}
export interface Ambience {
  el: HTMLElement;
  /** places the layer again and re-reads the speed: call it when the settings or the screen change (resize and scroll are watched) */
  update(): void;
  destroy(): void;
}

export function createAmbience(o: AmbienceOptions): Ambience {
  const el = document.createElement('div');
  el.className = `fx-ambience${o.className ? ` ${o.className}` : ''}`;
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;overflow:hidden;pointer-events:none;display:none;z-index:var(--fx-ambience-z,auto)';
  (o.parent ?? document.body).appendChild(el);
  const canvas = o.draw && canDraw() ? document.createElement('canvas') : undefined;
  const ctx = canvas?.getContext('2d') ?? undefined;
  if (canvas && ctx) {
    canvas.style.display = 'block';
    el.appendChild(canvas);
  }
  let frame = 0;
  let last = 0;
  let t = 0;
  let seen: Element | undefined;
  const tick = (now: number): void => {
    frame = 0;
    const s = o.speed();
    if (!canvas || !ctx || typeof s !== 'number' || !(s > 0)) {
      update();
      return;
    }
    t += (now - last) / s;
    last = now;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    o.draw?.(ctx, t, w, h);
    frame = requestAnimationFrame(tick);
  };
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => update()) : undefined;
  function update(): void {
    const target = o.target() ?? undefined;
    if (target !== seen) {
      observer?.disconnect();
      if (target) observer?.observe(target);
      seen = target;
    }
    const s = o.speed();
    if (!target || typeof s !== 'number' || !(s > 0)) {
      el.style.display = 'none';
      cancelAnimationFrame(frame);
      frame = 0;
      return;
    }
    const r = target.getBoundingClientRect();
    Object.assign(el.style, { display: 'block', left: `${String(r.left)}px`, top: `${String(r.top)}px`, width: `${String(r.width)}px`, height: `${String(r.height)}px` });
    if (ctx && !frame) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }
  window.addEventListener('resize', update);
  window.addEventListener('scroll', update, true);
  update();
  return {
    el,
    update,
    destroy() {
      observer?.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      el.remove();
    },
  };
}

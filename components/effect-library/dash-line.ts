import type { Point, Rect, Stage, VerbRegistry } from '../motion-frame/index.ts';
import { specTime } from './canvas.ts';
import type { EffectLayer, LayerOptions } from './layer.ts';

export interface DashLineSettings {
  from?: string;
  to: string;
  dash?: number;
  gap?: number;
  /** Stage pixels per second, positive toward the destination. */
  speed?: number;
  width?: number;
  colour?: string;
  cap?: 'round' | 'butt' | 'square';
  filter?: string;
  hideInsideTarget?: boolean;
}

const centre = ([x, y, w, h]: Rect): Point => [x + w / 2, y + h / 2];

function edgeToward(rect: Rect, point: Point): Point {
  const [x, y] = centre(rect);
  const dx = point[0] - x;
  const dy = point[1] - y;
  if (dx === 0 && dy === 0) return [x, y];
  const k = Math.min(1, Math.abs(rect[2] / 2 / (dx || 1e-9)), Math.abs(rect[3] / 2 / (dy || 1e-9)));
  return [x + dx * k, y + dy * k];
}

export function registerDashLine(verbs: VerbRegistry<EffectLayer>, resolve: LayerOptions['resolve'], stage?: Stage): void {
  verbs.register('dash-line', (call, run) => {
    const { from = call.actor, to, dash = 9, gap = 6, speed = 20, width = 2, colour = 'currentColor', cap = 'round', filter, hideInsideTarget = false } =
      call.step as unknown as DashLineSettings;
    if (typeof to !== 'string' || call.dur <= 0) return undefined;
    const rect = (id: string): Rect | undefined =>
      run.timeline.actors.find((actor) => actor.id === id)?.rect ?? stage?.(id);
    const ar = from === call.actor ? call.from : rect(from);
    const br = rect(to) ?? call.to;
    const layer = run.context.el;
    const doc = layer.ownerDocument;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(ns, 'svg');
    const path = doc.createElementNS(ns, 'path');
    svg.classList.add('fx-dash-line');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none';
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', colour);
    path.setAttribute('stroke-width', String(width));
    path.setAttribute('stroke-linecap', cap);
    path.setAttribute('stroke-dasharray', `${dash} ${gap}`);
    if (filter) path.style.filter = filter;
    svg.append(path);
    layer.append(svg);

    const start = performance.now();
    const paint = (now: number): void => {
      const a = resolve?.(from, run)?.getBoundingClientRect();
      const b = resolve?.(to, run)?.getBoundingClientRect();
      const box = layer.getBoundingClientRect();
      const sx = layer.clientWidth ? box.width / layer.clientWidth || 1 : 1;
      const sy = layer.clientHeight ? box.height / layer.clientHeight || 1 : 1;
      const local = (r: DOMRect): Rect => [(r.left - box.left) / sx, (r.top - box.top) / sy, r.width / sx, r.height / sy];
      const source = resolve ? a && local(a) : ar;
      const target = resolve ? b && local(b) : br;
      if (source && target) {
        const p = centre(source);
        if (hideInsideTarget && p[0] >= target[0] && p[0] <= target[0] + target[2] && p[1] >= target[1] && p[1] <= target[1] + target[3]) path.removeAttribute('d');
        else {
          const point = (xy: Point) => xy.map((n) => n.toFixed(1)).join(' ');
          path.setAttribute('d', `M ${point(edgeToward(source, centre(target)))} L ${point(edgeToward(target, p))}`);
        }
      } else path.removeAttribute('d');
      path.setAttribute('stroke-dashoffset', String(-speed * specTime(now - start, call) / 1000 % (dash + gap || 1)));
    };
    paint(start);
    const tick = (now: number): void => {
      paint(now);
      frame = requestAnimationFrame(tick);
    };
    let frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      svg.remove();
    };
  });
}

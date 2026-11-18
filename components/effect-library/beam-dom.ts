import type { Rect } from '../motion-frame/index.ts';
import type { Fx } from './effects.ts';
import { place } from './layer.ts';

export const px = (n: number): string => `${String(n)}px`;
export const centre = ([x, y, w, h]: Rect): [number, number] => [x + w / 2, y + h / 2];
export const rand = (i: number, k: number): number => {
  const j = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return j - Math.floor(j);
};

export function scene({ call, layer }: Fx) {
  const nodes: HTMLElement[] = [];
  const animations: Animation[] = [];
  const scale = call.dur / Math.max(1, Number(call.step.dur));
  return {
    stand(box: Rect, style: Partial<CSSStyleDeclaration>, content: HTMLElement = document.createElement('div')) {
      Object.assign(content.style, { position: 'absolute', margin: '0', pointerEvents: 'none', boxSizing: 'border-box' }, style);
      place(content, box);
      layer.el.append(content);
      nodes.push(content);
      return content;
    },
    play(el: Element, frames: Keyframe[], duration: number, delay = 0, easing = 'linear', fill: FillMode = 'both') {
      animations.push(el.animate(frames, { duration: duration * scale, delay: delay * scale, easing, fill }));
    },
    end(this: void) {
      for (const animation of animations) animation.cancel();
      for (const node of nodes) node.remove();
    },
  };
}

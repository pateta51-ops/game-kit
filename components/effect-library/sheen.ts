import type { Effect } from './effects.ts';

export interface SheenSettings {
  angle?: number;
  bandWidth?: number;
  colour?: string;
  stops?: readonly [number, number];
  travel?: readonly [number, number];
  loop?: boolean;
  period?: number;
  sweep?: readonly [number, number];
  easing?: string;
}

export const sheen: Effect = ({ call, el }) => {
  if (call.dur <= 0) return undefined;
  const {
    angle = 100, bandWidth = 50, colour = 'rgba(255,255,255,.25)', stops = [0, 100],
    travel = [-110, 220], loop = false, period = call.step.dur, sweep = [0, 1], easing = 'linear',
  } = call.step as SheenSettings;
  const clip = el.ownerDocument.createElement('div');
  clip.setAttribute('aria-hidden', 'true');
  clip.style.cssText = 'position:absolute;inset:0;overflow:hidden;border-radius:inherit;pointer-events:none;container-type:size';
  const axis = el.ownerDocument.createElement('div');
  axis.style.cssText = 'position:absolute;inset:0';
  axis.style.rotate = `${angle - 90}deg`;
  const band = el.ownerDocument.createElement('div');
  band.style.cssText = 'position:absolute;left:0;top:50%;translate:0 -50%;height:calc(100cqw + 100cqh)';
  band.style.width = `${bandWidth}%`;
  band.style.backgroundImage = `linear-gradient(90deg, transparent ${stops[0]}%, ${colour} 50%, transparent ${stops[1]}%)`;
  const from = { transform: `translateX(${travel[0]}%)` };
  const to = { transform: `translateX(${travel[1]}%)` };
  axis.append(band);
  clip.append(axis);
  el.append(clip);
  try {
    const animation = band.animate([
      { ...from, offset: 0 },
      { ...from, offset: sweep[0], easing },
      { ...to, offset: sweep[1] },
      { ...to, offset: 1 },
    ], { duration: loop ? period * call.dur / call.step.dur : call.dur, iterations: loop ? Infinity : 1, fill: 'both' });
    return () => {
      animation.cancel();
      clip.remove();
    };
  } catch (error) {
    clip.remove();
    throw error;
  }
};

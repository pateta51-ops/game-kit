import type { Effect } from './effects.ts';
import { SHEEN_DEFAULTS as D } from './defaults.ts';

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
  /** a caller-supplied CSS background for the band, instead of the colour gradient (`colour` and `stops` are then unused) */
  background?: string;
  /** K436: animates the actor's own pseudo-element (`::before`, `::after`; the game's CSS draws the band there) instead of a band the kit adds */
  pseudo?: string;
  /** K436: plays only while the pointer is over the actor, and pauses where it is when it leaves */
  hover?: boolean;
  /** K436: the band's mix-blend-mode (e.g. `screen`) */
  blend?: string;
}

export const sheen: Effect = ({ call, el }) => {
  if (call.dur <= 0) return undefined;
  const {
    angle = D.angle, bandWidth = D.bandWidth, colour = D.colour, stops = D.stops,
    travel = D.travel, background, loop = false, period = call.step.dur, sweep = D.sweep, easing = D.easing, pseudo, hover = false, blend,
  } = call.step as SheenSettings;
  const from = { transform: `translateX(${travel[0]}%)` };
  const to = { transform: `translateX(${travel[1]}%)` };
  const frames = [{ ...from, offset: 0 }, { ...from, offset: sweep[0], easing }, { ...to, offset: sweep[1] }, { ...to, offset: 1 }];
  const timing = { duration: loop ? period * call.dur / call.step.dur : call.dur, iterations: loop ? Infinity : 1, fill: 'both' as const };
  const hovered = (a: Animation): (() => void) => {
    if (!hover) return () => undefined;
    a.pause();
    const on = (): void => a.play();
    const off = (): void => a.pause();
    el.addEventListener('pointerenter', on);
    el.addEventListener('pointerleave', off);
    return () => {
      el.removeEventListener('pointerenter', on);
      el.removeEventListener('pointerleave', off);
    };
  };
  if (pseudo) {
    const a = el.animate(frames, { ...timing, pseudoElement: pseudo });
    const off = hovered(a);
    return () => {
      off();
      a.cancel();
    };
  }
  const clip = el.ownerDocument.createElement('div');
  clip.setAttribute('aria-hidden', 'true');
  clip.style.cssText = 'position:absolute;inset:0;overflow:hidden;border-radius:inherit;pointer-events:none;container-type:size';
  const axis = el.ownerDocument.createElement('div');
  axis.style.cssText = 'position:absolute;inset:0';
  axis.style.rotate = `${angle - 90}deg`;
  const band = el.ownerDocument.createElement('div');
  band.style.cssText = 'position:absolute;left:0;top:50%;translate:0 -50%;height:calc(100cqw + 100cqh)';
  band.style.width = `${bandWidth}%`;
  if (background) band.style.background = background;
  else band.style.backgroundImage = `linear-gradient(90deg, transparent ${stops[0]}%, ${colour} 50%, transparent ${stops[1]}%)`;
  if (blend) clip.style.mixBlendMode = blend;
  axis.append(band);
  clip.append(axis);
  el.append(clip);
  try {
    const animation = band.animate(frames, timing);
    const off = hovered(animation);
    return () => {
      off();
      animation.cancel();
      clip.remove();
    };
  } catch (error) {
    clip.remove();
    throw error;
  }
};

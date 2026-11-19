import type { Rect } from '../motion-frame/index.ts';
import type { Effect } from './effects.ts';
import { place } from './layer.ts';
import { centre, px, rand, scene } from './beam-dom.ts';

import { COLLAPSE_DEFAULTS as D } from './defaults.ts';
type Scene = ReturnType<typeof scene>;
const spread = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const r = rand(i, 0);
    return { angle: (i / n) * 360 + (r - 0.5) * (300 / n), reach: 0.7 + r * 0.3, delay: r * 0.12 };
  });

type Way = 'in' | 'out';

/** White streaks on lines through the token's centre: 'in' pulls points into long streaks and into the centre; 'out' the reverse. */
function streaks(stage: Scene, cx: number, cy: number, size: number, way: Way, duration: number, start: number, n: number, colour: string, reachScale: number, length: number): void {
  spread(n).forEach(({ angle, reach, delay }) => {
    const len = size * length;
    const thick = Math.max(1, size * 0.03);
    const streak = stage.stand([cx, cy - thick / 2, len, thick], {
      zIndex: '1',
      transformOrigin: '0 50%',
      borderRadius: px(thick),
      background: `linear-gradient(to ${way === 'in' ? 'right' : 'left'}, ${colour}, transparent)`,
    });
    const far = size * reachScale * reach;
    const at = (d: number, s: number): string =>
      `rotate(${String(angle)}deg) translateX(${String(d)}px) scaleX(${String(s)})`;
    const frames: Keyframe[] = [
      { offset: 0, transform: at(far, 0.02), opacity: 0, easing: 'ease-in' },
      { offset: 0.3, transform: at(far * 0.7, 0.55), opacity: 1, easing: 'cubic-bezier(0.5, 0, 0.9, 0.5)' },
      { offset: 0.8, transform: at(size * 0.05, 0.25), opacity: 1, easing: 'linear' },
      { offset: 1, transform: at(0, 0), opacity: 0 },
    ];
    if (way === 'out')
      frames.reverse().forEach((f, i, all) => {
        f.offset = 1 - (f.offset ?? 0);
        f.easing = all[i + 1]?.easing ?? 'linear';
      });
    stage.play(streak, frames, duration, start + delay * duration);
  });
}

/** The bright point the token collapses into or opens from. */
function point(stage: Scene, cx: number, cy: number, size: number, way: Way, duration: number, start: number, background: string): void {
  const d = size * 0.9;
  const dot = stage.stand([cx - d / 2, cy - d / 2, d, d], { zIndex: '3', borderRadius: '50%', background });
  const frames: Keyframe[] = [
    { offset: 0, transform: 'scale(0)', opacity: 0 },
    { offset: 0.62, transform: 'scale(0.2)', opacity: 0.6, easing: 'ease-out' },
    { offset: 0.86, transform: 'scale(1)', opacity: 1, easing: 'ease-in' },
    { offset: 1, transform: 'scale(0.05)', opacity: 0 },
  ];
  if (way === 'out')
    frames.reverse().forEach((f) => {
      f.offset = 1 - (f.offset ?? 0);
    });
  stage.play(dot, frames, duration, start);
}

const collapse = [
      { offset: 0, transform: 'scale(1)', filter: 'brightness(1)', easing: 'ease-out' },
      {
        offset: 0.22,
        transform: 'scale(1.06)',
        filter: 'brightness(1.4)',
        easing: 'cubic-bezier(0.6, 0, 0.9, 0.4)',
      },
      { offset: 0.84, transform: 'scale(0.04)', filter: 'brightness(3)', opacity: 1, easing: 'linear' },
      { offset: 1, transform: 'scale(0)', filter: 'brightness(3)', opacity: 0 },
    ];
const expand = [
      { offset: 0, transform: 'scale(0)', filter: 'brightness(3)', opacity: 0 },
      {
        offset: 0.16,
        transform: 'scale(0.04)',
        filter: 'brightness(3)',
        opacity: 1,
        easing: 'cubic-bezier(0.1, 0.6, 0.4, 1)',
      },
      { offset: 0.78, transform: 'scale(1.06)', filter: 'brightness(1.4)', easing: 'ease-in-out' },
      { offset: 1, transform: 'scale(1)', filter: 'brightness(1)' },
    ];

export interface CollapseSettings {
  colour?: string;
  n?: number;
  reach?: number;
  length?: number;
  pointLight?: string;
  outMs?: number;
  gapMs?: number;
  inMs?: number;
  /** called once, when the collapse has ended and the hold begins (the actor is invisible: swap content or move the real piece); on a skip it is called at the end if it has not run */
  holdBetween?: (info: { el: HTMLElement; from: Rect; to: Rect }) => void;
}

export const collapseJump: Effect = ({ call, el, layer, run, animate }) => {
  const { colour = D.colour, n = D.n, reach = D.reach, length = D.length,
    pointLight = 'radial-gradient(circle, white 0 12%, rgb(255 255 255 / .75) 26%, transparent 62%)',
    outMs = D.outMs, gapMs = D.gapMs, inMs = D.inMs, holdBetween } = call.step as CollapseSettings;
  const stage = scene({ call, el, layer, run, animate });
  const to = call.to ?? call.from;
  const inAt = outMs + gapMs;
  const dx = to[0] - call.from[0];
  const dy = to[1] - call.from[1];
  stage.play(el, collapse, outMs);
  const incoming = expand.map(({ transform, ...frame }) => ({
    ...frame, transform: `translate(${px(dx)}, ${px(dy)}) ${transform}`,
  }));
  stage.play(el, incoming, inMs, inAt, 'linear', 'forwards');
  for (const [box, way, ms, start] of [[call.from, 'in', outMs, 0], [to, 'out', inMs, inAt]] as const) {
    const [x, y] = centre(box);
    const size = Math.max(box[2], box[3]);
    streaks(stage, x, y, size, way, ms, start, n, colour, reach, length);
    point(stage, x, y, size, way, ms, start, pointLight);
  }
  let held = holdBetween === undefined;
  const hold = (): void => {
    if (held) return;
    held = true;
    holdBetween?.({ el, from: call.from, to });
  };
  const timer = setTimeout(hold, outMs * (call.dur / Math.max(1, Number(call.step.dur))));
  return () => {
    clearTimeout(timer);
    hold();
    stage.end();
    place(el, to);
    el.style.opacity = '1';
  };
};

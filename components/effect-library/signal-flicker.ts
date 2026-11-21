import type { Effect } from './effects.ts';
import { lerp, noise, pulse, seg } from './particles.ts';

interface Buzz {
  window?: readonly [number, number];
  sampleMs?: number;
  timeOffset?: number;
  period?: number;
  peak?: number;
  brightness?: readonly [number, number];
  noiseMs?: number;
  threshold?: number;
  saturation?: number;
  hue?: number;
  power?: number;
  jitter?: readonly [number, number];
  jitterMs?: readonly [number, number];
}

export interface FlickerSettings {
  times?: number;
  ease?: string;
  grey?: { grayscale?: number; brightness?: number };
  colour?: string;
  loop?: boolean;
  period?: number;
  style?: Partial<CSSStyleDeclaration>;
  frames?: readonly Keyframe[];
  buzz?: Buzz | true;
}

function buzzFrames(b: Buzz, duration: number): Keyframe[] {
  const n = Math.max(1, Math.ceil(duration / (b.sampleMs ?? 4)));
  const [start, end] = b.window ?? [0, duration];
  const [jx, jy] = b.jitter ?? [0, 0];
  const [xm, ym] = b.jitterMs ?? [9, 11];
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = duration * i / n;
    const local = b.period ? t % b.period : t;
    const k = seg(local, start, end);
    const amount = b.power === undefined ? pulse(local, start, end, b.peak) : Math.sin(Math.PI * k) ** b.power;
    const since = t + (b.timeOffset ?? 0);
    const bright = (b.brightness ?? [.5, 2])[noise(since / (b.noiseMs ?? 50), b.power === undefined ? 2 : 5) > (b.threshold ?? 0) ? 1 : 0];
    return {
      filter: `brightness(${String(lerp(1, bright, b.power === undefined ? amount : Number(k > 0 && k < 1)))}) saturate(${String(b.saturation ?? 1)}) hue-rotate(${String(amount * (b.hue ?? 0))}deg)`,
      transform: `translate(${String(noise(since / xm, 1) * amount * jx)}px,${String(noise(since / ym, 3) * amount * jy)}px)`,
    };
  });
}

export const flicker: Effect = ({ el, call, animate }) => {
  const { times = 2, colour = 'rgb(255 255 255 / .25)', loop, period, style, frames, buzz, grey, ease = 'linear' } = call.step as FlickerSettings;
  const duration = period ?? Number(call.step['dur'] ?? call.dur);
  const options = {
    duration: period === undefined ? call.dur : call.dur * period / Number(call.step['dur']),
    easing: ease, iterations: loop ? Infinity : 1, fill: 'both' as const,
  };
  if (buzz) {
    animate(buzzFrames(buzz === true ? {} : buzz, duration), undefined, options);
    return undefined;
  }
  const veil = el.ownerDocument.createElement('div');
  Object.assign(veil.style, { position: 'absolute', inset: '0', background: colour, pointerEvents: 'none' }, style);
  el.append(veil);
  const keys = frames ?? Array.from({ length: 2 * Math.max(0, Math.floor(times)) + 1 }, (_, i) => ({ opacity: i % 2 }));
  const animation = veil.animate([...keys], options);
  const filter = grey && el.animate(keys.map(({ opacity, ...timing }: Keyframe) => ({
    ...timing,
    filter: `grayscale(${String(Number(opacity ?? 1) * (grey.grayscale ?? 1))}) brightness(${String(lerp(1, grey.brightness ?? 1, Number(opacity ?? 1)))})`,
  })), options);
  return () => {
    animation.cancel();
    filter?.cancel();
    veil.remove();
  };
};

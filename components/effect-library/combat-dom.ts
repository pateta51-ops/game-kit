import type { Rect } from '../motion-frame/index.ts';
import type { Effect } from './effects.ts';
import { centre, px, scene } from './beam-dom.ts';
import { ease, seg } from './particles.ts';
import { PROJECTILE_DEFAULTS as PJ } from './defaults.ts';

type Point = readonly [number, number];
interface PulseLook {
  box?: Rect;
  radius?: string;
  colour?: string;
  width?: number;
  shadow?: string;
  background?: string;
  frames?: Keyframe[];
  easing?: string;
  delay?: number;
  ms?: number;
}

export interface RingPulseSettings extends PulseLook {
  count?: number;
  period?: number;
  shockwaves?: readonly { delay?: number; ms?: number; radius?: number; width?: number; alpha?: number; squash?: number; borderWidth?: number; outlineWidth?: number; outlineOffset?: number;
    /** K435-6: alpha share at time k in 0..1 (default (1-k)^3), radius in px before `unit` (default radius * outExpo(k)), width in px before `unit` (default width * (1 - k/2)) */
    alphaAt?: (k: number) => number; radiusAt?: (k: number) => number; widthAt?: (k: number) => number }[];
  outline?: string;
  unit?: number;
  clip?: Rect;
  /** K436: the rings' CSS box-sizing (default border-box) */
  boxSizing?: string;
}

const pulseFrames = [
  { opacity: 0, transform: 'scale(1)' },
  { opacity: 1, transform: 'scale(1.03)', offset: .3 },
  { opacity: 0, transform: 'scale(1.12)' },
];

export const ringPulse: Effect = (fx) => {
  const { call } = fx;
  const { box = call.from, radius = '50%', colour = '255 255 255', width = 2, shadow, background, frames = pulseFrames,
    easing = 'ease-out', delay = 0, count = 1, ms = (call.step.dur - delay) / Math.max(1, count), period = ms,
    shockwaves, outline = '255 255 255', unit = 1, clip, boxSizing } = call.step as RingPulseSettings;
  const stage = scene(fx);
  if (shockwaves) {
    const [x, y] = centre(box);
    const holder = clip && stage.stand(clip, { overflow: 'hidden' });
    for (const w0 of shockwaves) {
      const wave = { delay: 0, ms: 700, radius: 160, width: 24, alpha: 1, ...w0 };
      const max = wave.radiusAt ? Math.max(...Array.from({ length: 61 }, (_, i) => wave.radiusAt?.(i / 60) ?? 0)) * unit : wave.radius * unit;
      const ring = stage.stand([x - max - (clip?.[0] ?? 0), y - max - (clip?.[1] ?? 0), 2 * max, 2 * max], { borderRadius: radius, ...(boxSizing ? { boxSizing } : {}) });
      holder?.append(ring);
      stage.play(ring, Array.from({ length: 61 }, (_, i): Keyframe => {
        const k = i / 60;
        const s = Math.max(wave.radiusAt ? wave.radiusAt(k) * unit / Math.max(1, max) : ease.outExpo(k), 1 / Math.max(1, max));
        const a = wave.alpha * (wave.alphaAt ? wave.alphaAt(k) : (1 - k) ** 3);
        const w = (wave.widthAt ? wave.widthAt(k) : wave.width * (1 - k * .5)) * unit;
        const size = (v: number) => px(v / s);
        return {
          transform: `scale(${s},${s * (wave.squash ?? 1)})`,
          border: `${size((wave.borderWidth ?? 7) * unit)} solid rgb(${colour} / ${a * .5})`,
          outline: `${size((wave.outlineWidth ?? 2.2) * unit)} solid rgb(${outline} / ${a})`,
          outlineOffset: size((wave.outlineOffset ?? -4.6) * unit),
          boxShadow: `inset 0 0 ${size(w)} ${size(w / 3)} rgb(${colour} / ${a * .22})`,
          opacity: i ? 1 : 0,
        };
      }), wave.ms, delay + wave.delay, 'linear', 'none');
    }
  } else {
    for (let i = 0; i < count; i++) {
      const ring = stage.stand(box, {
        borderRadius: radius, opacity: '0', background: background ?? '', boxShadow: shadow ?? '',
        border: `${px(width)} solid rgb(${colour})`, ...(boxSizing ? { boxSizing } : {}),
      });
      stage.play(ring, frames, ms, delay + i * period, easing, 'none');
    }
  }
  return stage.end;
};

export interface ShimmerSettings {
  colour?: string;
  rim?: string;
  core?: string;
  rippleColour?: string;
  pad?: number;
  hit?: Point;
  rippleSize?: number;
  rippleWidth?: number;
  rippleMs?: number;
  delay?: number;
  ms?: number;
  frames?: Keyframe[];
  rippleFrames?: Keyframe[];
  hitStops?: readonly [coreAlpha: number, colourAlpha: number, colourAt: number, clearAt: number];
  rimStops?: readonly [clearAt: number, colourAt: number, colourAlpha: number, rimAt: number, rimAlpha: number];
  jolt?: { vector: Point; ms?: number };
  /** K436: the ripple ring shows its first frame during `delay` (default hidden until it starts) */
  rippleEarly?: boolean;
}

export const shimmer: Effect = (fx) => {
  const { call } = fx;
  const { colour = '255 255 255', rim = colour, core = '255 255 255', rippleColour = 'rgb(255 255 255 / .9)',
    pad = .14, hit = [.5, .45], rippleSize = .3, rippleWidth, delay = 0, ms = call.step.dur - delay, rippleMs = ms * .8,
    frames, rippleFrames, jolt, rippleEarly = false, hitStops: [hot, tint, tintAt, clearAt] = [.6, .3, 14, 34],
    rimStops: [innerAt, bandAt, band, edgeAt, edge] = [72, 86, .18, 97, .65] } = call.step as ShimmerSettings;
  const [x, y, w, h] = call.from;
  const p = w * pad;
  const bw = w + 2 * p, bh = h + 2 * p;
  if (bw <= 0 || bh <= 0) return;
  const dx = w * hit[0], dy = h * hit[1];
  const hx = (dx + p) * 100 / bw, hy = (dy + p) * 100 / bh;
  const stage = scene(fx);
  const bubble = stage.stand([x - p, y - p, bw, bh], {
    borderRadius: '50%', mixBlendMode: 'screen', opacity: '0',
    background: `radial-gradient(circle at ${hx}% ${hy}%, rgb(${core} / ${hot}), rgb(${colour} / ${tint}) ${tintAt}%, rgb(${colour} / 0) ${clearAt}%), radial-gradient(closest-side, rgb(${colour} / 0) ${innerAt}%, rgb(${colour} / ${band}) ${bandAt}%, rgb(${rim} / ${edge}) ${edgeAt}%, rgb(${colour} / 0) 100%)`,
  });
  stage.play(bubble, frames ?? [
    { offset: 0, transform: 'scale(.94)', opacity: 0, easing: 'ease-out' },
    { offset: .12, transform: 'scale(1)', opacity: 1 },
    { offset: .3, opacity: .6 },
    { offset: .45, opacity: .9 },
    { offset: .7, transform: 'scale(1.02)', opacity: .55, easing: 'ease-in' },
    { offset: 1, transform: 'scale(1.06)', opacity: 0 },
  ], ms, delay);
  const d = w * rippleSize;
  const ring = stage.stand([x + dx - d / 2, y + dy - d / 2, d, d], {
    borderRadius: '50%', border: `${px(rippleWidth ?? Math.max(1.5, w * .008))} solid ${rippleColour}`, opacity: '0',
  });
  stage.play(ring, rippleFrames ?? [
    { transform: 'scale(.2)', opacity: 1, easing: 'cubic-bezier(.2,.7,.4,1)' },
    { transform: 'scale(3.2)', opacity: 0 },
  ], rippleMs, delay, 'linear', rippleEarly ? 'backwards' : 'none');
  if (jolt) {
    const [jx, jy] = jolt.vector;
    stage.play(fx.el, [
      { transform: 'none', easing: 'ease-out' },
      { offset: .25, transform: `translate(${px(jx)}, ${px(jy)})`, easing: 'ease-in-out' },
      { offset: .6, transform: `translate(${px(-jx * .35)}, ${px(-jy * .35)})` },
      { transform: 'none' },
    ], jolt.ms ?? 300, delay, 'linear', 'none');
  }
  return stage.end;
};

export interface ProjectileSettings {
  fromPoint?: Point;
  toPoint?: Point;
  colour?: string;
  core?: string;
  headColour?: string;
  spotColour?: string;
  width?: number;
  speed?: number;
  travelMs?: number;
  delay?: number;
  headScale?: number;
  spotSize?: number;
  headFadeMs?: number;
  /** K436: the head shows at the source during `delay` (default hidden until launch) */
  headEarly?: boolean;
  sourceLight?: { background: string; shadow?: string; radius?: string; frames?: Keyframe[] };
  miss?: { past: number; fadeMs: number; mask?: string };
  flicker?: readonly { at: number; width: number; opacity: number; easing?: string }[];
}

export const projectile: Effect = (fx) => {
  const { call } = fx;
  if (!call.to) return;
  const [tx, ty, tw, th] = call.to;
  const { fromPoint: [x, y] = centre(call.from), toPoint: [ax, ay] = [tx + tw / 2, ty + th * .45],
    colour = PJ.colour, core = PJ.core, headColour = colour, spotColour = colour,
    width = Math.max(3, tw * .04), speed, travelMs = PJ.travelMs, delay = PJ.delay, headScale = PJ.headScale, spotSize = tw * .55,
    miss, sourceLight, headFadeMs = PJ.headFadeMs, headEarly = false, flicker = [{ at: 106, width: .8, opacity: .85 }, { at: 190, width: 1.15, opacity: 1 },
      { at: 274, width: .85, opacity: .9 }, { at: 386, width: 1.1, opacity: 1, easing: 'ease-in' }],
  } = call.step as ProjectileSettings;
  const past = 1 + (miss?.past ?? 0);
  const dx = (ax - x) * past, dy = (ay - y) * past;
  const length = Math.hypot(dx, dy);
  const duration = Math.max(1, call.step.dur - delay);
  const travel = Math.min(duration, speed && speed > 0 ? length / speed : travelMs * past);
  const ms = miss ? Math.min(duration, travel + miss.fadeMs) : duration;
  const angle = Math.atan2(dy, dx);
  const rot = (a: number, b = 1) => `rotate(${angle}rad) scale(${a}, ${b})`;
  const move = (k: number, scale: number) => `translate(${px(dx * k)}, ${px(dy * k)}) scale(${scale})`;
  const at = (t: number) => seg(t, 0, ms);
  const stage = scene(fx);
  const beam = stage.stand([x, y - width / 2, length, width], {
    transformOrigin: '0 50%', borderRadius: px(width), zIndex: '4',
    background: `linear-gradient(to bottom, rgb(${colour} / 0), rgb(${colour}) 22%, rgb(${core}) 42% 58%, rgb(${colour}) 78%, rgb(${colour} / 0))`,
    boxShadow: `0 0 ${px(width * 1.4)} ${px(width * .4)} rgb(${colour} / .65)`,
  });
  if (miss?.mask) {
    beam.style.maskImage = miss.mask;
    beam.style.setProperty('-webkit-mask-image', miss.mask);
  }
  const clip0 = miss ? { clipPath: 'inset(0)' } : {};
  stage.play(beam, [
    { offset: 0, transform: rot(0), opacity: 1, ...clip0 },
    { offset: at(travel), transform: rot(1), opacity: 1, ...clip0, easing: miss ? 'ease-in' : 'linear' },
    ...(!miss ? flicker.filter(({ at: t }) => t > 0 && travel + t < ms).map((f) => ({
      offset: at(travel + f.at), transform: rot(1, f.width), opacity: f.opacity, easing: f.easing ?? 'linear',
    })) : []),
    { offset: 1, transform: rot(1, miss ? .3 : .1), opacity: miss ? .2 : 0, ...(miss ? { clipPath: 'inset(0 0 0 100%)' } : {}) },
  ], ms, delay);
  const hd = width * headScale;
  const head = stage.stand([x - hd / 2, y - hd / 2, hd, hd], {
    borderRadius: '50%', opacity: '0', zIndex: '6',
    background: `radial-gradient(circle, rgb(${core}) 0 18%, rgb(${headColour} / .9) 32%, rgb(${colour} / .45) 52%, rgb(${colour} / 0) 70%)`,
  });
  stage.play(head, [
    { offset: 0, transform: move(0, .6), opacity: 1 },
    { offset: miss ? 1 / past : travel / Math.min(ms, travel + headFadeMs), transform: move(1 / past, 1), opacity: 1, easing: miss ? 'linear' : 'ease-out' },
    { offset: 1, transform: move(1, miss ? .7 : 1.6), opacity: 0 },
  ], miss ? travel : Math.min(ms, travel + headFadeMs), delay, 'linear', headEarly ? 'both' : 'forwards');
  if (!miss) {
    const spot = stage.stand([ax - spotSize / 2, ay - spotSize / 2, spotSize, spotSize], {
      borderRadius: '50%', zIndex: '5',
      background: `radial-gradient(circle, rgb(${core}) 0 10%, rgb(${spotColour} / .8) 26%, rgb(${colour} / 0) 62%)`,
    });
    stage.play(spot, [
      { offset: 0, transform: 'scale(0)', opacity: 0 },
      { offset: at(travel), transform: 'scale(.3)', opacity: 1, easing: 'ease-out' },
      { offset: at(travel + 190), transform: 'scale(1)', opacity: 1 },
      { offset: at(travel + 330), transform: 'scale(.8)', opacity: 1, easing: 'ease-in' },
      { offset: 1, transform: 'scale(1.3)', opacity: 0 },
    ], ms, delay);
  }
  if (sourceLight) {
    const lamp = stage.stand(call.from, {
      mixBlendMode: 'screen', zIndex: '3', background: sourceLight.background, boxShadow: sourceLight.shadow ?? '',
      borderRadius: sourceLight.radius ?? getComputedStyle(fx.el).borderRadius,
    });
    stage.play(lamp, sourceLight.frames ?? (miss ? [
      { opacity: 0 }, { offset: .2, opacity: 1 }, { offset: .6, opacity: .8 }, { opacity: 0 },
    ] : [
      { opacity: .6 }, { offset: Math.min(.12, at(travel)), opacity: 1 },
      { offset: at(travel + 190), opacity: .75 }, { offset: at(travel + 386), opacity: .9, easing: 'ease-in' },
      { opacity: 0 },
    ]), miss ? ms + delay : ms, miss ? 0 : delay);
  }
  return stage.end;
};

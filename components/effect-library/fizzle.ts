// K436: `fizzle` (a card that fizzles: it shakes, greys and a clipped sputter crosses it) and `spark-burst` (sparks out of a box),
// ported from STCC src/ui/motion/effects/fizzle.ts with src/ui/theme/fizzle.css, and fxKit.ts `sparks`.
import type { Rect } from '../motion-frame/index.ts';
import type { Effect } from './effects.ts';
import { px, rand, scene } from './beam-dom.ts';

export interface FizzleSettings {
  /** spec ms of the shake, the grey and the sputter (520, 1000, 520) */
  shakeMs?: number;
  greyMs?: number;
  sputterMs?: number;
  /** the shake's offsets in % of the actor's width (-4, 3.5, -2.5, 1.5) */
  shake?: readonly number[];
  saturate?: number;
  brightness?: number;
  /** space-separated RGB of the sputter (200 210 228) */
  colour?: string;
  /** CSS size of one noise tile */
  grain?: string;
}

const noise = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.8  0 0 0 0 0.84  0 0 0 0 0.9  0 0 0 1.4 -0.35'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>\")";

export const fizzle: Effect = ({ call, el, animate }) => {
  const { shakeMs = 520, greyMs = 1000, sputterMs = 520, shake = [-4, 3.5, -2.5, 1.5], saturate = 0.3, brightness = 0.85,
    colour = '200 210 228', grain = 'calc(var(--u, 4px) * 6)' } = call.step as FizzleSettings;
  const sc = call.dur / Math.max(1, Number(call.step.dur));
  const offsets = [0.12, 0.3, 0.48, 0.66];
  animate([{ transform: 'translateX(0)' }, ...shake.map((s, i) => ({ transform: `translateX(${String(s)}%)`, offset: offsets[i] ?? (i + 1) / (shake.length + 1) })),
    { transform: 'translateX(0)', offset: 0.84 }, { transform: 'translateX(0)' }], { transform: el.style.transform }, { duration: Math.max(1, shakeMs * sc), easing: 'ease-out' });
  const grey = `saturate(${String(saturate)}) brightness(${String(brightness)})`;
  animate([{ filter: 'saturate(1) brightness(1)' }, { filter: grey, offset: 0.25 }, { filter: grey, offset: 0.6 }, { filter: 'saturate(1) brightness(1)' }],
    { filter: el.style.filter }, { duration: Math.max(1, greyMs * sc), easing: 'ease-in-out' });
  const doc = el.ownerDocument;
  const position = el.style.position;
  if (doc.defaultView?.getComputedStyle(el).position === 'static') el.style.position = 'relative';
  const clip = doc.createElement('span');
  clip.setAttribute('aria-hidden', 'true');
  clip.style.cssText = 'position:absolute;inset:0;z-index:6;overflow:hidden;border-radius:inherit;pointer-events:none';
  const fx = doc.createElement('span');
  const mask = 'linear-gradient(100deg, transparent 20%, #000 42%, #000 58%, transparent 80%)';
  fx.style.cssText = 'position:absolute;inset:-5% -10%;pointer-events:none;opacity:0;mix-blend-mode:screen';
  fx.style.background = `linear-gradient(100deg, transparent 0%, rgb(${colour} / 0) 25%, rgb(${colour} / .55) 48%, rgb(${colour} / .55) 52%, rgb(${colour} / 0) 75%, transparent 100%), ${noise}`;
  fx.style.backgroundSize = `100% 100%, ${grain} ${grain}`;
  fx.style.maskImage = mask;
  fx.style.setProperty('-webkit-mask-image', mask);
  clip.append(fx);
  el.append(clip);
  const a = fx.animate([
    { transform: 'translateX(-90%)', opacity: 0 },
    { transform: 'translateX(-40%)', opacity: 0.65, offset: 0.2 },
    { transform: 'translateX(-20%)', opacity: 0.2, offset: 0.35 },
    { transform: 'translateX(20%)', opacity: 0.8, offset: 0.5 },
    { transform: 'translateX(55%)', opacity: 0.3, offset: 0.7 },
    { transform: 'translateX(95%)', opacity: 0 },
  ], { duration: Math.max(1, sputterMs * sc), easing: 'ease-out', fill: 'both' });
  return () => {
    a.cancel();
    clip.remove();
    el.style.position = position;
  };
};

export interface SparkBurstSettings {
  /** stage box the sparks leave from the middle of (default the actor's) */
  box?: Rect;
  count?: number;
  /** CSS colour of the sparks and their glow */
  colour?: string;
  /** spec ms of a spark's life (each lives 75-100 % of it) */
  ms?: number;
  delay?: number;
  /** px: how far they fly (default 0.8 of the box's longer side), their size, how far they drop at the end */
  reach?: number;
  size?: number;
  fall?: number;
  z?: number;
  seed?: number;
}

export const sparkBurst: Effect = (fx) => {
  const { call } = fx;
  const { box = call.from, count = 34, colour = 'white', ms = Number(call.step.dur), delay = 0, size = 8, fall = 0, z = 5, seed = 0 } = call.step as SparkBurstSettings;
  const reach = (call.step as SparkBurstSettings).reach ?? Math.max(box[2], box[3]) * 0.8;
  const x = box[0] + box[2] / 2, y = box[1] + box[3] / 2;
  const stage = scene(fx);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand(i + seed, 14) * 0.5;
    const d = reach * (0.55 + rand(i + seed, 15) * 0.6);
    const s = size * (0.6 + rand(i + seed, 16) * 0.7);
    const cx = Math.cos(a) * d, cy = Math.sin(a) * d;
    const spark = stage.stand([x - s / 2, y - s / 2, s, s], { borderRadius: '50%', background: colour, boxShadow: `0 0 ${px(s * 1.6)} ${colour}`, zIndex: String(z), opacity: '0' });
    stage.play(spark, [
      { transform: 'translate(0,0) scale(1.2)', opacity: 1 },
      { transform: `translate(${px(cx * 0.8)}, ${px(cy * 0.8)}) scale(1)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${px(cx)}, ${px(cy + fall)}) scale(.3)`, opacity: 0 },
    ], ms * (0.75 + rand(i + seed, 17) * 0.25), delay, 'cubic-bezier(.2,.7,.3,1)', 'forwards');
  }
  return stage.end;
};

/** K436: STCC's mission shine as `sheen` settings (play it over 650 ms; MISSION_MS.shine) */
export const MISSION_SHINE = {
  angle: 110, bandWidth: 40, easing: 'ease-in-out', blend: 'screen',
  background: 'linear-gradient(90deg, rgba(255,240,200,0), rgba(255,246,220,.95), rgba(255,240,200,0))',
};
export const MISSION_MS = { shine: 650, sparks: 900 };
/** K436: STCC's two mission spark bursts over a chip at stage box `chip`, as `spark-burst` settings (gold from the icon, pale from 55 % across) */
export function missionSparks(chip: Rect): [SparkBurstSettings, SparkBurstSettings] {
  const [l, t, w, h] = chip;
  const k = Math.max(0.45, Math.min(1.4, h / 56));
  const size = Math.max(3, 12 * k);
  return [
    { box: [l + 10 * k, t, h, h], count: k < 0.6 ? 22 : 34, colour: '#ffd36a', ms: MISSION_MS.sparks, reach: h * 2.4, size, fall: h * 0.4 },
    { box: [l + w * 0.55, t, h, h], count: k < 0.6 ? 12 : 18, colour: '#fff3cf', ms: MISSION_MS.sparks, reach: h * 2, size: size * 0.58 },
  ];
}

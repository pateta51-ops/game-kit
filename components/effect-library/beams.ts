import type { Rect } from '../motion-frame/index.ts';
import type { Effect } from './effects.ts';
import { COLUMN_BEAM_DEFAULTS as C, ROTATING_BEAM_DEFAULTS as R } from './defaults.ts';
import { centre, px, rand, scene } from './beam-dom.ts';

export interface RotatingBeamSettings {
  colour?: string;
  turns?: number;
  beamDeg?: number;
  fadeMs?: number;
  clip?: boolean;
}

export const rotatingBeam: Effect = (fx) => {
  const { call } = fx;
  const { colour = R.colour, turns = R.turns, beamDeg = R.beamDeg, fadeMs = R.fadeMs, clip = false } = call.step as RotatingBeamSettings;
  const stage = scene(fx);
  const ms = call.step.dur;
  const [x, y] = centre(call.from);
  const [, , w, h] = call.from;
  const size = Math.max(w, h) * 3.6;
  const mask = 'radial-gradient(circle closest-side, transparent 0 10%, #000 26%, #000 46%, rgb(0 0 0 / .45) 72%, transparent 100%)';
  const wrap = stage.stand([x - size / 2, y - size / 2, size, size], { zIndex: '4', mixBlendMode: 'screen', maskImage: mask, opacity: '0' });
  wrap.style.setProperty('-webkit-mask-image', mask);
  if (clip) wrap.style.clipPath = `inset(${px((size - h) / 2)} ${px((size - w) / 2)})`;
  const half = beamDeg / 2;
  const wedge = document.createElement('div');
  const rgb = (a: number): string => `rgb(${colour} / ${String(a)})`;
  Object.assign(wedge.style, {
    position: 'absolute',
    inset: '0',
    background: `conic-gradient(from ${String(-half)}deg, ${rgb(.9)} 0deg, ${rgb(.55)} ${String(half * .6)}deg, ${rgb(.95)} ${String(half)}deg, ${rgb(.55)} ${String(half * 1.4)}deg, ${rgb(0)} ${String(beamDeg)}deg, ${rgb(0)} 352deg, ${rgb(.9)} 360deg)`,
    filter: `blur(${px(Math.max(2, h / 70))})`,
  });
  wrap.append(wedge);
  const glow = stage.stand([x - w * .75, y - h * .675, w * 1.5, h * 1.35], {
    zIndex: '2', borderRadius: '50%', background: `radial-gradient(closest-side, ${rgb(.55)}, ${rgb(0)})`, opacity: '0',
  });
  if (clip) glow.style.clipPath = `inset(${px(h * .175)} ${px(w * .25)})`;
  const fade = Math.min(.5, fadeMs / Math.max(1, ms));
  const pulses = Math.max(2, Math.round(turns * 2));
  stage.play(wrap, [{ opacity: 0 }, { opacity: 1, offset: fade }, { opacity: 1, offset: 1 - fade }, { opacity: 0 }], ms);
  stage.play(wedge, [{ transform: 'rotate(0deg)' }, { transform: `rotate(${String(360 * turns)}deg)` }], ms);
  stage.play(glow, Array.from({ length: pulses + 1 }, (_, k) => ({ offset: k / pulses, opacity: k % 2 ? .9 : .35 })), ms);
  return stage.end;
};

export interface ColumnBeamSettings {
  colour?: string;
  way?: 'in' | 'out';
  tuck?: number;
  column?: Rect;
  glitter?: number;
  speck?: number;
  core?: boolean;
  columnLight?: string;
  coreLight?: string;
  speckColour?: string;
  speckGlow?: string;
  /** z-index of the actor over the core light (default 2: under the core; 3 puts it above the core, under the specks) */
  actorZ?: number;
}

export const columnBeam: Effect = (fx) => {
  const { call, el, animate } = fx;
  const { colour = C.colour, way = C.way, tuck = C.tuck, column = call.from, glitter = C.glitter, speck = C.speck, core = C.core,
    columnLight = `radial-gradient(ellipse 46% 50% at 50% 55%, rgb(${colour} / .9), rgb(${colour} / .45) 45%, rgb(${colour} / .12) 70%, transparent 85%)`,
    coreLight = `radial-gradient(ellipse 50% 50% at 50% 55%, rgb(255 255 255 / .95), rgb(${colour} / .6) 40%, transparent 80%)`,
    speckColour = C.speckColour, speckGlow = `rgb(${colour} / .85)`, actorZ = C.actorZ } = call.step as ColumnBeamSettings;
  const stage = scene(fx);
  const [x, y, w, h] = column;
  const [ax, ay, aw, ah] = call.from;
  const shown = Math.max(0, ah - tuck);
  const ms = call.step.dur;
  const out = way === 'out';
  const frames: Keyframe[] = out ? [
    { offset: 0, transform: 'scaleX(0.2)', opacity: 0, easing: 'ease-out' },
    { offset: .2, transform: 'scaleX(1)', opacity: 1 },
    { offset: .6, transform: 'scaleX(.85)', opacity: .9, easing: 'ease-in' },
    { offset: 1, transform: 'scaleX(.04)', opacity: 0 },
  ] : [
    { offset: 0, transform: 'scaleX(.04)', opacity: 0, easing: 'ease-out' },
    { offset: .25, transform: 'scaleX(1)', opacity: 1 },
    { offset: .72, transform: 'scaleX(.9)', opacity: .85, easing: 'ease-in' },
    { offset: 1, transform: 'scaleX(.2)', opacity: 0 },
  ];
  const col = stage.stand([x - w * .1, y - h * .45, w * 1.2, h * 1.7], { background: columnLight, mixBlendMode: 'screen', zIndex: '1' });
  stage.play(col, frames, ms);
  if (core) stage.play(stage.stand([x + w * .3, y - h * .3, w * .4, h * 1.45], { background: coreLight, mixBlendMode: 'screen', zIndex: '2' }), frames, ms);
  for (let i = 0; i < glitter; i++) {
    const size = Math.max(2, aw / 90 * (.7 + rand(i, 6) * .6) * speck);
    const sx = ax + rand(i, 1) * aw;
    const sy = ay + rand(i, 2) * shown;
    const dot = stage.stand([sx - size / 2, sy - size / 2, size, size], {
      borderRadius: '50%', background: speckColour, boxShadow: `0 0 ${px(size * 2)} ${px(size * .6)} ${speckGlow}`, zIndex: '3',
    });
    const dx = (ax + aw / 2 - sx) * .6;
    const dy = -(.35 + rand(i, 3) * .65) * .9 * ah;
    const twinkle = [0, 1, .35, 1, .5, 0].map((opacity, k) => {
      const t = k / 5;
      const q = (out ? t : 1 - t) ** 2;
      return { offset: t, opacity, transform: `translate(${px(dx * q)}, ${px(dy * q)})` };
    });
    const span = ms * (.5 + rand(i, 5) * .18);
    stage.play(dot, twinkle, span, rand(i, 4) * (ms - span));
  }
  const dy = `translateY(${px(-ah * .06)})`;
  const clipPath = tuck > 0 ? `inset(0 0 ${px(tuck)} 0)` : el.style.clipPath;
  animate((out ? [
    { offset: 0, opacity: 1, transform: 'none', filter: 'brightness(1)', easing: 'ease-in' },
    { offset: .25, opacity: 1, transform: 'none', filter: 'brightness(1.7)' },
    { offset: .7, opacity: 0, transform: dy, filter: 'brightness(2.4)' },
    { offset: 1, opacity: 0, transform: dy, filter: 'brightness(2.4)' },
  ] : [
    { offset: 0, opacity: 0, filter: 'brightness(2.4)' },
    { offset: .35, opacity: 0, filter: 'brightness(2.4)', easing: 'ease-out' },
    { offset: .8, opacity: 1, filter: 'brightness(1.5)', easing: 'ease-in-out' },
    { offset: 1, opacity: 1, filter: 'brightness(1)' },
  ]).map((frame) => ({ ...frame, clipPath, zIndex: String(actorZ) })), { opacity: out ? '0' : '1', clipPath }, { easing: 'linear' });
  return stage.end;
};

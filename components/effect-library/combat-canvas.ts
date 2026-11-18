import type { CanvasEffect } from './canvas.ts';
import type { ProjectileSettings } from './combat-dom.ts';
import { centre } from './beam-dom.ts';
import { clamp, ease, glow, lerp, pulse, seg } from './particles.ts';

type Point = readonly [number, number];

export interface BoltSettings extends ProjectileSettings {
  bolt?: 'streak' | 'ribbon';
  unit?: number;
  tail?: number;
  coreWidth?: number;
  alpha?: number;
  lift?: number;
  launchMs?: number;
  fadeMs?: number;
  sourceGlowRadius?: number;
  headGlowRadius?: number;
  sourceGlowMs?: number;
  sourceGlowPeak?: number;
  headGlowAlpha?: number;
  coreAlpha?: number;
  trailMs?: number;
  trailPoints?: number;
}

const mix = (a: Point, b: Point, k: number): [number, number] => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

export const bolt: CanvasEffect = (ctx, t, { call }) => {
  if (!call.to) return;
  const { bolt: mode, fromPoint = centre(call.from), toPoint = centre(call.to),
    delay = 0, unit = 1, speed, travelMs = 170, colour = '255,255,255', core = '#fff',
    tail = .25, width = mode === 'ribbon' ? 12 : 13, coreWidth = mode === 'ribbon' ? width * .19 : 3.5,
    alpha = mode === 'ribbon' ? .32 : .6, lift = 70, launchMs = 220, fadeMs = 200,
    headColour = colour, spotColour = colour, sourceGlowRadius = 46, headGlowRadius = 34,
    sourceGlowMs = 120, sourceGlowPeak = .15, headGlowAlpha = .8, coreAlpha = mode === 'ribbon' ? .9 : 1,
    trailMs = 180, trailPoints = 12,
  } = call.step as BoltSettings;
  const ms = speed && speed > 0 ? Math.hypot(toPoint[0] - fromPoint[0], toPoint[1] - fromPoint[1]) / speed : travelMs;
  const start = delay + (mode === 'ribbon' ? launchMs : 0);
  const k = seg(t, start, start + ms);
  if (mode === 'streak') glow(ctx, ...fromPoint, sourceGlowRadius * unit, spotColour, pulse(t, start, start + sourceGlowMs, sourceGlowPeak));
  if (t <= start || t >= start + ms + (mode === 'ribbon' ? fadeMs : 0)) return;
  const e = ease.in(k);
  const head = mix(fromPoint, toPoint, e);
  const pose = (at: number): Point => {
    const p = ease.inOut(seg(at, start, start + ms));
    const [x, y] = mix([fromPoint[0], fromPoint[1] - lift], toPoint, p);
    return [x, y - Math.sin(p * Math.PI) * lift];
  };
  const time = Math.min(t, start + ms);
  const samples = Math.max(2, Math.floor(trailPoints));
  const points = mode === 'ribbon'
    ? Array.from({ length: samples }, (_, i) => pose(Math.max(start, time - trailMs + i * trailMs / (samples - 1))))
    : [mix(fromPoint, toPoint, clamp(e - tail)), head];
  const fade = mode === 'ribbon' ? 1 - seg(t, start + ms, start + ms + fadeMs) : 1;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.beginPath();
  points.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = `rgba(${colour},${alpha * fade})`;
  ctx.lineWidth = width * unit;
  ctx.stroke();
  ctx.globalAlpha *= fade * coreAlpha;
  ctx.strokeStyle = core;
  ctx.lineWidth = coreWidth * unit;
  ctx.stroke();
  ctx.restore();
  if (mode === 'streak') glow(ctx, ...head, headGlowRadius * unit, headColour, headGlowAlpha);
};

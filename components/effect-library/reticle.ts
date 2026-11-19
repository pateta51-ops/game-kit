import type { Rect } from '../motion-frame/index.ts';
import type { CanvasEffect } from './canvas.ts';
import { RETICLE_DEFAULTS as D } from './defaults.ts';
import { ease, lerp, seg } from './particles.ts';

export interface ReticleSettings {
  box?: Rect;
  unit?: number;
  colour?: string;
  /** Outer and locked padding, before unit scaling. */
  padding?: readonly [number, number];
  length?: number;
  width?: number;
  closeMs?: number;
  fade?: readonly [number, number];
}

export const reticle: CanvasEffect = (ctx, t, { call }) => {
  const { box = call.from, unit = D.unit, colour = D.colour, padding = D.padding, length = D.length, width = D.width,
    closeMs = D.closeMs, fade = D.fade } = call.step as ReticleSettings;
  if (t >= fade[1]) return;
  const u = ease.out(seg(t, 0, closeMs));
  const d = lerp(padding[0], padding[1], u) * unit;
  const n = length * unit;
  ctx.save();
  ctx.strokeStyle = `rgba(${colour},${u * (1 - seg(t, ...fade))})`;
  ctx.lineWidth = width * unit;
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const x = box[0] + (sx > 0 ? box[2] : 0) + sx * d;
      const y = box[1] + (sy > 0 ? box[3] : 0) + sy * d;
      ctx.beginPath();
      ctx.moveTo(x - sx * n, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y - sy * n);
      ctx.stroke();
    }
  ctx.restore();
};

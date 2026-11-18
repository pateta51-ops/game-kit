import type { CanvasEffect } from './canvas.ts';
import { ease, seg } from './particles.ts';

export interface SlashSettings {
  count?: number;
  angle?: number;
  spacing?: number;
  length?: number;
  colour?: string | readonly string[];
  width?: number;
  alpha?: number;
  coreColour?: string;
  coreWidth?: number;
  coreAlpha?: number;
  stagger?: number;
  drawMs?: number;
  fade?: readonly [number, number];
}

export const slash: CanvasEffect = (ctx, t, { call }) => {
  const {
    count = 3, angle = 60, spacing = 0.2, length = 0.9,
    colour = '255,255,255', width = 8, alpha = 0.32,
    coreColour = '255,255,255', coreWidth = 0.19, coreAlpha = 0.9,
    stagger = 40, drawMs = 100, fade = [120, 260],
  } = call.step as SlashSettings;
  const [x, y, w, h] = call.to ?? call.from;
  const radians = angle * Math.PI / 180;
  const dx = Math.cos(radians) * length * w;
  const dy = Math.sin(radians) * length * h;
  ctx.save();
  try {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const at = t - i * stagger;
      if (at <= 0 || at >= fade[1]) continue;
      const a = 1 - seg(at, ...fade);
      const k = ease.out(seg(at, 0, drawMs));
      const startX = x + w * (0.5 + (i - (count - 1) / 2) * spacing) - dx / 2;
      const startY = y + (h - dy) / 2;
      const rgb = typeof colour === 'string' ? colour : colour[i % colour.length] ?? '255,255,255';
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(startX + dx * k, startY + dy * k);
      ctx.strokeStyle = `rgba(${rgb},${a * alpha})`;
      ctx.lineWidth = width;
      ctx.stroke();
      ctx.strokeStyle = `rgba(${coreColour},${a * coreAlpha})`;
      ctx.lineWidth = width * coreWidth;
      ctx.stroke();
    }
  } finally {
    ctx.restore();
  }
};

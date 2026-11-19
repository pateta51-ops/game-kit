import type { CanvasEffect } from './canvas.ts';
import { centre, quadraticPose, type QuadraticFlight } from './paths.ts';
import { seg } from './particles.ts';

export interface TrailSettings {
  quadratic: QuadraticFlight;
  rear: number;
  width: number;
  tipWidth: number;
  fade: number;
  colour: string;
  samples: number;
  spacing: number;
}

export const trail: CanvasEffect = (ctx, t, { call, run }) => {
  const r = call.step['ribbon'] as Partial<TrailSettings> | undefined;
  if (!r || !call.to) return;
  const from = centre(call.from), to = centre(call.to);
  const arc = run?.timeline.calls.find((c) => c.verb === 'arc-move' && c.t === call.t && c.to?.join() === call.to?.join());
  const lift = Number(arc?.step['arcHeight'] ?? 0);
  const s: TrailSettings = { rear: 0, samples: 24, spacing: 28, width: 4, tipWidth: 1, fade: 0.8, colour: '255,255,255', ...r,
    quadratic: r.quadratic ?? { control: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - 2 * lift], blend: 0, lookAhead: 0.02, nose: 0, rollAxis: 0, rollSquash: 0, reverseBrightness: 0 } };
  const sample = (time: number) => quadraticPose(from, to, seg(time, 0, call.step.dur), s.quadratic);
  if (t <= 0 || t >= call.step.dur) return;
  const current = sample(t);
  const rear = (p: typeof current) => ({
    x: p.x + Math.cos(p.heading + Math.PI) * s.rear * p.scale,
    y: p.y + Math.sin(p.heading + Math.PI) * s.rear * p.scale,
  });
  const count = Math.min(s.samples, Math.ceil(t / s.spacing));
  let prev = rear(current);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let j = 1; j < count; j += 1) {
    const next = rear(sample(t - j * s.spacing));
    const a = 1 - j / count;
    ctx.strokeStyle = `rgba(${s.colour},${s.fade * a * current.alpha})`;
    ctx.lineWidth = s.width * a + s.tipWidth;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    prev = next;
  }
  ctx.restore();
};

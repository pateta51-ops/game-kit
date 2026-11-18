import type { Effect } from './effects.ts';
import { startLoop, startPulse, type PulseSettings } from './loops.ts';
import { arc, canDraw, ease, edge, noise, pulse, rng, seg, sparks, star, type ArcOpts, type Box, type Ctx } from './particles.ts';
import { decorativeCopy } from './layer.ts';

export interface CrackleSettings {
  period: number;
  at: number;
  duration: number;
  margin?: number;
  arc?: ArcOpts;
  sparkColour?: string;
}

export interface OrbitSettings {
  referenceWidth?: number;
  radii?: readonly [number, number];
  centerY?: number;
  phaseMs?: number;
  count?: number;
  size?: readonly [number, number];
  alpha?: readonly [number, number];
  twinkle?: readonly [base: number, amplitude: number, msPerRadian: number, phaseStep: number];
  spin?: number;
  track?: string;
  trackWidth?: number;
  rgb?: string;
  glowRgb?: string;
  crackle?: CrackleSettings;
  jitter?: number;
  copySaturation?: number;
  popMs?: number;
}

export interface IdleSettings extends PulseSettings {
  kind: 'bob' | 'breathe' | 'orbit';
  rise?: number;
  orbit?: OrbitSettings;
}

export function startIdle(el: HTMLElement, settings: IdleSettings, state?: Parameters<typeof startLoop>[1]): () => void {
  const { kind, rise = 8, period, orbit } = settings;
  if (kind === 'orbit') return startLoop(el, state ?? {}, (speed) => orbitLoop(el, period ?? 2200, speed, orbit));
  const frames = kind === 'bob'
    ? [{}, { translate: `0 ${String(-rise)}px` }, {}]
    : [{ opacity: 0.5 }, { opacity: 1 }, { opacity: 0.5 }];
  return startPulse(el, { period: 2400, ...settings, frames: settings.frames ?? frames }, state);
}

function drawCrackle(ctx: Ctx, box: Box, t: number, settings: CrackleSettings): number {
  const { period, at, duration, arc: arcSettings, sparkColour = 'rgba(255,255,255,1)' } = settings;
  const loop = Math.floor(t / period);
  const start = loop * period + at;
  const alpha = pulse(t, start, start + duration, 0.2);
  if (alpha <= 0) return 0;
  const random = rng(900 + loop);
  const point = random();
  const count = 1 + Math.floor(random() * 2);
  for (let i = 0; i < count; i++) {
    const [ax, ay] = edge(box, point + i * 0.03);
    const [bx, by] = edge(box, point + 0.05 + i * 0.03 + random() * 0.03);
    arc(ctx, t, ax, ay, bx, by, {
      hz: 35, jag: 7, segments: 6, width: 1.3, fork: false, ...arcSettings,
      seed: (arcSettings?.seed ?? 80) + loop * 3 + i, alpha: alpha * (arcSettings?.alpha ?? 1),
    });
  }
  const [x, y] = edge(box, point + 0.03);
  sparks(ctx, t, { seed: 300 + loop, n: 4, x, y, t0: start, life: 220, speed: 0.35, color: sparkColour, width: 1.4 });
  return alpha;
}

function orbitLoop(el: HTMLElement, period: number, speed: number, {
  referenceWidth, radii = [40, 12], centerY = 0, phaseMs = 0, count = 3, size = [6, 9], alpha = [0.6, 1],
  twinkle = [0.8, 0.2, 100, 2], spin = 0, track = 'currentColor', trackWidth = 1, rgb, glowRgb, crackle, jitter = 0, copySaturation, popMs = 0,
}: OrbitSettings = {}): () => void {
  if (!canDraw()) return () => {};
  const canvas = el.ownerDocument.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const view = el.ownerDocument.defaultView;
  if (!ctx || !view) return () => {};
  canvas.setAttribute('aria-hidden', 'true');
  const [rx, ry] = radii;
  const pad = Math.max(...size) * 2 + trackWidth;
  const top = Math.min(centerY - ry - pad, crackle ? -(crackle.margin ?? 44) : Infinity);
  const twin = copySaturation === undefined && jitter === 0 ? null : decorativeCopy(el);
  if (twin !== null) {
    twin.setAttribute('aria-hidden', 'true');
    twin.inert = true;
    Object.assign(twin.style, {
      position: 'absolute', inset: '0', boxSizing: 'border-box', width: '100%', height: '100%',
      margin: '0', pointerEvents: 'none', transition: 'none', transform: 'none', translate: 'none',
    });
    el.append(twin);
  }
  Object.assign(canvas.style, { position: 'absolute', pointerEvents: 'none', left: '50%', transform: 'translateX(-50%)' });
  el.append(canvas);
  const clock = canvas.animate([{}, {}], { duration: period * speed, iterations: Infinity });
  let frame = 0;
  let lastWidth = 0;
  let lastHeight = 0;
  let lastUnit = 0;
  const draw = (): void => {
    const u = referenceWidth ? el.offsetWidth / referenceWidth : 1;
    if (u > 0) {
      const width = el.offsetWidth / u;
      const height = el.offsetHeight / u;
      const margin = crackle ? (crackle.margin ?? 44) : 0;
      const w = Math.max((rx + pad) * 2, crackle ? width + 2 * margin : 0);
      const h = Math.max(centerY + ry + pad, crackle ? height + margin : -Infinity) - top;
      const dpr = view.devicePixelRatio || 1;
      const nw = Math.ceil(w * u * dpr);
      const nh = Math.ceil(h * u * dpr);
      if (canvas.width !== nw || canvas.height !== nh) {
        canvas.width = nw;
        canvas.height = nh;
      }
      if (w !== lastWidth || h !== lastHeight || u !== lastUnit) {
        lastWidth = w;
        lastHeight = h;
        lastUnit = u;
        canvas.style.width = `${String(w * u)}px`;
        canvas.style.height = `${String(h * u)}px`;
        canvas.style.top = `${String(top * u)}px`;
      }
      const t = Number(clock.currentTime ?? 0) / speed;
      ctx.setTransform(nw / w, 0, 0, nh / h, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const alphaCrackle = crackle ? drawCrackle(ctx, { x: (w - width) / 2, y: -top, w: width, h: height }, t, crackle) : 0;
      if (twin !== null) {
        const flick = 1 + alphaCrackle * 0.35 * (noise(t / 18, 2) > 0 ? 1 : -0.6);
        twin.style.filter = `brightness(${String(flick)}) saturate(${String(copySaturation ?? 1)})`;
        twin.style.translate = alphaCrackle > 0 ? `${String(noise(t / 9, 1) * jitter * u)}px` : '';
      }
      const pop = popMs > 0 ? ease.back(seg(t, 0, popMs)) : 1;
      const cy = centerY - top;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = track === 'currentColor' ? view.getComputedStyle(el).color : track;
      ctx.lineWidth = trackWidth;
      ctx.beginPath();
      ctx.ellipse(w / 2, cy, rx, ry, 0, 0, Math.PI * 2);
      if (trackWidth > 0 && pop > 0) {
        ctx.globalAlpha = Math.min(1, pop);
        ctx.stroke();
      }
      ctx.restore();
      for (let i = 0; i < count; i++) {
        const angle = ((t + phaseMs) / period + i / count) * Math.PI * 2;
        const y = Math.sin(angle);
        const side = y > 0 ? 1 : 0;
        const tw = twinkle[0] + twinkle[1] * Math.sin(t / twinkle[2] + i * twinkle[3]);
        if (size[side] * pop > 0.5) star(ctx, w / 2 + Math.cos(angle) * rx, cy + y * ry, size[side] * pop, angle * spin, alpha[side] * tw, rgb, glowRgb);
      }
    }
    frame = view.requestAnimationFrame(draw);
  };
  draw();
  return () => {
    view.cancelAnimationFrame(frame);
    clock.cancel();
    canvas.remove();
    twin?.remove();
  };
}

export const idle: Effect = ({ call, el }) => {
  const settings = call.step as unknown as IdleSettings & { target?: string; signal?: AbortSignal };
  const target = settings.target === undefined ? el : el.querySelector<HTMLElement>(settings.target);
  if (target === null) return undefined;
  return startIdle(target, settings, {
    speed: call.dur / Math.max(1, call.step.dur),
    ...(settings.signal && { signal: settings.signal }),
  });
};

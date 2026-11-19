import type { Effect, Fx } from './effects.ts';
import { clamp, ease, lerp, pulse, seg } from './particles.ts';

type Box = readonly [number, number, number, number];

interface Pips {
  boxes: readonly Box[];
  sweep: number;
  gap: number;
  empty: string;
  background?: string;
  radius?: number;
  edge?: readonly [number, number];
  edgeColour?: string;
  flash?: { start: number; end: number; peak?: number; colour: string; outline: string; blur: number; width: number };
}

interface Pin {
  delta: readonly [number, number];
  lift?: number;
  liftFactor?: number;
  window?: readonly [number, number];
  glow?: { radius: number; alpha: number; tail: number; peak: number; gradient?: string };
  ring?: { start: number; end: number; from: number; to: number; colour: string; width: number };
  /** K436: the glow draws under the number (default over it) */
  glowUnder?: boolean;
  /** K436: the ring's radius is the middle of its stroke (default its inner edge) */
  ringCentred?: boolean;
  /** K436: the caller's frame clock: called with the draw (step ms), returns its stop; default the kit's own rAF */
  clock?: (draw: (t: number) => void) => () => void;
  /** K436: called once when the pin ends (natural end or skip) */
  onEnd?: () => void;
}

export interface BarFillSettings {
  from?: number;
  to?: number;
  colour?: string;
  ease?: string;
  property?: `--${string}`;
  marker?: {
    selector: string; lift: number; base?: string; ease?: string;
    scales?: readonly [number, number, number, number];
    offsets?: readonly [number, number];
  };
  pips?: Pips;
  pin?: Pin;
}

/** Use a WAAPI clock so the frame follows the document timeline and can be scrubbed in the lab. */
function clock({ el, call }: Fx, draw: (t: number) => void): () => void {
  const ms = Number(call.step['dur'] ?? call.dur);
  const timeline = el.animate([{}, {}], { duration: call.dur, fill: 'both' });
  let frame = 0;
  const update = (): void => {
    const t = typeof timeline.currentTime === 'number' ? timeline.currentTime : 0;
    draw(call.dur > 0 ? t * ms / call.dur : ms);
    frame = requestAnimationFrame(update);
  };
  update();
  return () => {
    cancelAnimationFrame(frame);
    timeline.cancel();
  };
}

function pipFill(fx: Fx, p: Pips, from: number, to: number, colour: string): () => void {
  const { el, call } = fx;
  const canvas = el.ownerDocument.createElement('canvas');
  const margin = Math.ceil((p.flash?.blur ?? 0) * 2 + (p.flash?.width ?? 0));
  const dpr = window.devicePixelRatio || 1;
  const w = call.from[2] + 2 * margin;
  const h = call.from[3] + 2 * margin;
  canvas.width = Math.ceil(w * dpr);
  canvas.height = Math.ceil(h * dpr);
  canvas.style.cssText = `position:absolute;left:${String(-margin)}px;top:${String(-margin)}px;width:${String(w)}px;height:${String(h)}px;`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => undefined;
  el.append(canvas);
  ctx.setTransform(dpr, 0, 0, dpr, margin * dpr, margin * dpr);
  const draw = (t: number): void => {
    ctx.clearRect(-margin, -margin, w, h);
    if (p.background) {
      ctx.fillStyle = p.background;
      ctx.fillRect(0, 0, call.from[2], call.from[3]);
    }
    p.boxes.forEach(([x, y, w, h], i) => {
      const a = (i - Math.min(from, to)) * p.gap;
      const sweeping = i >= Math.min(from, to) && i < Math.max(from, to);
      const sweep = ease.out(seg(t, a, a + p.sweep));
      const k = sweeping ? (to < from ? 1 - sweep : sweep) : Number(i < to);
      const f = p.flash;
      const fl = sweeping && f ? pulse(t, a + f.start, a + f.end, f.peak) : 0;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, p.radius ?? 0);
      ctx.clip();
      ctx.fillStyle = p.empty;
      ctx.fillRect(x, y, w, h);
      if (k > 0) {
        ctx.fillStyle = colour;
        if (sweeping && p.edge && p.edgeColour) {
          const g = ctx.createLinearGradient(x, 0, x + w, 0);
          g.addColorStop(0, colour);
          g.addColorStop(clamp(k - p.edge[0]), colour);
          g.addColorStop(clamp(k - p.edge[1]), p.edgeColour);
          g.addColorStop(k, 'transparent');
          ctx.fillStyle = g;
        }
        ctx.fillRect(x, y, w * k, h);
      }
      if (f && fl > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = fl;
        ctx.fillStyle = f.colour;
        ctx.fillRect(x, y, w, h);
      }
      ctx.restore();
      if (f && fl > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = fl;
        ctx.shadowColor = f.outline;
        ctx.shadowBlur = f.blur * dpr * fl;
        ctx.strokeStyle = f.outline;
        ctx.lineWidth = f.width * fl;
        ctx.stroke();
        ctx.restore();
      }
    });
  };
  const stop = clock(fx, draw);
  return () => {
    stop();
    draw(Infinity);
  };
}

function pinFill(fx: Fx, p: Pin, from: number, to: number, colour: string): () => void {
  const { el, call } = fx;
  const [dx, dy] = p.delta;
  const [a, b] = p.window ?? [0, Number(call.step['dur'])];
  const glow = el.ownerDocument.createElement('div');
  const ring = el.ownerDocument.createElement('div');
  for (const node of [glow, ring]) node.style.cssText = 'position:absolute;left:50%;top:50%;translate:-50% -50%;border-radius:50%;pointer-events:none;';
  if (p.glow) {
    const diameter = `${String(p.glow.radius * 2)}px`;
    Object.assign(glow.style, { width: diameter, height: diameter, background: p.glow.gradient ?? `radial-gradient(${colour},transparent 70%)`, mixBlendMode: 'plus-lighter' });
  }
  if (p.ring) ring.style.border = `${String(p.ring.width)}px solid ${p.ring.colour}`;
  if (p.ringCentred) ring.style.boxSizing = 'border-box';
  const text = el.ownerDocument.createTextNode('');
  const over = el.ownerDocument.createElement('span');
  over.style.cssText = 'position:relative;z-index:1';
  over.append(text);
  el.replaceChildren(glow, ring, p.glowUnder ? over : text);
  const at = (x: number, y: number): string => `${String(x)}px ${String(y)}px`;
  const draw = (t: number): void => {
    const k = ease.inOut(seg(t, a, b));
    text.data = String(t >= (a + b) / 2 ? to : from);
    el.style.translate = at(dx * k, dy * k - Math.sin(k * Math.PI) * (p.lift ?? call.from[3] * (p.liftFactor ?? 0.25)));
    if (p.glow) glow.style.opacity = String(p.glow.alpha * pulse(t, a, b + p.glow.tail, p.glow.peak));
    if (p.ring) {
      const hr = seg(t, b + p.ring.start, b + p.ring.end);
      ring.style.opacity = String(hr > 0 && hr < 1 ? 1 - hr : 0);
      ring.style.width = ring.style.height = `${String(2 * lerp(p.ring.from, p.ring.to, ease.out(hr)) + (p.ringCentred ? p.ring.width : 0))}px`;
    }
  };
  const stop = p.clock ? p.clock(draw) : clock(fx, draw);
  return () => {
    stop();
    glow.remove();
    ring.remove();
    if (p.glowUnder) el.replaceChildren(text);
    text.data = String(to);
    el.style.translate = at(dx, dy);
    p.onEnd?.();
  };
}

export const barFill: Effect = (fx) => {
  const { call, el } = fx;
  const { from = 0, to = 1, colour = 'currentColor', ease = 'ease-out', property, marker, pips, pin } = call.step as BarFillSettings;
  if (pin) return pinFill(fx, pin, from, to, colour);
  if (pips) return pipFill(fx, pips, from, to, colour);
  const fill = property ? el : el.ownerDocument.createElement('div');
  const key = property ?? 'width';
  const value = (n: number): string => property ? String(n) : `${String(n * 100)}%`;
  if (!property) {
    fill.style.cssText = 'position:absolute;left:0;top:0;height:100%;border-radius:inherit';
    fill.style.background = colour;
    el.append(fill);
  }
  const options = { duration: call.dur, easing: ease, fill: 'both' as const };
  const sweep = fill.animate([{ [key]: value(from) }, { [key]: value(to) }], options);
  const base = marker?.base ?? 'translate(-50%, -50%)';
  const [start, peak, dip, end] = marker?.scales ?? [1, 1.15, 0.94, 1];
  const [up, down] = marker?.offsets ?? [0.45, 0.82];
  const hop = marker && el.querySelector<HTMLElement>(marker.selector)?.animate([
    { transform: `${base} translateY(0px) scale(${String(start)})` },
    { transform: `${base} translateY(${String(-marker.lift)}px) scale(${String(peak)})`, offset: up },
    { transform: `${base} translateY(0px) scale(${String(dip)})`, offset: down },
    { transform: `${base} translateY(0px) scale(${String(end)})` },
  ], { ...options, easing: marker.ease ?? ease });
  return () => {
    fill.style.setProperty(key, value(to));
    sweep.cancel();
    hop?.cancel();
  };
};

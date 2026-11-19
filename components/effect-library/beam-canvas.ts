import type { VerbCall } from '../motion-frame/index.ts';
import type { CanvasEffect } from './canvas.ts';
import { centre } from './beam-dom.ts';
import { clamp, ease, glow, lerp, noise, rng, seg, pulse, sparks } from './particles.ts';
import { CURVED_BEAM_DEFAULTS as CB } from './defaults.ts';

type Point = readonly [number, number];
type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const WHITE = ['255,255,255', '255,255,255', '255,255,255'] as const;

export interface RadialSettings {
  centre?: Point;
  inward?: boolean;
  seed?: number;
  count?: number;
  alpha?: number;
  unit?: number;
  palette?: readonly [string, string, string];
  pulse?: { lift: number; flightMs: number; colour?: string; core?: string };
}

function streaks(ctx: Ctx, c: Point, k: number, { inward = false, seed = 71, count = 110, alpha = 0.9, unit: u = 1, palette = WHITE }: RadialSettings): void {
  if (k <= 0 || k >= 1) return;
  const R = rng(seed);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i += 1) {
    const a = R() * TAU;
    const r0 = (20 + R() * 160) * u;
    const sp = 0.6 + R() * 0.8;
    const lag = R() * 0.3;
    const kk = clamp((k - lag) / (1 - lag));
    const width = 1 + R() * 2.2;
    const t1 = R();
    const t2 = R();
    if (kk <= 0 || kk >= 1) continue;
    const e = inward ? 1 - ease.out(kk) : ease.in(kk) * 0.5 + kk * 0.5;
    const head = r0 + 1150 * u * sp * e;
    const tail = inward ? head + (260 * sp * (1 - kk) + 40) * u : head * (0.55 + 0.25 * (1 - kk));
    const al = alpha * Math.sin(Math.PI * kk);
    const tint = t1 > 0.7 ? palette[0] : t2 > 0.5 ? palette[1] : palette[2];
    ctx.strokeStyle = `rgba(${tint},${String(al)})`;
    ctx.lineWidth = width * Math.max(0.7, u);
    ctx.beginPath();
    ctx.moveTo(c[0] + Math.cos(a) * tail, c[1] + Math.sin(a) * tail * 0.8);
    ctx.lineTo(c[0] + Math.cos(a) * head, c[1] + Math.sin(a) * head * 0.8);
    ctx.stroke();
  }
  ctx.restore();
}


const qb = (a: Point, c: Point, b: Point, k: number): Point => [
  (1 - k) ** 2 * a[0] + 2 * (1 - k) * k * c[0] + k ** 2 * b[0],
  (1 - k) ** 2 * a[1] + 2 * (1 - k) * k * c[1] + k ** 2 * b[1],
];

export const radialStreaks: CanvasEffect = (ctx, t, { call }) => {
  const settings = call.step as RadialSettings;
  const { centre: c = centre(call.from), pulse: flight, unit = 1 } = settings;
  if (!flight) {
    streaks(ctx, c, seg(t, 0, call.step.dur), settings);
    return;
  }
  const { lift, flightMs, colour = WHITE[0], core = WHITE[0] } = flight;
  const end = Math.min(t, flightMs);
  const alpha = 1 - seg(t, flightMs, flightMs + 200);
  if (alpha <= 0) return;
  const to = centre(call.to ?? call.from);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const k = seg(Math.max(0, end - 180 + i * 180 / 11), 0, flightMs);
    const e = ease.inOut(k);
    const p: Point = [lerp(c[0], to[0], e), lerp(c[1] - lift, to[1], e) - Math.sin(e * Math.PI) * lift];
    if (i === 0) ctx.moveTo(...p);
    else ctx.lineTo(...p);
  }
  ctx.strokeStyle = `rgba(${colour},${String(alpha * .32)})`;
  ctx.lineWidth = 12 * unit;
  ctx.stroke();
  ctx.strokeStyle = `rgba(${core},${String(alpha * .9)})`;
  ctx.lineWidth *= .19;
  ctx.stroke();
  ctx.restore();
};

export interface CurvedBeamSettings {
  control: Point;
  colour?: string;
  moteColour?: string;
  sparkColour?: string;
  unit?: number;
  image?: string;
  size?: readonly [number, number];
  tuck?: boolean;
}

const images = new WeakMap<VerbCall, HTMLImageElement>();
function imageFor(call: VerbCall, src: string): HTMLImageElement {
  const existing = images.get(call);
  if (existing) return existing;
  const image = new Image();
  image.src = src;
  images.set(call, image);
  return image;
}

export const curvedBeam: CanvasEffect = (ctx, t, { call }) => {
  const o = call.step['curve'] as CurvedBeamSettings | undefined;
  if (!o) return;
  const { colour = CB.colour, moteColour = CB.moteColour, sparkColour = CB.sparkColour, unit = CB.unit,
    image, size = CB.size, tuck = CB.tuck } = o;
  const src = centre(call.from);
  const dst = centre(call.to ?? call.from);
  const c = o.control;
  ctx.save();
  ctx.translate(src[0], src[1]);
  ctx.scale(unit, unit);
  ctx.translate(-src[0], -src[1]);
  const a: Point = src;
  const local = ([x, y]: Point): Point => [a[0] + (x - a[0]) / unit, a[1] + (y - a[1]) / unit];
  const b = local(dst);
  const control = local(c);
  const carry = seg(t, 260, 860);
  const lock = ease.out(seg(t, 150, 320));
  const ret = ease.in(seg(t, 860, 1040));
  const uTok = ease.inOut(carry);
  const tok = qb(a, control, b, uTok);
  glow(ctx, ...a, 46, colour, .6 * pulse(t, 0, 420, .4));
  if (lock > 0 && ret < 1) {
    const start = lerp(lerp(1, uTok, lock), 1, ret);
    const pts = Array.from({ length: 41 }, (_, i) => qb(a, control, b, lerp(start, 1, i / 40)));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const [w, alpha] of [[30, .12], [14, .25], [4, .6]] as const) {
      ctx.strokeStyle = `rgba(${colour},${String(alpha * (1 - ret))})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    for (let m = 0; m < 14; m++) {
      const ph = (t / 420 + m / 14) % 1;
      const [x, y] = pts[Math.floor((1 - ph) * 40)]!;
      glow(ctx, x + noise(m, t / 200) * 5, y, 7, moteColour, .9 * (1 - ret) * Math.sin(Math.PI * ph));
    }
    ctx.strokeStyle = `rgba(${colour},${String(.8 * lock * (1 - ret))})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(...b, 34 * lock, 10 * lock, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  const scan = seg(t, 0, 220);
  const inh = ease.in(seg(t, 820, 980));
  const img = image && imageFor(call, image);
  if (scan > 0 && img && img.naturalWidth && inh < 1) {
    const d = lerp(...size, uTok) * (1 - (tuck ? inh : 0));
    ctx.save();
    ctx.translate(...tok);
    ctx.scale(Math.abs(Math.cos(carry * Math.PI * 4)) * .85 + .15, 1);
    glow(ctx, 0, 0, d, colour, .5);
    for (let i = 0; i < 10; i++) {
      const k = clamp(scan * 1.6 - i / 10);
      if (k <= 0) continue;
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.drawImage(img, 0, img.height * i / 10, img.width, img.height / 10, -d / 2, -d / 2 + d * i / 10, d, d / 10 + .5);
    }
    ctx.restore();
    if (scan < 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(${moteColour},.9)`;
      ctx.fillRect(tok[0] - 24, tok[1] - 20 + 40 * scan, 48, 2);
      ctx.restore();
    }
  }
  glow(ctx, ...b, 70, colour, .9 * pulse(t, 940, 1240, .2));
  sparks(ctx, t, { seed: 5, n: 14, x: b[0], y: b[1], t0: 960, life: 380, speed: .35, angle: -Math.PI / 2, spread: Math.PI * 1.2, color: sparkColour, width: 1.6 });
  ctx.restore();
};

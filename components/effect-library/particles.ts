// The canvas particle kit. Every helper is a pure function of time `t` (ms) with seeded randomness, so a frame at a
// given time is always the same picture. Sizes are pixels times `u`, the ratio of the real stage to the one the
// numbers were tuned on. Colours are 'r,g,b' strings the game passes.

export type Ctx = CanvasRenderingContext2D;

export const clamp = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
/** progress of t through [a, b], clamped to 0..1 */
export const seg = (t: number, a: number, b: number): number => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)));

export const ease = {
  linear: (k: number): number => k,
  out: (k: number): number => 1 - (1 - k) ** 3,
  in: (k: number): number => k ** 3,
  inOut: (k: number): number => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2),
  inQuad: (k: number): number => k * k,
  outQuad: (k: number): number => 1 - (1 - k) ** 2,
  outExpo: (k: number): number => (k >= 1 ? 1 : 1 - 2 ** (-10 * k)),
  /** overshoot like cubic-bezier(.3,1.4,.6,1) */
  back: (k: number): number => {
    const c = 1.9;
    return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2;
  },
};

/** a 0..1..0 pulse over [a, b] with a fast attack */
export function pulse(t: number, a: number, b: number, peak = 0.25): number {
  if (t <= a || t >= b) return 0;
  const k = (t - a) / (b - a);
  return k < peak ? ease.out(k / peak) : 1 - ease.inQuad((k - peak) / (1 - peak));
}

/** mulberry32 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** smooth 1D value noise for flicker and buzz (deterministic in x), -1..1 */
export function noise(x: number, seed = 1): number {
  const h = (n: number): number => {
    const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u) * 2 - 1;
}


/** position after `age` ms for velocity v (px/ms) with drag k (1/ms) and gravity g (px/ms²) */
const drift = (v: number, k: number, g: number, age: number): number =>
  (k > 0 ? (v * (1 - Math.exp(-k * age))) / k : v * age) + 0.5 * g * age * age;

export interface SparkOpts {
  seed: number;
  n: number;
  x: number;
  y: number;
  t0: number;
  life?: number;
  speed?: number;
  spread?: number;
  angle?: number;
  drag?: number;
  gravity?: number;
  color?: string | undefined;
  width?: number;
  stagger?: number;
  len?: number;
}

/** Sparks: hot streaks thrown from (x, y), additive; `u` scales speed, length and width. */
export function sparks(ctx: Ctx, t: number, o: SparkOpts, u = 1): void {
  const r = rng(o.seed);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let i = 0; i < o.n; i += 1) {
    const a = (o.angle ?? 0) + (r() - 0.5) * (o.spread ?? Math.PI * 2);
    const sp = (o.speed ?? 0.8) * (0.35 + r() * 0.9) * u;
    const life = (o.life ?? 400) * (0.5 + r() * 0.7);
    const t0 = o.t0 + r() * (o.stagger ?? 0);
    const w = (o.width ?? 2) * (0.6 + r() * 0.8) * u;
    const g = r();    const age = t - t0;
    if (age <= 0 || age >= life) continue;
    const k = o.drag ?? 0.004;
    const grav = (o.gravity ?? 0) * u;
    const p = (ag: number): [number, number] => [
      o.x + drift(Math.cos(a) * sp, k, 0, ag),
      o.y + drift(Math.sin(a) * sp, k, grav, ag),
    ];
    const [x1, y1] = p(age);
    const [x0, y0] = p(Math.max(0, age - (o.len ?? 28)));
    const fade = 1 - age / life;
    ctx.strokeStyle = o.color ?? `rgba(255,${String(180 + g * 60)},${String(90 + g * 60)},1)`;
    ctx.globalAlpha = fade;
    ctx.lineWidth = w * (0.5 + fade * 0.5);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.restore();
}

/** A radial glow (additive unless `mode` says otherwise). */
export function glow(
  ctx: Ctx,
  x: number,
  y: number,
  rad: number,
  rgb: string,
  alpha: number,
  mode: GlobalCompositeOperation = 'lighter',
): void {
  if (alpha <= 0.001 || rad <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = mode;
  const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
  g.addColorStop(0, `rgba(${rgb},${String(alpha)})`);
  g.addColorStop(0.35, `rgba(${rgb},${String(alpha * 0.45)})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  ctx.restore();
}

export interface ArcOpts {
  seed?: number;
  hz?: number;
  segments?: number;
  jag?: number;
  alpha?: number;
  rgb?: string;
  width?: number;
  fork?: boolean;
}

/** A jagged electric arc from a to b, re-rolled every `hz` ms, additive with a soft halo. */
export function arc(
  ctx: Ctx,
  t: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  o: ArcOpts = {},
  u = 1,
): void {
  const step = Math.floor(t / (o.hz ?? 45));
  const r = rng((o.seed ?? 1) * 9973 + step * 31);
  const n = o.segments ?? 10;
  const jag = (o.jag ?? 14) * u;
  const pts: [number, number][] = [[ax, ay]];
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  for (let i = 1; i < n; i += 1) {
    const k = i / n;
    const off = (r() - 0.5) * 2 * jag * Math.sin(Math.PI * k);
    pts.push([ax + dx * k + nx * off, ay + dy * k + ny * off]);
  }
  pts.push([bx, by]);
  const al = o.alpha ?? 1;
  const rgb = o.rgb ?? '255,255,255';
  const w = (o.width ?? 2) * u;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const path = (): void => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
  };
  ctx.strokeStyle = `rgba(${rgb},${String(0.28 * al)})`;
  ctx.lineWidth = w * 5;
  path();
  ctx.stroke();
  ctx.strokeStyle = `rgba(${rgb},${String(0.8 * al)})`;
  ctx.lineWidth = w * 1.8;
  path();
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,255,255,${String(al)})`;
  ctx.lineWidth = w * 0.6;
  path();
  ctx.stroke();
  const fork = pts[2 + Math.floor(r() * Math.max(1, n - 4))];
  if (o.fork !== false && r() > 0.35 && fork !== undefined) {
    const [fx, fy] = fork;
    const fa = Math.atan2(dy, dx) + (r() > 0.5 ? 1 : -1) * (0.5 + r() * 0.7);
    const fl = len * (0.12 + r() * 0.18);
    ctx.strokeStyle = `rgba(${rgb},${String(0.7 * al)})`;
    ctx.lineWidth = w * 0.9;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(
      fx + Math.cos(fa) * fl * 0.5 + (r() - 0.5) * 8 * u,
      fy + Math.sin(fa) * fl * 0.5 + (r() - 0.5) * 8 * u,
    );
    ctx.lineTo(fx + Math.cos(fa) * fl, fy + Math.sin(fa) * fl);
    ctx.stroke();
  }
  ctx.restore();
}

export interface ImpactOpts {
  ms?: number;
  r?: number;
  n?: number;
  life?: number;
  speed?: number;
  angle?: number;
  spread?: number;
  color?: string;
}

/** An impact burst of sparks and a glow pop. */
export function impact(
  ctx: Ctx,
  t: number,
  x: number,
  y: number,
  t0: number,
  rgb: string,
  seed: number,
  o: ImpactOpts = {},
  u = 1,
): void {
  const p = pulse(t, t0, t0 + (o.ms ?? 240), 0.12);
  const rad = (o.r ?? 46) * u;
  glow(ctx, x, y, rad * (0.6 + 0.6 * p), rgb, 0.9 * p);
  glow(ctx, x, y, rad * 0.35, '255,255,255', p);
  sparks(
    ctx,
    t,
    {
      seed,
      n: o.n ?? 14,
      x,
      y,
      t0,
      life: o.life ?? 320,
      speed: o.speed ?? 0.55,
      angle: o.angle ?? 0,
      spread: o.spread ?? Math.PI * 2,
      color: o.color,
      width: 2,
      drag: 0.006,
    },
    u,
  );
}

/** A landing ring: a squash ring in its colour, 260 ms. */
export function landing(ctx: Ctx, t: number, x: number, y: number, t0: number, rgb: string, u = 1): void {
  const k = seg(t, t0, t0 + 260);
  if (k <= 0 || k >= 1) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(${rgb},${String(0.9 * (1 - k))})`;
  ctx.lineWidth = 3 * u;
  ctx.beginPath();
  ctx.ellipse(x, y, (20 + 30 * ease.out(k)) * u, (20 + 22 * ease.out(k)) * u, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** A five-pointed star with a glow. */
export function star(ctx: Ctx, x: number, y: number, r: number, rot: number, a: number, rgb = '255,255,255', glowRgb = rgb): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rr = i % 2 === 1 ? r * 0.42 : r;
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = `rgba(${rgb},${String(a)})`;
  ctx.shadowColor = `rgba(${glowRgb},${String(a)})`;
  ctx.shadowBlur = r * 0.8;
  ctx.fill();
  ctx.restore();
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A point on a box's edge by perimeter fraction u, `pad` outside it. */
export function edge(c: Box, u: number, pad = 3): [number, number] {
  const P = 2 * (c.w + c.h);
  let d = (((u % 1) + 1) % 1) * P;
  if (d < c.w) return [c.x + d, c.y - pad];
  d -= c.w;
  if (d < c.h) return [c.x + c.w + pad, c.y + d];
  d -= c.h;
  if (d < c.w) return [c.x + c.w - d, c.y + c.h + pad];
  d -= c.w;
  return [c.x - pad, c.y + c.h - d];
}

/** Can this page draw the canvas effects (jsdom and very old browsers cannot)? */
export const canDraw = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.requestAnimationFrame === 'function' &&
  typeof CanvasRenderingContext2D !== 'undefined';

export interface EmberOpts {
  seed: number;
  n: number;
  x: number;
  y: number;
  t0: number;
  angle?: number;
  spread?: number;
  speed?: number;
  life?: number;
  stagger?: number;
  size?: number;
  lift?: number;
}

/** Embers: small glowing motes that drift, flicker and cool from yellow to red, additive. */
export function embers(ctx: Ctx, t: number, o: EmberOpts, u = 1): void {
  const r = rng(o.seed);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < o.n; i += 1) {
    const a = (o.angle ?? -Math.PI / 2) + (r() - 0.5) * (o.spread ?? Math.PI * 2);
    const sp = (o.speed ?? 0.12) * (0.3 + r()) * u;
    const life = (o.life ?? 1000) * (0.55 + r() * 0.6);
    const t0 = o.t0 + r() * (o.stagger ?? 200);
    const sz = (o.size ?? 2.4) * (0.5 + r()) * u;
    const age = t - t0;
    if (age <= 0 || age >= life) continue;
    const k = 1 - age / life;
    const wob = noise(age / 140 + i * 7.3, o.seed) * 10 * (1 - k) * u;
    const x = o.x + drift(Math.cos(a) * sp, 0.002, 0, age) + wob;
    const y = o.y + drift(Math.sin(a) * sp, 0.002, -(o.lift ?? 0.00006) * u, age);
    const flick = 0.65 + 0.35 * noise(age / 45 + i, 3);
    const g = Math.round(lerp(70, 220, k));
    const grad = ctx.createRadialGradient(x, y, 0, x, y, sz * 3);
    grad.addColorStop(0, `rgba(255,${String(g + 30)},${String(Math.round(g / 3))},${String(k * flick)})`);
    grad.addColorStop(0.35, `rgba(255,${String(g)},40,${String(k * flick * 0.5)})`);
    grad.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - sz * 3, y - sz * 3, sz * 6, sz * 6);
  }
  ctx.restore();
}

export interface SmokeOpts {
  seed: number;
  n: number;
  x: number;
  y: number;
  t0: number;
  radius?: number;
  life?: number;
  stagger?: number;
  spread?: number;
  rise?: number;
  size?: number;
  alpha?: number;
  rgb?: string;
}

/** Smoke: soft dark puffs that rise, grow and fade, normal blend. */
export function smoke(ctx: Ctx, t: number, o: SmokeOpts, u = 1): void {
  const r = rng(o.seed);
  ctx.save();
  for (let i = 0; i < o.n; i += 1) {
    const a = (r() - 0.5) * Math.PI * 2;
    const d = r() * (o.radius ?? 30) * u;
    const life = (o.life ?? 1300) * (0.7 + r() * 0.5);
    const t0 = o.t0 + r() * (o.stagger ?? 250);
    const age = t - t0;
    if (age <= 0 || age >= life) continue;
    const k = age / life;
    const spread = (o.spread ?? 40) * u;
    const x = o.x + Math.cos(a) * (d + k * spread) + noise(age / 300 + i, 9) * 6 * u;
    const y = o.y + Math.sin(a) * (d + k * spread) * 0.8 - k * (o.rise ?? 30) * u;
    const rad = (o.size ?? 26) * (0.6 + r() * 0.6) * (0.5 + k * 1.3) * u;
    const al = (o.alpha ?? 0.5) * Math.sin(Math.PI * Math.min(1, k * 1.6)) * (1 - k);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const c = o.rgb ?? '40,38,46';
    grad.addColorStop(0, `rgba(${c},${String(al)})`);
    grad.addColorStop(0.6, `rgba(${c},${String(al * 0.55)})`);
    grad.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  ctx.restore();
}

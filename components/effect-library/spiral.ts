import type { Rect } from '../motion-frame/index.ts';
import type { CanvasEffect } from './canvas.ts';
import { centre } from './beam-dom.ts';
import { clamp, ease, glow, lerp, noise, seg } from './particles.ts';

type Ctx = CanvasRenderingContext2D;
type RGB = readonly [number, number, number];
const TAU = Math.PI * 2;
const white = [255, 255, 255] as const;
const depart = { lift: [300, 520], approach: [520, 1120], revolve: [1120, 1720] } as const;
const arrive = { revolve: [380, 880], emerge: [880, 1380], land: [1380, 1520] } as const;

export interface SpiralSettings {
  image: string;
  outward?: boolean;
  centre?: readonly [number, number];
  lift?: number;
  squash?: number;
  orbit?: number;
  parked?: Rect;
  heading?: number;
  nose?: number;
  flip?: boolean;
  unit?: number;
  afterimageFilter?: string;
  tail?: RGB;
  tip?: RGB;
  engine?: string;
  ribbonReach?: number;
}
interface Geo {
  c: readonly [number, number];
  lift: number;
  sq: number;
  orbit: number;
  u: number;
  tail: RGB;
  tip: RGB;
  engine: string;
  ribbonReach: number;
}
interface Ship {
  img: HTMLImageElement;
  p0: [number, number];
  dw: number;
  dh: number;
  h0: number;
  nose: number;
  flip: boolean;
  afterimageFilter: string | undefined;
}

const ad = (a: number, b: number): number => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const angBlend = (a: number, b: number, k: number): number => a + ad(a, b) * k;
const rad = (d: number): number => (d * Math.PI) / 180;

/** The ship's spiral: from its lifted place (e = 0) to the orbit (e = 1), then the last revolution (e = 1 → 2). */
interface Path {
  at: (e: number) => [number, number];
}

function pathOf(g: Geo, s: Ship): Path {
  const p1: [number, number] = [s.p0[0], s.p0[1] - g.lift];
  const r0 = Math.hypot(p1[0] - g.c[0], (p1[1] - g.c[1]) / g.sq);
  const th0 = Math.atan2((p1[1] - g.c[1]) / g.sq, p1[0] - g.c[0]);
  const ro = g.orbit * r0;
  const turn = -TAU * 0.92;
  return {
    at(e) {
      let r: number;
      let th: number;
      if (e <= 1) {
        r = ro + (r0 - ro) * (1 - e) ** 1.25;
        th = th0 + turn * e;
      } else {
        const k = Math.min(1, e - 1);
        r = ro * (1 - k) ** 1.3;
        th = th0 + turn - TAU * k;
      }
      return [g.c[0] + r * Math.cos(th), g.c[1] + g.sq * r * Math.sin(th)];
    },
  };
}

const tangent = (p: Path, e: number, back = false): number => {
  const [x0, y0] = p.at(Math.max(0, e - 0.004));
  const [x1, y1] = p.at(Math.min(1.999, e + 0.004));
  return Math.atan2(y1 - y0, x1 - x0) + (back ? Math.PI : 0);
};

interface ShipAt {
  x: number;
  y: number;
  /** heading, radians */
  h: number;
  sc: number;
  a: number;
  boost: number;
  phase: 'lift' | 'in' | 'out' | 'land';
}

/** The departing ship at `u` ms from D (null: parked or gone). */
function departShip(u: number, g: Geo, s: Ship, p: Path): ShipAt | null {
  const h0 = rad(s.h0);
  if (u >= depart.lift[0] && u < depart.approach[0]) {
    const k = ease.out(seg(u, depart.lift[0], depart.lift[1]));
    return {
      x: s.p0[0],
      y: s.p0[1] - g.lift * k,
      h: h0 - 0.12 * k,
      sc: 1 + 0.22 * k,
      a: 1,
      boost: 0.35 * k,
      phase: 'lift',
    };
  }
  if (u >= depart.approach[0] && u < depart.revolve[0]) {
    const k = seg(u, depart.approach[0], depart.approach[1]);
    const e = ease.in(k) * 0.5 + k * 0.5;
    const [x, y] = p.at(e);
    const h = angBlend(h0 - 0.12, tangent(p, e), ease.out(seg(k, 0, 0.3)));
    return { x, y, h, sc: lerp(1.22, 0.62, e), a: 1, boost: 1, phase: 'in' };
  }
  if (u >= depart.revolve[0] && u < depart.revolve[1]) {
    const k = seg(u, depart.revolve[0], depart.revolve[1]);
    const e = 1 + ease.inQuad(k) * 0.4 + k * 0.6;
    const [x, y] = p.at(e);
    const h = tangent(p, e) + TAU * 0.6 * ease.in(k);
    return { x, y, h, sc: 0.62 * (1 - (e - 1)) ** 0.9, a: 1 - seg(k, 0.86, 1), boost: 1, phase: 'in' };
  }
  return null;
}

/** The arriving ship at `u` ms from A: the departure's path backwards, then the landing. */
function arriveShip(u: number, g: Geo, s: Ship, p: Path): ShipAt | null {
  const h0 = rad(s.h0);
  if (u >= arrive.revolve[0] && u < arrive.revolve[1]) {
    const k = seg(u, arrive.revolve[0], arrive.revolve[1]);
    const kk = 1 - k;
    const e = 1 + ease.inQuad(kk) * 0.4 + kk * 0.6;
    const [x, y] = p.at(e);
    const h = tangent(p, e, true) - TAU * 0.6 * ease.in(kk);
    return { x, y, h, sc: 0.62 * (1 - (e - 1)) ** 0.9, a: seg(k, 0, 0.12), boost: 1, phase: 'out' };
  }
  if (u >= arrive.emerge[0] && u < arrive.emerge[1]) {
    const k = seg(u, arrive.emerge[0], arrive.emerge[1]);
    const kk = 1 - k;
    const e = ease.in(kk) * 0.5 + kk * 0.5;
    const [x, y] = p.at(e);
    const h = angBlend(tangent(p, e, true), h0 - 0.12, ease.inOut(seg(k, 0.62, 1)));
    return { x, y, h, sc: lerp(1.22, 0.62, e), a: 1, boost: 1, phase: 'out' };
  }
  if (u >= arrive.land[0] && u < arrive.land[1]) {
    const k = ease.out(seg(u, arrive.land[0], arrive.land[1]));
    const sq = 1 - 0.04 * Math.sin(Math.PI * k);
    return {
      x: s.p0[0],
      y: s.p0[1] - g.lift * (1 - k),
      h: h0 - 0.12 * (1 - k),
      sc: lerp(1.22, 1, k) * sq,
      a: 1,
      boost: 0.35 * (1 - k),
      phase: 'land',
    };
  }
  return null;
}

function drawShip(ctx: Ctx, s: Ship, st: ShipAt, alpha: number, tint: boolean): void {
  if (alpha <= 0.001 || st.sc <= 0.005) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (tint && s.afterimageFilter) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.filter = s.afterimageFilter;
  }
  ctx.translate(st.x, st.y);
  ctx.rotate(st.h - rad(s.nose));
  if (s.flip) ctx.scale(-1, 1);
  const w = s.dw * st.sc;
  const h = s.dh * st.sc;
  ctx.drawImage(s.img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

const rearOf = (s: Ship, st: ShipAt): [number, number] => {
  const back = st.h + Math.PI;
  const len = Math.max(s.dw, s.dh) * 0.42 * st.sc;
  return [st.x + Math.cos(back) * len, st.y + Math.sin(back) * len];
};

/** The ship, its engine ribbon, afterimages and engine glow (mock.js "the ship"). */
function shipLayer(ctx: Ctx, g: Geo, s: Ship, at: (u: number) => ShipAt | null, u: number): void {
  const st = at(u);
  if (st === null) return;
  if (st.phase === 'lift' || st.phase === 'land') {
    const k = (st.sc - 1) / 0.22;
    ctx.save();
    ctx.globalAlpha = 0.5 * clamp(k);
    ctx.filter = `blur(${String(8 * g.u)}px)`;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(s.p0[0] + 6 * g.u, s.p0[1] + 10 * g.u, s.dw * 0.42, s.dh * 0.3, -0.5, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  if (st.phase === 'in' || st.phase === 'out') {
    const pts: [number, number][] = [];
    for (let j = 0; j <= 16; j += 1) {
      const ps = at(u - j * 14);
      if (ps === null || ps.phase !== st.phase) break;
      pts.push(rearOf(s, ps));
    }
    if (pts.length > 2) {
      const [hx, hy] = pts[0] ?? [0, 0];
      const [tx, ty] = pts[pts.length - 1] ?? [0, 0];
      const core = clamp(1 - Math.hypot(hx - g.c[0], hy - g.c[1]) / (420 * g.u * g.ribbonReach));
      const rgb = g.tail.map((v, i) => Math.round(lerp(v, g.tip[i]!, core))).join(',');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const w = Math.max(0.3, st.sc) * Math.max(0.6, g.u);
      for (const [lw, al] of [
        [16, 0.3],
        [6, 0.75],
        [2, 0.95],
      ] as const) {
        const grad = ctx.createLinearGradient(hx, hy, tx, ty);
        grad.addColorStop(0, `rgba(${lw === 2 ? '255,255,255' : rgb},${String(al * st.a)})`);
        grad.addColorStop(1, `rgba(${rgb},0)`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = lw * w;
        ctx.beginPath();
        pts.forEach(([x, y], j) => (j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.stroke();
      }
      ctx.restore();
    }
    for (let j = 3; j >= 1; j -= 1) {
      const ps = at(u - j * 30);
      if (ps !== null && ps.phase === st.phase) drawShip(ctx, s, ps, (0.28 / j) * st.a, true);
    }
  }
  drawShip(ctx, s, st, st.a, false);
  const [rx, ry] = rearOf(s, st);
  const fl = (0.55 + 0.45 * st.boost + 0.15 * noise(u / 18, 2)) * st.a;
  const k = Math.max(0.3, st.sc) * Math.max(0.6, g.u);
  glow(ctx, rx, ry, (24 + 30 * st.boost) * k, g.engine, fl);
  glow(ctx, rx, ry, 9 * k, '255,255,255', fl);
}


const images = new WeakMap<object, HTMLImageElement>();
const geometry = new WeakMap<object, { g: Geo; s: Ship; p: Path }>();
export const spiralTransfer: CanvasEffect = (ctx, t, { call }) => {
  const o = call.step['spiral'] as SpiralSettings;
  let entry = geometry.get(call);
  if (!entry) {
    let img = images.get(call);
    if (!img) {
      img = new Image();
      img.src = o.image;
      images.set(call, img);
    }
    if (!img.naturalWidth) return;
    const parked = o.parked ?? (o.outward ? call.to ?? call.from : call.from);
    const endpoint: Rect = o.outward ? call.from : call.to ?? call.from;
    const g: Geo = { c: o.centre ?? centre(endpoint), lift: o.lift ?? 34, sq: o.squash ?? .62,
      orbit: o.orbit ?? .2, u: o.unit ?? 1, tail: o.tail ?? white, tip: o.tip ?? white,
      engine: o.engine ?? '255,255,255', ribbonReach: o.ribbonReach ?? 1 };
    const s: Ship = { img, p0: centre(parked), dw: parked[2], dh: parked[3], h0: o.heading ?? 0,
      nose: o.nose ?? 0, flip: o.flip ?? false, afterimageFilter: o.afterimageFilter };
    entry = { g, s, p: pathOf(g, s) };
    geometry.set(call, entry);
  }
  const { g, s, p } = entry;
  const pose = o.outward ? arriveShip : departShip;
  shipLayer(ctx, g, s, (u) => pose(u, g, s, p), t);
};

import type { Rect } from '../motion-frame/index.ts';
import type { CanvasEffect } from './canvas.ts';
import type { Effect } from './effects.ts';
import { centre, px, rand, scene } from './beam-dom.ts';
import { ease, lerp, rng, seg, glow as drawGlow, smoke, type SmokeOpts } from './particles.ts';

type Point = readonly [number, number];

export interface DissolveSettings {
  delay?: number;
  breakMs?: number;
  heatMs?: number;
  shown?: number;
  cols?: number;
  hit?: Point;
  embers?: number;
  heat?: string;
  emberColour?: string;
  core?: string;
  glow?: string;
  heatEdge?: string;
  cutAt?: number;
  heatTail?: number;
  heatFrames?: Keyframe[];
  heatBackground?: string;
  /** K436: ms from the step start before the stand-in (the clone) shows; until then it is hidden, so the live piece shows to the break */
  standInAt?: number;
  emberSize?: { min?: number; divisor?: number; range?: Point };
  emberDrift?: Point;
  emberRise?: Point;
  emberSpan?: Point;
  emberShadow?: Point;
  lift?: { distance: number; spin: number; fade: Point; ms: number; unit?: number; colour?: string; glowRadius?: number; smoke?: Partial<SmokeOpts> };
}

export const dissolve: Effect = (fx) => {
  const { call, el, animate } = fx;
  const [x, y, w, h] = call.from;
  const { delay = 0, breakMs = 900, heatMs = 520, shown = h, cols = 8, hit = [.5, .45], embers = 16,
    heat = '255 255 255', emberColour = '230 230 230', core = '255 255 255', glow = '230 230 230', heatEdge = glow, lift,
    cutAt = .55, heatTail = .6, heatFrames, heatBackground, standInAt,
    emberSize: { min: minEmber = 2, divisor: emberDivisor = 110, range: [sizeMin, sizeMax] = [.6, 1.6] } = {},
    emberDrift: [radialDrift, randomDrift] = [.5, .3], emberRise: [riseMin, riseMax] = [.2, .65],
    emberSpan: [spanMin, spanMax] = [.6, .9], emberShadow: [blur, spread] = [2, .5],
  } = call.step as DissolveSettings;
  const stage = scene(fx);
  const hidden = { opacity: '0' };
  if (lift) {
    const { distance, spin, fade, ms } = lift;
    const sample = (t: number): Keyframe => ({
      transform: `translateY(${px(-distance * seg(t, 0, ms))}) rotate(${spin * seg(t, 0, ms)}rad)`,
      opacity: 1 - seg(t, fade[0], fade[1]) ** 3,
    });
    stage.play(el, Array.from({ length: 51 }, (_, i) => i === 50 ? { ...sample(ms), opacity: 0 } : sample(ms * i / 50)), ms, delay);
    return () => {
      stage.end();
      el.style.opacity = '0';
    };
  }
  if (w <= 0 || shown <= 0 || cols < 1) {
    el.style.opacity = '0';
    return;
  }
  const hx = w * hit[0], hy = shown * hit[1];
  const far = Math.hypot(w, shown);
  const cut = delay + heatMs * cutAt;
  const cw = w / cols, rows = Math.max(1, Math.round(shown / cw)), ch = shown / rows;
  const opacity = el.style.opacity || '1';
  const at = seg(cut, 0, call.step.dur);
  const shows = standInAt === undefined ? 0 : Math.min(at, seg(standInAt, 0, call.step.dur));
  animate([...(shows > 0 ? [{ opacity: 0 }, { offset: shows, opacity: 0 }, { offset: shows, opacity }] : [{ opacity }]), { offset: at, opacity, easing: 'steps(1, jump-start)' }, { offset: at, opacity: 0 }, { opacity: 0 }], hidden, { easing: 'linear' });
  const overlay = stage.stand([x, y, w, shown], {
    borderRadius: getComputedStyle(el).borderRadius, mixBlendMode: 'screen', zIndex: '3',
    background: heatBackground ?? `radial-gradient(circle at ${px(hx)} ${px(hy)}, rgb(${core} / .9), rgb(${heat} / .55) 35%, rgb(${heatEdge} / .25) 75%)`,
  });
  stage.play(overlay, heatFrames ?? [
    { opacity: 0 }, { offset: .35, opacity: .8, easing: 'ease-in' },
    { offset: .55, opacity: 1, easing: 'ease-out' }, { opacity: 0 },
  ], heatMs + breakMs * heatTail, delay);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const n = r * cols + c;
    const left = c * cw, top = r * ch;
    const tile = stage.stand([x + left, y + top, cw + .5, ch + .5], { overflow: 'hidden', zIndex: '2', opacity: '0' });
    const copy = el.cloneNode(true) as HTMLElement;
    Object.assign(copy.style, {
      position: 'absolute', left: px(-left), top: px(-top), width: px(w), height: px(h),
      visibility: 'visible', transform: 'none',
    });
    tile.append(copy);
    const ox = (left + cw / 2 - hx) / far, oy = (top + ch / 2 - hy) / far;
    const dx = ox * w * (.25 + rand(n, 1) * .35) + (rand(n, 2) - .5) * cw;
    const dy = oy * h * .2 - h * (.08 + rand(n, 3) * .18);
    const spin = (rand(n, 4) - .5) * 140;
    const span = breakMs * .6, wait = Math.hypot(ox, oy) * breakMs * .4;
    const frames: Keyframe[] = [
      { offset: 0, transform: 'none', opacity: 1, easing: 'ease-out' },
      { offset: .12, transform: `translate(${px((rand(n, 5) - .5) * cw * .15)}, ${px(-ch * .05)})`, opacity: 1, easing: 'cubic-bezier(.4,0,.9,.6)' },
      { offset: .55, opacity: .85 },
      { offset: 1, transform: `translate(${px(dx)}, ${px(dy)}) rotate(${spin}deg) scale(.15)`, opacity: 0 },
    ];
    stage.play(tile, [
      { offset: 0, transform: 'none', opacity: 1 },
      ...frames.map((frame) => ({ ...frame, offset: (wait + (frame.offset ?? 0) * span) / (wait + span) })),
    ], wait + span, cut, 'linear', 'none');
  }
  for (let i = 0; i < embers; i++) {
    const s = Math.max(minEmber, w / emberDivisor * lerp(sizeMin, sizeMax, rand(i, 6)));
    const left = rand(i, 7) * w, top = rand(i, 8) * shown;
    const node = stage.stand([x + left - s / 2, y + top - s / 2, s, s], {
      borderRadius: '50%', zIndex: '4', opacity: '0',
      background: `rgb(${rand(i, 9) < .35 ? core : emberColour})`,
      boxShadow: `0 0 ${px(s * blur)} ${px(s * spread)} rgb(${glow} / .8)`,
    });
    const dx = (left - hx) * radialDrift + (rand(i, 10) - .5) * w * randomDrift;
    const dy = -h * lerp(riseMin, riseMax, rand(i, 11));
    stage.play(node, [
      { transform: 'none', opacity: 0 },
      { offset: .1, transform: 'none', opacity: 1, easing: 'cubic-bezier(.2,.6,.4,1)' },
      { offset: .6, opacity: .9 },
      { transform: `translate(${px(dx)}, ${px(dy)}) scale(.3)`, opacity: 0 },
    ], breakMs * lerp(spanMin, spanMax, rand(i, 12)), cut + Math.hypot(left - hx, top - hy) / far * breakMs * .4, 'linear', 'none');
  }
  return stage.end;
};

export interface ShatterSettings {
  count?: number;
  grid?: Point;
  jitter?: Point;
  seed?: number;
  motionSeed?: number;
  direction?: Point;
  impact?: Point;
  clipSource?: string;
  sourceBox?: Rect;
  flip?: boolean;
  delay?: number;
  ms?: number;
  unit?: number;
  hotColour?: string;
  coolColour?: string;
  perspective?: number;
  drag?: number;
  coolMs?: number;
  travel?: number;
  speedRange?: Point;
  zRange?: Point;
  rotateX?: Point;
  rotateY?: Point;
  rotateZ?: Point;
  brightness?: Point;
  shadowSize?: Point;
}

export function triangles(gx: number, gy: number, seed: number, [jx, jy]: Point): Point[][] {
  const r = rng(seed);
  const points: Point[] = [];
  for (let j = 0; j <= gy; j++) for (let i = 0; i <= gx; i++) {
    points.push([
      i / gx * 100 + (i === 0 || i === gx ? 0 : (r() - .5) * jx),
      j / gy * 100 + (j === 0 || j === gy ? 0 : (r() - .5) * jy),
    ]);
  }
  const v = (i: number, j: number): Point => points[j * (gx + 1) + i] ?? [0, 0];
  const out: Point[][] = [];
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
    const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1);
    if (r() > .5) out.push([a, b, c], [a, c, d]);
    else out.push([a, b, d], [b, c, d]);
  }
  return out;
}

export const shatter: Effect = (fx) => {
  const { call, el, animate } = fx;
  const [x, y, w, h] = call.from;
  const { grid = [3, 4], count = grid[0] * grid[1] * 2, jitter = [22, 16], seed = 42,
    motionSeed = 7, direction, impact = centre(call.from), clipSource, sourceBox, flip = false,
    delay = 0, ms = call.step.dur - delay, unit = 1, hotColour = '255 255 255', coolColour = '150 150 150',
    perspective = 1100, drag = 380, coolMs = 420, travel = 380, speedRange = [.32, .74],
    zRange = [60, 280], rotateX = [-150, 150], rotateY = [-150, 150], rotateZ = [-260, 260],
    brightness = [.45, 1.5], shadowSize = [2, 7],
  } = call.step as ShatterSettings;
  const stage = scene(fx);
  const holder = stage.stand(call.from, { perspective: px(perspective * unit) });
  const at = seg(delay, 0, call.step.dur);
  const opacity = el.style.opacity || '1';
  animate([{ opacity }, { offset: at, opacity }, { offset: at, opacity: 0 }, { opacity: 0 }], { opacity: '0' }, { easing: 'linear' });
  const random = rng(motionSeed);
  const gx = Math.max(1, Math.floor(grid[0]));
  const gy = Math.max(1, Math.floor(grid[1]), Math.ceil(count / (2 * gx)));
  for (const tri of triangles(gx, gy, seed, jitter).slice(0, Math.max(0, count))) {
    const cx = tri.reduce((a, p) => a + p[0], 0) / 3, cy = tri.reduce((a, p) => a + p[1], 0) / 3;
    const wrap = document.createElement('div');
    Object.assign(wrap.style, { position: 'absolute', inset: '0', opacity: '0', transformOrigin: `${cx}% ${cy}%` });
    const face = clipSource ? document.createElement('div') : el.cloneNode(true) as HTMLElement;
    Object.assign(face.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%', transform: flip ? 'scaleY(-1)' : '',
      visibility: 'visible', clipPath: `polygon(${tri.map(([vx, vy]) => `${vx}% ${flip ? 100 - vy : vy}%`).join(',')})`,
    });
    if (clipSource) {
      const [sx, sy, sw, sh] = sourceBox ?? [0, 0, w, h];
      const url = clipSource.replace(/["\\]/g, '\\$&');
      face.style.background = `url("${url}") ${px(sx)} ${px(flip ? h - sy - sh : sy)} / ${px(sw)} ${px(sh)} no-repeat`;
    }
    wrap.append(face);
    holder.append(wrap);
    const [dx, dy] = direction ?? [x + cx / 100 * w - impact[0], y + cy / 100 * h - impact[1]];
    const d = Math.hypot(dx, dy) || 1;
    const sp = lerp(...speedRange, random());
    const rz = lerp(...rotateZ, random()), rx = lerp(...rotateX, random()), ry = lerp(...rotateY, random());
    const z = lerp(...zRange, random());
    stage.play(wrap, Array.from({ length: 61 }, (_, i): Keyframe => {
      const age = ms * i / 60;
      const k = 1 - Math.exp(-age / drag);
      const distance = sp * travel * k * unit;
      const hot = 1 - seg(age, 0, coolMs);
      const light = `color-mix(in srgb, rgb(${hotColour}) ${hot * 100}%, rgb(${coolColour}))`;
      return {
        transform: `translate3d(${px(dx / d * distance)}, ${px(dy / d * distance)}, ${px(z * k * unit)}) rotateX(${rx * k}deg) rotateY(${ry * k}deg) rotateZ(${rz * k}deg)`,
        filter: `drop-shadow(0 0 ${px(lerp(...shadowSize, hot) * unit)} color-mix(in srgb, ${light} ${(hot * .95 + .05) * 100}%, transparent)) brightness(${lerp(...brightness, hot)})`,
        opacity: 1 - ease.inQuad(seg(i / 60, .55, 1)),
      };
    }), ms, delay, 'linear', 'forwards');
  }
  return stage.end;
};

export const dissolveSmoke: CanvasEffect = (ctx, t, { call, x, y }) => {
  const { delay = 0, lift } = call.step as DissolveSettings;
  if (!lift || t < delay) return;
  const { distance, ms, unit = 1, colour = '220,220,220', glowRadius = 46 } = lift;
  const k = seg(t, delay, delay + ms);
  drawGlow(ctx, x, y - distance * k, glowRadius * unit, colour, Math.sin(k * Math.PI));
  smoke(ctx, t, {
    seed: 91, n: 6, x, y: y - 30 * unit, t0: delay + 220, life: 500,
    stagger: 40, radius: 6, spread: 16, rise: 30, size: 10, alpha: .25, rgb: '70,70,70', ...lift.smoke,
  }, unit);
};

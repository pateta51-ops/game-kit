import type { Rect } from '../motion-frame/index.ts';
import type { Effect } from './effects.ts';
import { centre, px, scene } from './beam-dom.ts';
import { ease, lerp, seg } from './particles.ts';
import { WARP_TRANSFER_DEFAULTS as WT } from './defaults.ts';

interface Frame {
  offset: number;
  col: string;
  colOp: number;
  tok: string;
  tokOp: number;
}
const COL_UP: Frame[] = [
  { offset: 0, col: 'scaleX(0) scaleY(0.2)', colOp: 0, tok: 'translateY(0) scale(1, 1)', tokOp: 1 },
  { offset: 0.14, col: 'scaleX(0.55) scaleY(0.6)', colOp: 0.7, tok: 'translateY(0) scale(1.12, 0.9)', tokOp: 1 },
  { offset: 0.28, col: 'scaleX(0.9) scaleY(0.9)', colOp: 1, tok: 'translateY(-4%) scale(0.86, 1.18)', tokOp: 1 },
  { offset: 0.42, col: 'scaleX(1) scaleY(1)', colOp: 1, tok: 'translateY(-10%) scale(0.98, 1.06)', tokOp: 1 },
  { offset: 0.6, col: 'scaleX(0.75) scaleY(1.04)', colOp: 0.9, tok: 'translateY(-22%) scale(0.55, 1.45)', tokOp: 0.9 },
  { offset: 0.8, col: 'scaleX(0.45) scaleY(1.08)', colOp: 0.55, tok: 'translateY(-40%) scale(0.28, 1.8)', tokOp: 0.5 },
  { offset: 1, col: 'scaleX(0.2) scaleY(1.1)', colOp: 0, tok: 'translateY(-60%) scale(0.1, 2.1)', tokOp: 0 },
];
const COL_DOWN: Frame[] = [
  { offset: 0, col: 'scaleX(0.2) scaleY(1)', colOp: 0, tok: 'translateY(-55%) scale(0.1, 2.1)', tokOp: 0 },
  { offset: 0.2, col: 'scaleX(0.7) scaleY(1)', colOp: 0.8, tok: 'translateY(-35%) scale(0.3, 1.75)', tokOp: 0.6 },
  { offset: 0.38, col: 'scaleX(1) scaleY(1)', colOp: 1, tok: 'translateY(-12%) scale(0.7, 1.35)', tokOp: 1 },
  { offset: 0.56, col: 'scaleX(0.8) scaleY(0.85)', colOp: 0.8, tok: 'translateY(0) scale(1.3, 0.82)', tokOp: 1 },
  { offset: 0.74, col: 'scaleX(0.4) scaleY(0.6)', colOp: 0.45, tok: 'translateY(0) scale(0.9, 1.1)', tokOp: 1 },
  { offset: 0.88, col: 'scaleX(0.15) scaleY(0.48)', colOp: 0.15, tok: 'translateY(0) scale(1.05, 0.96)', tokOp: 1 },
  { offset: 1, col: 'scaleX(0) scaleY(0.4)', colOp: 0, tok: 'translateY(0) scale(1, 1)', tokOp: 1 },
];


type Scene = ReturnType<typeof scene>;
type Point = readonly [number, number];

interface TransferColumn {
  frames?: readonly Frame[];
  width?: number;
  height?: number;
  bottom?: number;
  sparks?: number;
}

export interface TransferSettings {
  from?: Rect | null;
  destination?: Rect;
  mode?: 'column' | 'zip' | 'rise' | 'portal' | 'crossing' | 'pop' | 'grey' | 'bump';
  count?: number;
  stagger?: number;
  image?: string;
  colour?: string;
  glowColour?: string;
  columnLight?: string | false;
  columnUp?: TransferColumn;
  columnDown?: TransferColumn;
  crossing?: boolean;
  crossingDots?: number;
  zipGhosts?: number;
  zipSparks?: number;
  zipPopMs?: number;
  riseMs?: number;
  riseTravelMs?: number;
  popOffsets?: Point;
  lightColour?: string;
  lift?: number;
  counterColour?: string;
  beforeLook?: { opacity: number; filter: string };
  afterLook?: { opacity: number; filter: string };
  portal?: {
    outward?: boolean; startSize: number; endSize: number; alpha?: number;
    collapse?: readonly [number, number]; elapsed?: number; travelMs?: number; travelAt?: number;
    growth?: readonly [number, number];
    spin?: Point;
    vortex?: {
      size: number; open: Point; background?: string; stroke?: string; strokeWidth?: number; alpha?: number;
      armCount?: number; armSegments?: number; armTurns?: number; armRadius?: number; armExponent?: number; armSpin?: number;
      ringMs?: number; ringTurns?: number; ringSpacing?: number; ringScale?: Point; ringAlpha?: number;
    };
  };
  totalLabel?: { text: string; at: Point; font?: string; colour?: string; travel?: number; ms?: number; delay?: number; image?: string };
}

function column(stage: Scene, token: HTMLElement, box: Rect, start: number, out: boolean, light: string | false, glow: string, settings: TransferColumn = {}): void {
  const [x, y] = centre(box);
  const [, , bw, bh] = box;
  const { width = out ? 1.44 : 1.45, height = out ? 4.23 : 4.3, bottom: bottomShare = out ? .65 : .72,
    frames = out ? COL_UP : COL_DOWN, sparks = out ? 16 : 8 } = settings;
  const w = bw * width;
  const h = bh * height;
  const bottom = y + bh * bottomShare;
  const ms = out ? 420 : 320;
  const ease = out ? 'ease-out' : 'ease-in-out';
  if (light !== false) {
    const mask = 'linear-gradient(to right, transparent, #000 35%, #000 65%, transparent)';
    const c = stage.stand([x - w / 2, bottom - h, w, h], {
      zIndex: '3', transformOrigin: '50% 100%', borderRadius: '40% 40% 0 0 / 8% 8% 0 0',
      background: light, mask,
      filter: 'blur(1.5px) brightness(1.4)', mixBlendMode: 'screen',
    });
    c.style.setProperty('-webkit-mask-image', mask);
    stage.play(c, frames.map((f) => ({ offset: f.offset, transform: f.col, opacity: f.colOp })), ms, start, ease);
    let seed = 1;
    const rnd = (): number => {
      const r = Math.sin(++seed * 91.7) * 10000;
      return r - Math.floor(r);
    };
    for (let k = 0; k < sparks; k++) {
      const size = Math.max(3, w * .07);
      const dot = stage.stand([x + (rnd() - .5) * w * .8, bottom - size - rnd() * h * .3, size, size], {
        borderRadius: '50%', background: 'white', boxShadow: `0 0 ${px(Math.max(6, size * 1.6))} ${glow}`, zIndex: '4',
      });
      stage.play(dot, [
        { transform: 'translateY(0) scale(1)', opacity: 0 },
        { opacity: 1, offset: .2 },
        { transform: `translateY(${px(-h * (.4 + rnd() * .6))}) scale(.3)`, opacity: 0 },
      ], ms * (.7 + rnd() * .4), start + rnd() * ms * .25, 'ease-out');
    }
  }
  stage.play(token, frames.map((f) => ({ offset: f.offset, transform: f.tok, opacity: f.tokOp })), ms, start, ease, out ? 'forwards' : 'both');
}

export function crossingLight(stage: Scene, a: Point, b: Point, size: number, start: number, colour: string, light: string, dots = 5): void {
  const lift = Math.abs(b[0] - a[0]) * .12 + size * 2;
  const path = Array.from({ length: 19 }, (_, i) => {
    const t = i / 18;
    const e = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    const x = a[0] + (b[0] - a[0]) * e - size / 2;
    const y = a[1] + (b[1] - a[1]) * e - Math.sin(Math.PI * e) * lift - size / 2;
    return { offset: t, transform: `translate(${px(x)}, ${px(y)})`, opacity: t < .1 ? t * 10 : t > .9 ? (1 - t) * 10 : 1 };
  });
  for (let k = 0; k < dots; k++) {
    const d = Math.max(.1, 1 - k * .15) * size;
    const dot = stage.stand([0, 0, d, d], {
      borderRadius: '50%', background: light, opacity: '0', zIndex: '6',
      boxShadow: `0 0 ${px(size)} ${px(size * .4)} rgb(${colour} / ${String(Math.max(.1, .8 - k * .14))})`,
    });
    stage.play(dot, path.map((frame) => ({ ...frame, opacity: frame.opacity * Math.max(.1, 1 - k * .18) })), 420, start + k * 28);
  }
}

function tokenOf(stage: Scene, el: HTMLElement, box: Rect, image: string | undefined, glow: string, blur: number, extra = ''): HTMLElement {
  const content = image === undefined ? el.cloneNode(true) as HTMLElement : document.createElement('img');
  if (content instanceof HTMLImageElement && image !== undefined) {
    content.src = image;
    content.alt = '';
  }
  return stage.stand(box, {
    filter: `${extra}drop-shadow(0 0 ${px(blur * box[2])} ${glow})`, objectFit: 'contain', opacity: '0', transformOrigin: '50% 100%', zIndex: '4',
  }, content);
}

function zip(stage: Scene, make: (box: Rect, blur: number) => HTMLElement, from: Rect, to: Rect, start: number, glow: string, index: number, settings: TransferSettings): void {
  const { zipGhosts = WT.zipGhosts, zipSparks = WT.zipSparks, zipPopMs = WT.zipPopMs } = settings;
  const [sx, sy] = centre(from);
  const [x, y] = centre(to);
  const d = to[2];
  const box: Rect = [sx - d / 2, sy - d / 2, d, to[3]];
  const scale = from[2] / d;
  const at = (k: number, s: number): string => `translate(${px((x - sx) * k)}, ${px((y - sy) * k)}) scale(${String(s)})`;
  const frame = (opacity: number): Keyframe[] => [
    { transform: at(0, scale), opacity: 0 },
    { transform: at(.06, scale * 1.2), opacity, offset: .12 },
    { transform: at(1, 1), opacity },
  ];
  for (let k = zipGhosts; k >= 1; k--) {
    const opacity = [.45, .28, .14][k - 1] ?? .14;
    const ghost = make(box, .16);
    ghost.style.transformOrigin = '50% 50%';
    stage.play(ghost, frame(opacity), 200, start + k * 22, 'cubic-bezier(.45,.05,.55,1)', 'backwards');
  }
  const token = make(box, .16);
  token.style.transformOrigin = '50% 50%';
  stage.play(token, frame(1), 200, start, 'cubic-bezier(.45,.05,.55,1)');
  stage.play(token, [
    { transform: at(1, 1), opacity: 1, filter: `brightness(1) drop-shadow(0 0 ${px(d * .16)} ${glow})` },
    { transform: at(1, 1.7), opacity: 0, filter: `brightness(2.2) drop-shadow(0 0 ${px(d * .4)} ${glow})` },
  ], zipPopMs, start + 200, 'ease-out', 'forwards');
  for (let k = 0; k < zipSparks; k++) {
    const angle = k * Math.PI * 2 / zipSparks + index;
    const size = d * .13;
    const dot = stage.stand([x - size / 2, y - size / 2, size, size], {
      borderRadius: '50%', background: glow, boxShadow: `0 0 ${px(size)} ${glow}`, opacity: '0', zIndex: '5',
    });
    stage.play(dot, [
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${px(Math.cos(angle) * d * .9)}, ${px(Math.sin(angle) * d * .9)}) scale(.2)`, opacity: 0 },
    ], 250, start + 200, 'ease-out', 'forwards');
  }
}

function portalIcon(stage: Scene, make: (box: Rect, blur: number) => HTMLElement, from: Rect, to: Rect, o: NonNullable<TransferSettings['portal']>, ms: number, lift: number, start: number, image: string | undefined, glow: string): void {
  const { outward = false, startSize, endSize, alpha = .5, collapse, elapsed = 0, travelMs = ms, travelAt = 0, growth, vortex } = o;
  const [sx, sy] = centre(from);
  const [dx, dy] = centre(to);
  const token = make([sx - startSize / 2, sy - startSize / 2, startSize, startSize], 0);
  token.style.transformOrigin = '50% 50%';
  token.style.filter = `drop-shadow(0 0 16px ${glow}) drop-shadow(0 0 3px white)`;
  const [spinRate, spinAccel] = o.spin ?? (outward ? [-1.25, .00035] : [.25, .00042]);
  const spin = (t: number): number => {
    const u = t + elapsed;
    return spinRate * u + spinAccel * u * u;
  };
  const collapseAt = (t: number): number => collapse ? 1 - ease.in(seg(t, ...collapse)) : 1;
  const growthAt = (t: number): number => growth ? ease.out(seg(t, ...growth)) : 1;
  const frames = (frame: (t: number) => Keyframe): Keyframe[] => {
    const n = Math.max(1, Math.ceil(ms / 16));
    return Array.from({ length: n + 1 }, (_, i) => ({ ...frame(i / n * ms), offset: i / n }));
  };
  stage.play(token, frames((t) => {
    const k = seg(t, travelAt, travelAt + travelMs);
    const e = ease.inOut(k);
    const q = outward ? ease.out(k) * .5 + e * .5 : ease.in(k) * .4 + e * .6;
    const grow = growthAt(t);
    const d = outward ? lerp(startSize * grow, endSize, q) : lerp(startSize, endSize, q) * collapseAt(t);
    return {
      opacity: outward ? (k < 1 ? lerp(alpha * grow, .95, e) : 0) : lerp(.95, alpha, e),
      transform: `translate(${px((dx - sx) * e)}, ${px((dy - sy) * e - lift * Math.sin(Math.PI * e))}) scale(${String(d / startSize)}) rotate(${String(spin(t))}deg)`,
    };
  }), ms, start, 'linear', 'forwards');
  if (!vortex) return;
  const [x, y] = outward ? [sx, sy] : [dx, dy];
  const { size, open, background = 'radial-gradient(circle,rgb(255 255 255 / .34),rgb(255 255 255 / .1) 42%,transparent 66%)',
    stroke = 'white', strokeWidth = 2.2, alpha: vortexAlpha = .42, armCount = 4, armSegments = 50,
    armTurns = 1.6, armRadius = 48, armExponent = 1.6, armSpin = .7, ringMs = 1100, ringTurns = 2 / 3,
    ringSpacing = 60, ringScale = [1.15, .05], ringAlpha = .5 } = vortex;
  const mask = 'radial-gradient(closest-side,#000 52%,transparent)';
  const vx = stage.stand([x - size / 2, y - size / 2, size, size], {
    borderRadius: '50%', opacity: '0', background, maskImage: mask, zIndex: '3',
  });
  vx.style.setProperty('-webkit-mask-image', mask);
  const ns = 'http://www.w3.org/2000/svg';
  const arms = document.createElementNS(ns, 'svg');
  arms.setAttribute('viewBox', '0 0 100 100');
  Object.assign(arms.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', fill: 'none',
    stroke, strokeWidth: String(strokeWidth), strokeLinecap: 'round', filter: `drop-shadow(0 0 6px ${glow})` });
  vx.append(arms);
  for (let i = 0; i < armCount; i++) {
    const line = document.createElementNS(ns, 'polyline');
    line.setAttribute('points', Array.from({ length: armSegments + 1 }, (_, k) => {
      const t = k / armSegments;
      const a = i * Math.PI * 2 / armCount + t * Math.PI * (2 * armTurns);
      const r = armRadius * t ** armExponent;
      return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`;
    }).join(' '));
    arms.append(line);
    if (!image) continue;
    const ring = document.createElement('img');
    ring.alt = '';
    ring.src = image;
    Object.assign(ring.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', filter: `drop-shadow(0 0 14px ${glow})` });
    vx.append(ring);
    stage.play(ring, frames((t) => {
      const dir = outward ? -1 : 1;
      const phase = ((Math.max(0, t - (outward ? 0 : open[0])) / ringMs + i / armCount) % 1);
      const k = outward ? 1 - phase : phase;
      return { opacity: ringAlpha * Math.sin(Math.PI * k), transform: `scale(${String(lerp(...ringScale, k))}) rotate(${String(-k * (ringTurns * 360) * dir - i * ringSpacing)}deg)` };
    }), ms, start);
  }
  stage.play(arms, frames((t) => ({ transform: `rotate(${String(spin(t) * armSpin)}deg)` })), ms, start);
  stage.play(vx, frames((t) => {
    const v = (outward && growth ? growthAt(t) : ease.out(seg(t, ...open))) * collapseAt(t);
    return { opacity: Math.min(1, v * 1.3) * vortexAlpha, transform: `scale(${String(.15 + .85 * v)})` };
  }), ms, start);
}

function totalTag(stage: Scene, o: NonNullable<TransferSettings['totalLabel']>, delay: number): void {
  const { text, at, font = '700 24px/1.15 sans-serif', colour = 'white', travel = 24, ms = 1700, image } = o;
  const tag = stage.stand([...at, 0, 0], {
    display: 'flex', alignItems: 'center', gap: '.15em', whiteSpace: 'nowrap', font, color: colour, zIndex: '7', textShadow: '0 0 6px #000',
  });
  tag.style.width = 'max-content';
  tag.style.height = 'auto';
  const label = document.createElement('span');
  label.textContent = text;
  tag.append(label);
  if (image !== undefined) {
    const icon = document.createElement('img');
    icon.src = image;
    icon.alt = '';
    icon.style.height = '.85em';
    tag.append(icon);
  }
  stage.play(tag, [
    { opacity: 0, transform: 'translateY(0)' },
    { opacity: 1, transform: `translateY(${px(travel * .25)})`, offset: .08 },
    { opacity: 1, transform: `translateY(${px(travel * .4)})`, offset: .8 },
    { opacity: 0, transform: `translateY(${px(travel * .8)})` },
  ], ms, o.delay ?? delay, 'ease-out');
}

export const warpTransfer: Effect = (fx) => {
  const { call, el } = fx;
  const settings = call.step as TransferSettings;
  const { from = call.from, destination: to = call.to ?? call.from, mode = WT.mode, count = WT.count, stagger = mode === 'zip' ? WT.zipStagger : WT.stagger,
    image, colour = WT.colour, glowColour = `rgb(${colour})`, lightColour = 'white', crossing = WT.crossing, totalLabel,
    lift = WT.lift, portal, columnUp, columnDown, crossingDots = WT.crossingDots, riseMs = WT.riseMs, riseTravelMs = WT.riseTravelMs,
    columnLight = `linear-gradient(to top, transparent, rgb(${colour} / .75) 22%, rgb(255 255 255 / .95) 50%, rgb(${colour} / .6) 80%, transparent)`,
  } = settings;
  const { counterColour, beforeLook, afterLook, popOffsets = [.45, .75] } = settings;
  if (mode === 'pop' || mode === 'grey' || mode === 'bump') {
    const before = beforeLook ?? { opacity: 1, filter: 'none' };
    const after = afterLook ?? { opacity: 1, filter: 'none' };
    const frames: Keyframe[] = mode === 'pop' ? [
      { transform: 'scale(0)', opacity: 0 },
      { transform: 'scale(1.35)', opacity: 1, offset: popOffsets[0] },
      { transform: 'scale(.92)', offset: popOffsets[1] },
      { transform: 'scale(1)' },
    ] : mode === 'grey' ? [
      { transform: 'scale(1.35)', opacity: before.opacity, filter: before.filter === 'none' ? 'brightness(1.4)' : before.filter },
      { transform: 'scale(.92)', opacity: before.opacity, filter: 'none', offset: .5 },
      { transform: 'scale(1)', ...after },
    ] : [
      { transform: 'scale(1.35)', color: counterColour },
      { transform: 'scale(.92)', color: counterColour, offset: .5 },
      { transform: 'scale(1)' },
    ];
    const end = mode === 'grey' ? { opacity: String(after.opacity), filter: after.filter } : mode === 'pop' ? { opacity: '1' } : undefined;
    fx.animate(frames, end, { easing: 'ease-out' });
    return undefined;
  }
  const stage = scene(fx);
  const visibility = el.style.visibility;
  const make = (box: Rect, blur: number, extra?: string): HTMLElement => tokenOf(stage, el, box, image, glowColour, blur, extra);
  const arrive = from === null ? 0 : 510 + (crossing ? 336 : 0);
  for (let i = 0; i < count; i++) {
    const start = i * stagger;
    if (from && mode === 'portal' && portal) {
      portalIcon(stage, make, from, to, portal, call.step.dur - start, lift, start, image, glowColour);
    } else if (from && mode === 'crossing') {
      crossingLight(stage, centre(from), centre(to), from[2], start, colour, lightColour, crossingDots);
    } else if (from && mode === 'zip') {
      zip(stage, make, from, to, start, glowColour, i, settings);
    } else if (from && mode === 'rise') {
      const [x, y] = centre(from);
      const [tx, ty] = centre(to);
      const token = make(from, .16);
      token.style.transformOrigin = '50% 50%';
      const raised = { opacity: 1, transform: `translateY(${px(-lift)}) scale(1.1)` };
      stage.play(token, [{ opacity: 0, transform: 'translateY(0) scale(.3)' }, raised], riseMs, start, 'cubic-bezier(.2,.8,.3,1)');
      stage.play(token, [raised, { opacity: 1, transform: `translate(${px(tx - x)}, ${px(ty - y)}) scale(1)` }], riseTravelMs, start + riseMs, 'ease-in', 'forwards');
    } else {
      if (from) {
        const [x, y, w, h] = from;
        const box: Rect = [x + (i - (count - 1) / 2) * w * .95, y - (i % 2) * w * .2, w, h];
        const token = make(box, .12, 'drop-shadow(0 2px 3px rgba(0,0,0,.55)) ');
        stage.play(token, [{ opacity: 0, translate: '0 -60%', scale: 1.6 }, { opacity: 1, translate: '0 0', scale: 1 }], 240, start, 'cubic-bezier(0.3, 1.4, 0.5, 1)');
        column(stage, token, box, start + 300, true, columnLight, glowColour, columnUp);
        if (crossing) crossingLight(stage, [box[0] + w / 2, box[1] + h / 2 - w * 1.2], [to[0] + to[2] / 2, to[1] - to[3] * .8], Math.max(6, w * .3), start + 510, colour, lightColour, crossingDots);
      }
      const icon = make(to, .25);
      column(stage, icon, to, start + arrive, false, columnLight, glowColour, columnDown);
      stage.play(icon, [{ opacity: 1 }, { opacity: 1, filter: 'none', offset: .999 }, { opacity: 0 }], 200, start + arrive + 320, 'linear', 'forwards');
    }
  }
  el.style.visibility = 'hidden';
  if (totalLabel) totalTag(stage, totalLabel, mode === 'column' ? arrive + 320 * .56 : 0);
  return () => {
    stage.end();
    el.style.visibility = visibility;
  };
};

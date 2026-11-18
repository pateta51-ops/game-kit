import type { Point, Rect, VerbCall } from '../motion-frame/index.ts';
import { specTime } from './canvas.ts';
import type { Effect, Fx } from './effects.ts';
import { place } from './layer.ts';
import { centre, flightPath, flightPose, multiStopPath, quadraticPose, type CubicFlight, type MultiStopSettings, type QuadraticFlight } from './paths.ts';
import { clamp, seg } from './particles.ts';

export interface ArcMoveSettings {
  /** Pixels above the path's midpoint. */
  arcHeight?: number;
  /** Horizontal and vertical offsets at the apex, as fractions of vertical travel. */
  bank?: number;
  lean?: number;
  apex?: number;
  stagger?: number;
  staggerMax?: number;
  staggerGroup?: string;
  staggerUnscaled?: boolean;
  flightMs?: number;
  clipPath?: string;
  glide?: {
    anchor?: 'destination';
    liftRatio?: number;
    progress?: number;
    swell?: number;
    relativeSwell?: boolean;
    round?: number;
    baseTransform?: string;
    opaque?: boolean;
    plainEnds?: boolean;
  };
  landingWidth?: number;
  via?: { point: Point; rest: readonly [number, number]; width?: number };
  cubic?: CubicFlight;
  quadratic?: QuadraticFlight;
  [more: string]: unknown;
}

const translate = (x: number, y: number): string => `translate(${String(x)}px, ${String(y)}px)`;

function frames(call: VerbCall, draw: (time: number, elapsed: number) => void): () => void {
  const start = performance.now();
  let frame: number;
  const tick = (now: number): void => {
    const elapsed = Math.max(0, now - start);
    draw(specTime(elapsed, call), elapsed);
    frame = requestAnimationFrame(tick);
  };
  tick(start);
  return () => cancelAnimationFrame(frame);
}

function glideFrames(f: Rect, t: Rect, s: ArcMoveSettings): Keyframe[] {
  const [x, y] = centre(f), [tx, ty] = centre(t);
  const { glide: g, via, ease } = s;
  const anchored = g?.anchor === 'destination' || via !== undefined;
  const [ox, oy] = anchored ? [tx, ty] : [x, y];
  const width = anchored ? t[2] : f[2];
  const n = (value: number): number => g?.round ? Math.round(value * g.round) / g.round : value;
  const key = (px: number, py: number, scale: number, offset?: number): Keyframe => ({
    transform: `${translate(n(px - ox), n(py - oy))}${g?.plainEnds && offset === undefined ? '' : ` scale(${String(n(scale))})`}${g?.baseTransform ? ` ${g.baseTransform}` : ''}`,
    ...(offset !== undefined && { offset }),
    ...(g?.opaque && { opacity: 1 }),
  });
  const start = width > 0 ? f[2] / width : 1;
  const end = width > 0 ? t[2] / width : 1;
  if (via) {
    // CSS animation timing applies afresh between consecutive keyframes.
    const mid = key(...via.point, width > 0 ? (via.width ?? width) / width : 1, via.rest[0]);
    const easing = typeof ease === 'string' ? ({ in: 'ease-in', out: 'ease-out', 'in-out': 'ease-in-out' }[ease] ?? ease) : 'ease-in-out';
    return [
      { ...key(x, y, start), easing },
      { ...mid, easing },
      { ...mid, offset: via.rest[1], easing },
      { transform: 'none' },
    ];
  }
  const lift = Math.min(s.arcHeight ?? Infinity, g?.liftRatio === undefined ? s.arcHeight ?? 0 : Math.hypot(tx - x, ty - y) * g.liftRatio);
  const p = g?.progress ?? 0.5;
  return [
    key(x, y, start),
    key(x + (tx - x) * p, y + (ty - y) * p - lift, (g?.relativeSwell ? (start + end) / 2 : 1) + (g?.swell ?? 0), s.apex ?? 0.5),
    key(tx, ty, end),
  ];
}

export const arcMove: Effect = (fx) => {
  const { call, run, el, animate } = fx;
  const f = call.from;
  if (!call.to) return undefined;
  const s = call.step as ArcMoveSettings;
  const { arcHeight = 0, bank = 0, lean = 0, apex = 0.5, stagger = 0 } = s;
  const [tx, ty] = centre(call.to);
  const w = s.landingWidth ?? call.to[2];
  const h = s.landingWidth !== undefined && f[2] > 0 ? f[3] * w / f[2] : call.to[3];
  const t: Rect = [tx - w / 2, ty - h / 2, w, h];
  const index = run.timeline.calls.filter((c) => c.verb === call.verb && c.t === call.t && c.step['staggerGroup'] === s.staggerGroup).indexOf(call);
  const factor = call.step.dur > 0 ? call.dur / call.step.dur : 0;
  const delay = Math.min(Math.max(0, call.dur - 1), Math.max(0, Math.min(index, s.staggerMax ?? Infinity) * stagger * (s.staggerUnscaled ? 1 : factor)));
  const duration = Math.max(1, Math.min(call.dur - delay, s.flightMs === undefined ? Infinity : s.flightMs * factor));
  const clipPath = el.style.clipPath;
  const finish = (): void => {
    place(el, t);
    if (s.clipPath !== undefined) el.style.clipPath = clipPath;
  };
  if (s.clipPath !== undefined) el.style.clipPath = s.clipPath;
  if (s.cubic || s.quadratic) {
    const settle = sampledFlight(fx, t, s, delay, duration);
    return () => { settle(); finish(); };
  }
  if (s.glide || s.via) {
    if (s.glide?.anchor === 'destination' || s.via) place(el, t);
    animate(glideFrames(f, t, s), { transform: s.glide?.baseTransform ?? '' }, { duration, delay, ...(s.via && { easing: 'linear' }) });
    return finish;
  }
  const dx = t[0] - f[0], dy = t[1] - f[1];
  animate([
    { translate: '0 0' },
    { translate: `${String(dx / 2 + dy * bank)}px ${String(dy * (0.5 + lean) - arcHeight)}px`, offset: apex },
    { translate: `${String(dx)}px ${String(dy)}px` },
  ], { translate: '' }, { easing: 'ease-out', delay, duration });
  return finish;
};

function sampledFlight({ call, el }: Fx, to: Rect, s: ArcMoveSettings, delay: number, duration: number): () => void {
  const from = centre(call.from), dest = centre(to);
  place(el, to);
  const c = s.cubic;
  const q = s.quadratic;
  const path = c && flightPath({ x: from[0], y: from[1] }, { x: dest[0], y: dest[1] }, to[3], c);
  const opacity = el.style.opacity;
  const filter = el.style.filter;
  const ghosts = Array.from({ length: q?.afterimages?.count ?? 0 }, () => {
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.style.mixBlendMode = 'plus-lighter';
    el.before(ghost);
    return ghost;
  });
  const draw = (node: HTMLElement, p: ReturnType<typeof quadraticPose>, q: QuadraticFlight): void => {
    const squash = p.roll * (1 - q.rollSquash) + Math.sign(p.roll || 1) * q.rollSquash;
    node.style.transform = `${translate(p.x - dest[0], p.y - dest[1])} rotate(${String(p.heading * 180 / Math.PI - q.nose)}deg) rotate(${String(q.rollAxis)}deg) scale(1,${String(squash)}) rotate(${String(-q.rollAxis)}deg) scale(${String(p.scale)})`;
  };
  const stop = frames(call, (_time, elapsed) => {
    const k = seg(elapsed, delay, delay + duration);
    if (c && path) {
      const p = flightPose(path, k, c);
      el.style.transform = `${translate(p.x - dest[0], p.y - dest[1])} perspective(${String(c.perspective)}px) rotate(${p.rot.toFixed(2)}deg) rotateY(${p.lean.toFixed(2)}deg) scale(${p.scale.toFixed(4)})`;
      el.style.opacity = String(p.opacity);
      el.style.filter = '';
    } else if (q) {
      const p = quadraticPose(from, dest, k, q);
      draw(el, p, q);
      el.style.filter = p.roll < 0 ? `brightness(${String(q.reverseBrightness)})` : filter;
      el.style.opacity = String(p.alpha);
      if (q.afterimages) {
        const { spacing, opacity, filter } = q.afterimages;
        ghosts.forEach((ghost, i) => {
          const j = ghosts.length - i;
          const past = k - j * spacing / (call.step.dur * duration / call.dur);
          ghost.style.opacity = String(past > 0 ? opacity * p.alpha / j : 0);
          ghost.style.filter = filter;
          if (past > 0) draw(ghost, quadraticPose(from, dest, past, q), q);
        });
      }
    }
  });
  return () => {
    stop();
    for (const ghost of ghosts) ghost.remove();
    Object.assign(el.style, { transform: '', filter, opacity, ...(call.step['then'] === 'hide' && { visibility: 'hidden' }) });
  };
}

export const multiStopMove: Effect = ({ call, el }) => {
  const s = call.step['path'] as MultiStopSettings | undefined;
  if (!s) return undefined;
  const home = centre(call.from);
  const path = multiStopPath(home, s);
  const opacity = el.style.opacity;
  const ghosts = Array.from({ length: s.ghosts?.count ?? 0 }, () => {
    const node = el.cloneNode(true) as HTMLElement;
    el.before(node);
    return node;
  });
  const draw = (node: HTMLElement, time: number, alpha: number): void => {
    const pos = path.at(time), before = path.at(time - s.headingSample);
    const heading = Math.atan2(pos[1] - before[1], pos[0] - before[0]) * 180 / Math.PI;
    const roll = s.lap > 0 ? clamp(1 - s.roll * Math.sin(time / s.lap * Math.PI * 2) ** 2, 1 - s.roll, 1) : 1;
    node.style.opacity = String(alpha);
    node.style.transform = `${translate(pos[0] - home[0], pos[1] - home[1])} rotate(${String(heading - (s.flip ? 180 - s.nose : s.nose))}deg) scale(${String(roll)},1)${s.flip ? ' scaleX(-1)' : ''}`;
  };
  const stop = frames(call, (time) => {
    const active = time >= s.launch && time < path.finish;
    draw(el, time, active ? 1 : 0);
    if (s.ghosts) {
      const { opacity: alpha, spacing, count } = s.ghosts;
      ghosts.forEach((node, i) => draw(node, time - spacing * (i + 1), active ? alpha * (1 - i / count) : 0));
    }
  });
  return () => {
    stop();
    for (const node of ghosts) node.remove();
    Object.assign(el.style, { opacity, transform: '' });
  };
};

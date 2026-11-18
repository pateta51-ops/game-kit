import type { Rect, VerbRegistry } from '../motion-frame/index.ts';
import type { EffectLayer } from './layer.ts';
import { closeGl, openGl, registerGlEffect, type GlFx } from './gl.ts';
import { clamp, crumpleMesh, lerp, smooth, type CrumpleMeshSettings, type Pose } from './crumple-mesh.ts';

type Artwork = HTMLImageElement | HTMLCanvasElement;
type Triple = readonly [number, number, number];
type Pair = readonly [number, number];

export interface CrumpleSettings extends CrumpleMeshSettings {
  image?: string | Artwork;
  meshSize?: Pair;
  destination?: Rect;
  foldMs?: number;
  foldPower?: number;
  holdMs?: number;
  throwMs?: number;
  squashMs?: number;
  settleMs?: number;
  settleDelay?: number;
  arc?: number;
  tilt?: Triple;
  initialTilt?: boolean;
  turn?: Triple;
  wobble?: number;
  lift?: Pair;
  airScale?: number;
  endScale?: number;
  squash?: Triple;
  sink?: Pair;
  jiggle?: { ms: number; frames: readonly Pair[] };
  fadeOut?: boolean | Pair;
  shadow?: { colour: string; blur: number; offset: Pair; side: number; alpha: Pair; width: number };
}

const deg = Math.PI / 180;

function phases(o: CrumpleSettings) {
  const fold = o.foldMs ?? 600;
  const start = fold + (o.holdMs ?? 110);
  const land = start + (o.throwMs ?? 420);
  return { fold, start, land };
}

function keyframes(u: number, frames: readonly Pair[]): number {
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    if (a && b && u <= b[0]) return lerp(a[1], b[1], clamp((u - a[0]) / (b[0] - a[0])));
  }
  return frames.at(-1)?.[1] ?? 0;
}

function squashAt(t: number, land: number, o: CrumpleSettings): number {
  return Math.sin(Math.PI * phase(t, land, land + (o.squashMs ?? 150)));
}

function phase(t: number, start: number, end: number): number {
  return end > start ? clamp((t - start) / (end - start)) : Number(t >= end);
}

export function crumplePose(t: number, from: Rect, to: Rect | undefined, o: CrumpleSettings): Pose {
  const { fold, start, land } = phases(o);
  const [x, y, w, h] = from;
  const u = to ? phase(t, start, land) : 0;
  const p = 1 - (1 - phase(t, 0, fold)) ** (o.foldPower ?? 1.6);
  const [liftAmount, liftMs] = o.lift ?? [0.05, 140];
  const lift = 1 + liftAmount * smooth(0, liftMs || 1, t);
  const tilt = o.initialTilt ? 1 : p;
  const [pitch, yaw, roll] = o.tilt ?? [10, -14, -12];
  const [turnX, turnY, turnZ] = o.turn ?? [18, 25, -300];
  const height = Math.sin(Math.PI * u);
  let cx = x + w / 2;
  let cy = y + h / 2;
  let rz = roll * tilt + turnZ * u;
  if (t > fold && t < start) rz += Math.sin(((t - fold) / (start - fold)) * Math.PI) * (o.wobble ?? 3);
  let scale = lift;
  let sx = 1;
  let sy = 1;
  if (to) {
    const ratio = o.endScale ?? to[2] / w;
    cx = lerp(cx, to[0] + to[2] / 2, u);
    cy = lerp(cy, to[1] + to[3] / 2, u) - (o.arc ?? 0.63) * h * 4 * u * (1 - u);
    scale *= (1 + (o.airScale ?? 0.1) * height) * lerp(1, ratio, u);
    if (t >= land) {
      const q = phase(t, land, land + (o.squashMs ?? 150));
      const b = squashAt(t, land, o);
      const [wide, short, drop] = o.squash ?? [0.12, 0.2, 0.05];
      sx += wide * b;
      sy -= short * b;
      scale = lerp(lift, 1, q) * ratio;
      cy += drop * h * ratio * (o.footprint ?? 0.56) * b;
      const settle = land + (o.settleDelay ?? 80);
      const f = phase(t, settle, settle + (o.settleMs ?? 220));
      const [sink, lower] = o.sink ?? [0.04, 0.03];
      scale *= 1 - sink * f * f * (3 - 2 * f);
      cy += lower * to[3] * f * f * (3 - 2 * f);
      if (o.jiggle) cy += keyframes(phase(t, land, land + o.jiggle.ms), o.jiggle.frames) * to[2];
    }
  }
  const fade = o.fadeOut === true ? [to ? land : fold, to ? land : fold] as const : o.fadeOut;
  return {
    p, cx, cy, sx: scale * sx, sy: scale * sy,
    rx: (pitch * tilt + turnX * Math.sin(2 * Math.PI * u)) * deg,
    ry: (yaw * tilt + turnY * height) * deg,
    rz: rz * deg,
    alpha: fade ? 1 - phase(t, fade[0], fade[1]) : 1,
  };
}

function texture(doc: Document, image: Artwork, radius: number): HTMLCanvasElement | undefined {
  const canvas = doc.createElement('canvas');
  canvas.width = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  canvas.height = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
  if (!canvas.width || !canvas.height) return undefined;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, canvas.height * radius);
  ctx.clip();
  ctx.drawImage(image, 0, 0);
  return canvas;
}

function flat(ctx: CanvasRenderingContext2D, image: HTMLCanvasElement, pose: Pose, w: number, h: number, o: CrumpleSettings): void {
  if (pose.alpha <= 0) return;
  const shrink = lerp(1, o.footprint ?? 0.56, pose.p);
  ctx.globalAlpha = pose.alpha;
  ctx.translate(pose.cx, pose.cy);
  ctx.scale(pose.sx * shrink * Math.abs(Math.cos(pose.ry)), pose.sy * shrink * Math.abs(Math.cos(pose.rx)));
  ctx.rotate(pose.rz);
  ctx.drawImage(image, -w / 2, -h / 2, w, h);
}

/** Paint the landed pose to a PNG. The caller owns caching and display. */
export function crumpleStill(image: Artwork, width: number, height: number, o: CrumpleMeshSettings & { tilt?: Triple; sink?: Pair } = {}): string | undefined {
  if (width <= 0 || height <= 0) return undefined;
  const doc = image.ownerDocument;
  const art = texture(doc, image, o.radius ?? 0.035);
  if (!art) return undefined;
  const canvas = doc.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const gl = openGl(canvas, true);
  const [rx, ry, rz] = o.tilt ?? [10, -14, -312];
  const [sink, drop] = o.sink ?? [0.04, 0.03];
  const pose = { p: 1, cx: width / 2, cy: height / 2 + drop * height, sx: 1 - sink, sy: 1 - sink, rx: rx * deg, ry: ry * deg, rz: rz * deg, alpha: 1 };
  const release: (() => void)[] = [];
  try {
    if (gl) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      crumpleMesh(gl, art, width, height, o, (fn) => release.push(fn))(pose, width, height);
    } else {
      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;
      ctx.scale(dpr, dpr);
      flat(ctx, art, pose, width, height, o);
    }
    return canvas.toDataURL('image/png');
  } finally {
    for (const fn of release) fn();
    closeGl(gl);
  }
}

interface Frame {
  art: HTMLCanvasElement;
  pose: Pose;
  width: number;
  height: number;
  settings: CrumpleSettings;
}

export function registerCrumple(verbs: VerbRegistry<EffectLayer>): void {
  const states = new WeakMap<GlFx, {
    image?: Artwork;
    art?: HTMLCanvasElement;
    shadow?: HTMLElement;
    draw?: ReturnType<typeof crumpleMesh>;
  }>();
  function frame(t: number, fx: GlFx): Frame | undefined {
    const settings = fx.call.step as CrumpleSettings;
    const doc = fx.layer.el.ownerDocument;
    let state = states.get(fx);
    if (!state) {
      const { image } = settings;
      if (!image) return undefined;
      if (typeof image === 'string') {
        const img = doc.createElement('img');
        img.src = image;
        state = { image: img };
      } else state = { image };
      states.set(fx, state);
    }
    const [width, height] = settings.meshSize ?? [fx.call.from[2], fx.call.from[3]];
    if (width <= 0 || height <= 0) return undefined;
    if (!state.art && state.image) {
      const art = texture(doc, state.image, settings.radius ?? 0.035);
      if (art) state.art = art;
    }
    if (!state.art) return undefined;
    const to = settings.destination ?? fx.call.to;
    const pose = crumplePose(t, fx.call.from, to, settings);
    const s = settings.shadow;
    if (s) {
      if (!state.shadow) {
        const shadow = doc.createElement('div');
        shadow.style.position = 'absolute';
        shadow.style.background = s.colour;
        shadow.style.filter = `blur(${String(height * s.blur)}px)`;
        shadow.style.borderRadius = `${String(height * (settings.radius ?? 0.035))}px`;
        fx.layer.el.insertBefore(shadow, fx.layer.el.querySelector('.fx-gl'));
        state.shadow = shadow;
        fx.onCleanup(() => { shadow.remove(); });
      }
      const { start, land } = phases(settings);
      const air = to ? Math.sin(Math.PI * phase(t, start, land)) : 0;
      const shrink = settings.footprint ?? 0.56;
      const [wide] = settings.squash ?? [0.12];
      const scale = pose.sx / (1 + wide * (to ? squashAt(t, land, settings) : 0));
      const w = width * lerp(1, shrink * s.width, pose.p) * scale;
      const h = height * lerp(1, shrink, pose.p) * scale;
      const offset = (s.offset[0] + s.offset[1] * air) * height;
      Object.assign(state.shadow.style, {
        left: `${String(pose.cx - w / 2 + offset * s.side)}px`,
        top: `${String(pose.cy - h / 2 + offset)}px`,
        width: `${String(w)}px`, height: `${String(h)}px`,
        opacity: String(pose.alpha * smooth(0, settings.lift?.[1] || 140, t) * (s.alpha[0] - s.alpha[1] * air)),
      });
    }
    return { art: state.art, pose, width, height, settings };
  }
  registerGlEffect(verbs, 'crumple', (gl, t, fx) => {
    const f = frame(t, fx);
    const state = states.get(fx);
    if (!f || !state) return;
    state.draw ??= crumpleMesh(gl, f.art, f.width, f.height, f.settings, fx.onCleanup);
    state.draw(f.pose, fx.width, fx.height);
  }, (ctx, t, fx) => {
    const f = frame(t, fx);
    if (f) flat(ctx, f.art, f.pose, f.width, f.height, f.settings);
  });
}

import type { Point } from '../motion-frame/index.ts';
import type { CanvasEffect } from './canvas.ts';
import type { Effect } from './effects.ts';
import { centre, scene } from './beam-dom.ts';
import { capN, lerp, rng, seg } from './particles.ts';

export interface DebrisPiece {
  /** Local pivot relative to the actor centre, in units. */
  at?: Point;
  /** Start and end horizontal/vertical offsets in units. */
  offset?: Point;
  travel?: Point;
  spin?: number;
  scale?: readonly [number, number];
  growOpacity?: boolean;
  shape?: string;
  colour?: string;
  paint?: (ctx: CanvasRenderingContext2D, progress: number) => void;
}

export interface DebrisSettings {
  count?: number;
  seed?: number;
  unit?: number;
  spread?: Point;
  gravity?: number;
  spin?: number;
  size?: Point;
  colour?: string;
  delay?: number;
  backwards?: boolean;
  ms?: number;
  fade?: readonly [number, number] | false;
  groupFade?: boolean;
  easeMotion?: (progress: number) => number;
  pieces?: readonly DebrisPiece[];
  /** K435-7: pieces are elements in the layer (a piece's `shape` is its clip-path; `paint` is canvas only), not canvas pixels */
  dom?: boolean;
  /** K435-7: z-index of the DOM pieces */
  z?: number;
}

const buffers = new WeakMap<CanvasRenderingContext2D, CanvasRenderingContext2D>();

function fadeBuffer(ctx: CanvasRenderingContext2D): CanvasRenderingContext2D | undefined {
  let buffer = buffers.get(ctx);
  if (!buffer) {
    buffer = ctx.canvas.ownerDocument.createElement('canvas').getContext('2d') ?? undefined;
    if (!buffer) return undefined;
    buffers.set(ctx, buffer);
  }
  const { width, height } = ctx.canvas;
  if (buffer.canvas.width !== width) buffer.canvas.width = width;
  if (buffer.canvas.height !== height) buffer.canvas.height = height;
  buffer.clearRect(0, 0, width, height);
  return buffer;
}

export const debris: CanvasEffect = (board, t, { call, x, y }) => {
  const { pieces, count = pieces?.length ?? 12, seed = 1, unit = 1, spread = [60, 24], gravity = 100,
    spin = 140, size = [12, 8], colour = '#b0b0b0', delay = 0, backwards = false, ms = 900, fade = [ms * 0.7, ms],
    easeMotion = (p: number) => p, groupFade = false } = call.step as DebrisSettings;
  const local = t - delay;
  if ((!backwards && local < 0) || (fade && local >= fade[1])) return;
  const p = seg(local, 0, ms);
  const k = easeMotion(p);
  const alpha = fade ? 1 - seg(local, ...fade) : 1;
  const ctx = (groupFade && alpha < 1 ? fadeBuffer(board) : undefined) ?? board;
  const random = rng(seed);
  for (let i = 0; i < capN(count); i++) {
    const piece = pieces?.[i];
    const [px, py] = piece?.at ?? [0, 0];
    const [ox, oy] = piece?.offset ?? [0, 0];
    const [dx, dy] = piece?.travel ?? [(random() * 2 - 1) * spread[0], -random() * spread[1]];
    const turn = piece?.spin ?? (random() * 2 - 1) * spin;
    const scale = piece?.scale ? lerp(...piece.scale, k) : 1;
    ctx.save();
    ctx.globalAlpha *= (ctx === board ? alpha : 1) * (piece?.growOpacity ? p : 1);
    ctx.translate(x + (px + ox * (1 - k) + dx * k) * unit, y + (py + oy * (1 - k) + dy * k + gravity * k * k) * unit);
    ctx.rotate(turn * k * Math.PI / 180);
    ctx.scale(unit * scale, unit * scale);
    ctx.fillStyle = piece?.colour ?? colour;
    if (piece?.paint) piece.paint(ctx, k);
    else if (piece?.shape) ctx.fill(new Path2D(piece.shape));
    else ctx.fillRect(-size[0] / 2, -size[1] / 2, ...size);
    ctx.restore();
  }
  if (ctx !== board) {
    board.save();
    board.globalAlpha *= alpha;
    board.drawImage(ctx.canvas, 0, 0);
    board.restore();
  }
};

/** K435-7: the DOM mode: one element per piece, the same paths as the canvas, sampled in 31 keyframes */
export const debrisDom: Effect = (fx) => {
  const { call } = fx;
  const { pieces, count = pieces?.length ?? 12, seed = 1, unit = 1, spread = [60, 24], gravity = 100,
    spin = 140, size = [12, 8], colour = '#b0b0b0', delay = 0, ms = 900, fade = [ms * 0.7, ms],
    easeMotion = (p: number) => p, z } = call.step as DebrisSettings;
  const [x, y] = centre(call.from);
  const stage = scene(fx);
  const random = rng(seed);
  const end = fade ? fade[1] : ms;
  for (let i = 0; i < capN(count); i++) {
    const piece = pieces?.[i];
    const [px, py] = piece?.at ?? [0, 0];
    const [ox, oy] = piece?.offset ?? [0, 0];
    const [dx, dy] = piece?.travel ?? [(random() * 2 - 1) * spread[0], -random() * spread[1]];
    const turn = piece?.spin ?? (random() * 2 - 1) * spin;
    const node = stage.stand([x - size[0] / 2, y - size[1] / 2, size[0], size[1]], {
      background: piece?.colour ?? colour, transformOrigin: '50% 50%', ...(z === undefined ? {} : { zIndex: String(z) }),
      ...(piece?.shape ? { clipPath: `path('${piece.shape}')`, left: `${String(x)}px`, top: `${String(y)}px`, transformOrigin: '0 0' } : {}),
    });
    stage.play(node, Array.from({ length: 31 }, (_, j): Keyframe => {
      const local = end * j / 30;
      const p = seg(local, 0, ms);
      const k = easeMotion(p);
      const scale = piece?.scale ? lerp(...piece.scale, k) : 1;
      const tx = (px + ox * (1 - k) + dx * k) * unit;
      const ty = (py + oy * (1 - k) + dy * k + gravity * k * k) * unit;
      return {
        transform: `translate(${String(tx)}px, ${String(ty)}px) rotate(${String(turn * k)}deg) scale(${String(unit * scale)})`,
        opacity: (fade ? 1 - seg(local, ...fade) : 1) * (piece?.growOpacity ? p : 1),
      };
    }), end, delay, 'linear', 'none');
  }
  return stage.end;
};

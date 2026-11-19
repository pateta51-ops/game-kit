// Canvas effects: one canvas in the layer, there only while a canvas effect plays; each effect draws a frame from time `t`.
import type { Run, VerbCall, VerbRegistry } from '../motion-frame/index.ts';
import type { EffectLayer } from './layer.ts';
import { canDraw } from './particles.ts';

export interface CanvasFx {
  call: VerbCall;
  run: Run<EffectLayer>;
  layer: EffectLayer;
  /** centre of the actor's rect, in layer pixels */
  x: number;
  y: number;
}
/** Draws one frame. `t` is ms since the call began in the spec's own time (the same picture at any speed). */
export type CanvasEffect = (ctx: CanvasRenderingContext2D, t: number, fx: CanvasFx) => void;

/** Real ms since a call began, as ms of the spec (the player multiplied the call's `dur` by the speed factor). */
export function specTime(elapsed: number, call: VerbCall): number {
  const d = Number(call.step['dur']);
  return d > 0 && call.dur > 0 ? (elapsed * d) / call.dur : elapsed;
}

interface Board {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  live: Set<(now: number) => void>;
  frame: number;
}
const boards = new WeakMap<HTMLElement, Board>();

export interface CanvasHost {
  /** the element the canvas is drawn in and sized to (default: the layer's element); it must be positioned. Effects sharing a host share one canvas. */
  host?: HTMLElement;
  /** z-index of the canvas */
  zIndex?: number | string;
}

function dispose(host: HTMLElement, b: Board): void {
  cancelAnimationFrame(b.frame);
  b.canvas.remove();
  if (boards.get(host) === b) boards.delete(host);
}

function board(host: HTMLElement, zIndex?: number | string): Board | undefined {
  const b = boards.get(host);
  if (b?.canvas.isConnected) return b;
  if (b) cancelAnimationFrame(b.frame);
  const canvas = document.createElement('canvas');
  canvas.className = 'fx-canvas';
  canvas.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
  if (zIndex !== undefined) canvas.style.zIndex = String(zIndex);
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  host.appendChild(canvas);
  const made: Board = { canvas, ctx, live: new Set(), frame: 0 };
  const tick = (now: number): void => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    for (const f of made.live) {
      try {
        f(now);
      } catch (e) {
        made.live.delete(f);
        console.error(e);
      }
    }
    if (made.live.size) made.frame = requestAnimationFrame(tick);
    else dispose(host, made);
  };
  made.frame = requestAnimationFrame(tick);
  boards.set(host, made);
  return made;
}

/** Registers a canvas effect as a verb. It draws no clone; where the page cannot draw (`canDraw`), the verb does nothing. */
export function registerCanvasEffect(verbs: VerbRegistry<EffectLayer>, name: string, draw: CanvasEffect, opts: CanvasHost = {}): void {
  verbs.register(name, (call, run) => {
    const layer = run.context;
    const host = opts.host ?? layer.el;
    const b = canDraw() ? board(host, opts.zIndex) : undefined;
    if (!b) return undefined;
    const t0 = performance.now();
    const fx: CanvasFx = { call, run, layer, x: call.from[0] + call.from[2] / 2, y: call.from[1] + call.from[3] / 2 };
    const f = (now: number): void => {
      draw(b.ctx, specTime(Math.max(0, now - t0), call), fx);
    };
    b.live.add(f);
    return () => {
      b.live.delete(f);
      if (!b.live.size) dispose(host, b);
    };
  });
}

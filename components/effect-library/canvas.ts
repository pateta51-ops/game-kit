// Canvas effects: one canvas in the layer, there only while a canvas effect plays; each effect draws a frame from time `t`.
import type { Run, VerbCall, VerbRegistry } from '../motion-frame';
import type { EffectLayer } from './layer';
import { canDraw } from './particles';

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
const boards = new WeakMap<EffectLayer, Board>();

function board(layer: EffectLayer): Board | undefined {
  const b = boards.get(layer);
  if (b?.canvas.isConnected) return b;
  if (b) cancelAnimationFrame(b.frame);
  const canvas = document.createElement('canvas');
  canvas.className = 'fx-canvas';
  canvas.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  layer.el.appendChild(canvas);
  const made: Board = { canvas, ctx, live: new Set(), frame: 0 };
  const tick = (now: number): void => {
    const w = layer.el.clientWidth;
    const h = layer.el.clientHeight;
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
    made.frame = requestAnimationFrame(tick);
  };
  made.frame = requestAnimationFrame(tick);
  boards.set(layer, made);
  return made;
}

/** Registers a canvas effect as a verb. It draws no clone; where the page cannot draw (`canDraw`), the verb does nothing. */
export function registerCanvasEffect(verbs: VerbRegistry<EffectLayer>, name: string, draw: CanvasEffect): void {
  verbs.register(name, (call, run) => {
    const layer = run.context;
    const b = canDraw() ? board(layer) : undefined;
    if (!b) return undefined;
    const t0 = performance.now();
    const fx: CanvasFx = { call, run, layer, x: call.from[0] + call.from[2] / 2, y: call.from[1] + call.from[3] / 2 };
    const f = (now: number): void => {
      draw(b.ctx, specTime(Math.max(0, now - t0), call), fx);
    };
    b.live.add(f);
    return () => {
      b.live.delete(f);
      if (b.live.size) return;
      cancelAnimationFrame(b.frame);
      b.canvas.remove();
      if (boards.get(layer) === b) boards.delete(layer);
    };
  });
}

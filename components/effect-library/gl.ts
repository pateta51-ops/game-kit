import type { Run, VerbRegistry } from '../motion-frame/index.ts';
import { specTime, type CanvasFx } from './canvas.ts';
import type { EffectLayer } from './layer.ts';

export interface GlFx extends CanvasFx {
  width: number;
  height: number;
  onCleanup(this: void, cleanup: () => void): void;
}

export type GlEffect = (gl: WebGL2RenderingContext, t: number, fx: GlFx) => void;
export type GlFallback = (ctx: CanvasRenderingContext2D, t: number, fx: GlFx) => void;

interface Entry {
  run: Run<EffectLayer>;
  draw(now: number): void;
  end(this: void): void;
}

export function endGlEffects(layer: EffectLayer, run?: Run<EffectLayer>): void {
  for (const entry of boards.get(layer)?.live ?? []) {
    if (!run || entry.run === run) entry.end();
  }
}

export function openGl(canvas: HTMLCanvasElement, preserveDrawingBuffer = false): WebGL2RenderingContext | null {
  try {
    return canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, depth: true, preserveDrawingBuffer });
  } catch {
    return null;
  }
}

export function closeGl(gl: WebGL2RenderingContext | null): void {
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
}

function open(layer: EffectLayer) {
  const make = (): HTMLCanvasElement => {
    const canvas = layer.el.ownerDocument.createElement('canvas');
    canvas.className = 'fx-gl';
    canvas.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
    return canvas;
  };
  let canvas = make();
  let gl = openGl(canvas);
  let ctx: CanvasRenderingContext2D | null = null;
  const openFallback = (): void => {
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    canvas.classList.add('fx-gl-fallback');
  };
  const lost = (): void => {
    gl = null;
    const next = make();
    canvas.replaceWith(next);
    canvas = next;
    openFallback();
  };
  if (gl) canvas.addEventListener('webglcontextlost', lost, { once: true });
  else openFallback();
  if (!gl && !ctx) return undefined;
  layer.el.append(canvas);

  const live = new Set<Entry>();
  let frame = requestAnimationFrame(tick);
  function tick(now: number): void {
    const width = layer.el.clientWidth;
    const height = layer.el.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    canvas.style.width = `${String(width)}px`;
    canvas.style.height = `${String(height)}px`;
    if (gl) {
      gl.viewport(0, 0, w, h);
      gl.disable(gl.SCISSOR_TEST);
      gl.colorMask(true, true, true, true);
      gl.depthMask(true);
      gl.clearColor(0, 0, 0, 0);
      gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    } else {
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx?.clearRect(0, 0, width, height);
    }
    for (const entry of live) {
      try {
        ctx?.save();
        entry.draw(now);
      } catch (error) {
        entry.end();
        console.error(error);
      } finally {
        ctx?.restore();
      }
    }
    if (live.size) frame = requestAnimationFrame(tick);
  }

  return {
    live,
    get gl() { return gl; },
    get ctx() { return ctx; },
    close() {
      cancelAnimationFrame(frame);
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.remove();
      closeGl(gl);
    },
  };
}

type Board = NonNullable<ReturnType<typeof open>>;
const boards = new WeakMap<EffectLayer, Board>();

/** Draws on the layer's shared WebGL2 canvas, or on a 2D canvas when WebGL2 is unavailable. */
export function registerGlEffect(verbs: VerbRegistry<EffectLayer>, name: string, draw: GlEffect, fallback?: GlFallback): void {
  verbs.register(name, (call, run) => {
    const layer = run.context;
    const board = boards.get(layer) ?? open(layer);
    if (!board) return undefined;
    if (!board.gl && !fallback) {
      if (!board.live.size) board.close();
      return undefined;
    }
    boards.set(layer, board);
    const start = performance.now();
    const cleanups = new Set<() => void>();
    const fx: GlFx = {
      call, run, layer, x: call.from[0] + call.from[2] / 2, y: call.from[1] + call.from[3] / 2,
      width: 0, height: 0,
      onCleanup: (cleanup) => { cleanups.add(cleanup); },
    };
    const entry: Entry = {
      run,
      draw(now) {
        const t = specTime(Math.max(0, now - start), call);
        fx.width = layer.el.clientWidth;
        fx.height = layer.el.clientHeight;
        if (board.gl) {
          board.gl.depthMask(true);
          board.gl.clear(board.gl.DEPTH_BUFFER_BIT);
          draw(board.gl, t, fx);
        } else if (board.ctx) fallback?.(board.ctx, t, fx);
      },
      end() {
        if (!board.live.delete(entry)) return;
        try {
          for (const cleanup of cleanups) cleanup();
        } finally {
          if (!board.live.size) {
            boards.delete(layer);
            board.close();
          }
        }
      },
    };
    board.live.add(entry);
    return entry.end;
  });
}

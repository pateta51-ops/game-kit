import { EXTERIOR_HEIGHT, EXTERIOR_WIDTH } from './mode.ts';

/**
 * The game's print on the bag's cloth: it gets the plain cloth canvas (EXTERIOR_WIDTH x EXTERIOR_HEIGHT, the weave
 * already drawn) and paints on it. Canvas x = u * W with the front of the bag at u = 0.5; canvas y = H * (1 - v) with
 * v = bag height / 2.14. A print has `EXTERIOR_ACROSS` texels per bag unit across and `EXTERIOR_UP` up (the bag body is
 * squashed to 0.82 of its height), so a logo of aspect `a` and `w` texels wide is `w / EXTERIOR_ACROSS / a * EXTERIOR_UP`
 * texels tall to look true on the cloth.
 */
export type ExteriorPrint = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => void | Promise<void>;

/** A print function (painted once per function, then cached) or a canvas the game pre-painted (EXTERIOR_WIDTH x EXTERIOR_HEIGHT, used as is). */
export type Exterior = ExteriorPrint | HTMLCanvasElement;

const painted = new WeakMap<ExteriorPrint, Promise<HTMLCanvasElement>>();
let plain: Promise<HTMLCanvasElement> | undefined;


export const EXTERIOR_ACROSS = EXTERIOR_WIDTH / (2 * Math.PI * 1.38);
export const EXTERIOR_UP = EXTERIOR_HEIGHT / (2.14 * 0.82);

/** The cloth's colour; a game paints its own patch over it. */
export const CLOTH = '#334b59';

export function exteriorCanvas(exterior?: Exterior): Promise<HTMLCanvasElement> {
  if (exterior instanceof HTMLCanvasElement) return Promise.resolve(exterior);
  if (exterior === undefined) return (plain ??= paint().catch((e: unknown) => { plain = undefined; throw e; }));
  let p = painted.get(exterior);
  if (p === undefined) {
    p = paint(exterior).catch((e: unknown) => { painted.delete(exterior); throw e; });
    painted.set(exterior, p);
  }
  return p;
}

async function paint(print?: ExteriorPrint): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = EXTERIOR_WIDTH;
  canvas.height = EXTERIOR_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('no 2d context');
  const W = EXTERIOR_WIDTH;
  const H = EXTERIOR_HEIGHT;
  ctx.fillStyle = CLOTH;
  ctx.fillRect(0, 0, W, H);
  // Deterministic woven colour variation (a 4 x 4 tile, drawn once); no per-frame work or extra texture lookup.
  const tile = document.createElement('canvas');
  tile.width = tile.height = 4;
  const t = tile.getContext('2d');
  if (t !== null) {
    for (let y = 0; y < 4; y += 2) {
      for (let x = 0; x < 4; x += 2) {
        t.fillStyle = (x + y) % 4 === 0 ? '#ffffff08' : '#00000012';
        t.fillRect(x, y, 1, 2);
      }
    }
    const weave = ctx.createPattern(tile, 'repeat');
    if (weave !== null) {
      ctx.fillStyle = weave;
      ctx.fillRect(0, 0, W, H);
    }
  }
  if (print !== undefined) await print(canvas, ctx);
  return canvas;
}

/** Small repeatable height weave for the cloth's grazing highlights. */
export function weaveCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('no 2d context');
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const value = 128 + Math.round(26 * Math.sin((x * Math.PI) / 2) * Math.cos((y * Math.PI) / 2));
      ctx.fillStyle = `rgb(${String(value)} ${String(value)} ${String(value)})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

// Bug reports (ported from Rise of a Jarl): the screenshot markup (pen, box, arrow, numbered pin), drawn on the live
// preview and flattened into the filed PNG.
import { z } from 'zod';
import { bugConfig } from '../config';

const PointSchema = z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
/** Coordinates and widths are fractions of the original image, independent of editor size. */
export const MarkupSchema = z.strictObject({
  tool: z.enum(['pen', 'box', 'arrow', 'pin']),
  color: z.enum(['#ff5577', '#ffe34d', '#45e5ff', '#a6ff63']),
  width: z.number().positive().max(0.05),
  points: z.array(PointSchema).min(1).max(20000),
  note: z.string().max(80),
});
export type Markup = z.infer<typeof MarkupSchema>;
export type Point = z.infer<typeof PointSchema>;
export const COLORS = MarkupSchema.shape.color.options;

/** Shared by the live preview and the filed PNG. Pin numbers follow their order in the report. */
export function drawMarkup(
  ctx: CanvasRenderingContext2D,
  items: readonly Markup[],
  w: number,
  h: number,
): void {
  let pin = 0;
  for (const item of items) {
    const first = item.points[0];
    const last = item.points.at(-1);
    if (!first || !last) continue;
    const x = first.x * w,
      y = first.y * h,
      endX = last.x * w,
      endY = last.y * h;
    const width = item.width * w;
    ctx.save();
    ctx.strokeStyle = item.color;
    ctx.fillStyle = item.color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (item.tool === 'box') ctx.rect(x, y, endX - x, endY - y);
    else if (item.tool === 'pin') {
      pin += 1;
      const radius = Math.max(width * 3, w * 0.012, 12);
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `bold ${radius * 1.3}px '${bugConfig().markupFont ?? 'sans-serif'}'`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#050810';
      ctx.fillText(String(pin), x, y);
      if (item.note) {
        ctx.font = `${radius * 1.2}px '${bugConfig().markupFont ?? 'sans-serif'}'`;
        ctx.textAlign = 'left';
        const labelWidth = ctx.measureText(item.note).width;
        const labelX = Math.max(0, Math.min(x + radius * 1.4, w - labelWidth - radius));
        const labelY = Math.max(radius, Math.min(y + radius * 2.5, h - radius));
        ctx.fillRect(labelX - radius * 0.3, labelY - radius, labelWidth + radius * 0.6, radius * 2);
        ctx.fillStyle = item.color;
        ctx.fillText(item.note, labelX, labelY);
      }
    } else {
      ctx.moveTo(x, y);
      if (item.tool === 'pen') {
        for (const p of item.points) ctx.lineTo(p.x * w, p.y * h);
        if (item.points.length === 1) ctx.lineTo(x + 0.01, y);
      } else {
        ctx.lineTo(endX, endY);
        const angle = Math.atan2(endY - y, endX - x);
        const head = Math.max(width * 5, w * 0.018);
        ctx.moveTo(endX - head * Math.cos(angle - 0.5), endY - head * Math.sin(angle - 0.5));
        ctx.lineTo(endX, endY);
        ctx.lineTo(endX - head * Math.cos(angle + 0.5), endY - head * Math.sin(angle + 0.5));
      }
    }
    ctx.stroke();
    ctx.restore();
  }
}

/** Preserve the original bytes when nothing is marked; never resample the captured screenshot. */
export async function flattenMarkup(original: string, items: readonly Markup[]): Promise<string> {
  if (!items.length) return original;
  const image = new Image();
  image.src = `data:image/png;base64,${original}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not draw the marked screenshot.');
  ctx.drawImage(image, 0, 0);
  drawMarkup(ctx, items, canvas.width, canvas.height);
  return canvas.toDataURL('image/png').slice('data:image/png;base64,'.length);
}

/** Map a displayed image rectangle to image-independent coordinates. */
export function displayPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): Point {
  return {
    x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
  };
}

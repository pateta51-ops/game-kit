// Where the tutorial panel goes: next to what the step highlights, never on top of it. Pure geometry in any one
// coordinate space (the window's, or a game's fixed table): the targets' rectangles and the free area in, the panel's
// top-left out.

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export const union = (rs: readonly Rect[]): Rect | null => {
  if (rs.length === 0) return null;
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  const r = Math.max(...rs.map((q) => q.x + q.w));
  const b = Math.max(...rs.map((q) => q.y + q.h));
  return { x, y, w: r - x, h: b - y };
};

export const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));

/**
 * Above the targets, else below, right or left of them: the first side where the whole panel fits the area without
 * touching any target, slid along that side to stay in the area. With no target, or no side free, the corner of the
 * area clear of the targets, else the middle of the area.
 */
export function placePanel(targets: readonly Rect[], size: { readonly w: number; readonly h: number }, area: Rect, gap = 40): { x: number; y: number } {
  const { w, h } = size;
  const t = union(targets);
  const fitX = (x: number) => clamp(x, area.x, area.x + area.w - w);
  const fitY = (y: number) => clamp(y, area.y, area.y + area.h - h);
  const rest = { x: fitX(area.x + (area.w - w) / 2), y: fitY(area.y + (area.h - h) / 2) };
  if (t === null) return rest;
  const cx = t.x + t.w / 2 - w / 2;
  const cy = t.y + t.h / 2 - h / 2;
  const sides = [
    { x: fitX(cx), y: t.y - gap - h },
    { x: fitX(cx), y: t.y + t.h + gap },
    { x: t.x + t.w + gap, y: fitY(cy) },
    { x: t.x - gap - w, y: fitY(cy) },
  ];
  const inside = (p: { x: number; y: number }) => p.x >= area.x && p.y >= area.y && p.x + w <= area.x + area.w && p.y + h <= area.y + area.h;
  const clear = (p: { x: number; y: number }) => targets.every((r) => !overlaps({ x: p.x, y: p.y, w, h }, r));
  const best = sides.find((p) => inside(p) && clear(p));
  if (best !== undefined) return best;
  const corners = [
    { x: area.x, y: area.y },
    { x: area.x + area.w - w, y: area.y },
    { x: area.x, y: area.y + area.h - h },
    { x: area.x + area.w - w, y: area.y + area.h - h },
  ].map((p) => ({ x: fitX(p.x), y: fitY(p.y) }));
  return corners.find(clear) ?? rest;
}

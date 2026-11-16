// Panel reader, pure part: one picture read as ordered beats (K154). Draws nothing; loads in node.
import type { Line, Picture } from './story.ts';
export type Rect = { x: number; y: number; w: number; h: number };
export type Size = { w: number; h: number };
export type PanelBeat = { rect: Rect; caption?: string; lines?: Line[]; sfx?: string; wideOnly?: boolean; narrowOnly?: boolean };
export type PanelSheet = { id: string; picture: Picture & Size; beats: PanelBeat[]; credit?: string };
export type Aspect = 'wide' | 'narrow';
export type Camera = { region: Rect; scale: number; tx: number; ty: number };

// The part of the picture shown for a panel: the rectangle plus a margin, grown to the area's aspect, kept inside the picture.
export function framing(rect: Rect, area: Size, page: Size, margin = 0.04): Rect {
  let w = rect.w * (1 + 2 * margin), h = rect.h * (1 + 2 * margin);
  const a = area.w / area.h;
  if (w / h < a) w = h * a; else h = w / a;
  const k = Math.min(1, page.w / w, page.h / h);
  w *= k; h *= k;
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  return { x: Math.min(Math.max(cx - w / 2, 0), page.w - w), y: Math.min(Math.max(cy - h / 2, 0), page.h - h), w, h };
}

// One panel rectangle gives a wide beat and a phone beat.
export const dualFraming = (rect: Rect, areas: Record<Aspect, Size>, page: Size, margin?: number): Record<Aspect, Rect> =>
  ({ wide: framing(rect, areas.wide, page, margin), narrow: framing(rect, areas.narrow, page, margin) });

export const beatsFor = (beats: readonly PanelBeat[], aspect: Aspect) =>
  beats.filter((b) => !(aspect === 'wide' ? b.narrowOnly : b.wideOnly));

// Camera for a beat: the picture is scaled by `scale` and moved by tx, ty (top-left origin) to show `region` in the area.
export function camera(beat: PanelBeat, area: Size, page: Size, margin?: number): Camera {
  const region = framing(beat.rect, area, page, margin), scale = area.w / region.w;
  return { region, scale, tx: -region.x * scale, ty: -region.y * scale };
}

// Beat to beat: 0 ms (a plain cut) under reduced motion.
export const moveMs = (reduced: boolean, ms = 700) => (reduced ? 0 : ms);

export type Reader = { i: number; done: boolean };
export type ReaderAction = 'next' | 'back' | 'skip';
export const readerStart = (): Reader => ({ i: 0, done: false });
export function readerStep(r: Reader, count: number, a: ReaderAction): Reader {
  if (r.done) return r;
  if (a === 'skip') return { i: r.i, done: true };
  if (a === 'back') return { i: Math.max(0, r.i - 1), done: false };
  return r.i + 1 >= count ? { i: r.i, done: true } : { i: r.i + 1, done: false };
}
export function keyAction(key: string): ReaderAction | null {
  if (key === 'ArrowRight' || key === ' ' || key === 'Enter' || key === 'ArrowDown') return 'next';
  if (key === 'ArrowLeft' || key === 'Backspace' || key === 'ArrowUp') return 'back';
  return key === 'Escape' ? 'skip' : null;
}

// A short story earned by an achievement opens in the same reader from an Extras screen.
export type EarnedStory = { achievement: string; sheet: PanelSheet };
export const earnedStories = (all: readonly EarnedStory[], unlocked: readonly string[]) =>
  all.map((s) => ({ ...s, open: unlocked.includes(s.achievement) }));

export function panelProblems(s: PanelSheet): string[] {
  const out: string[] = [];
  if (s.beats.length === 0) out.push(`${s.id}: no beats`);
  s.beats.forEach((b, i) => {
    const r = b.rect;
    if (!(r.w > 0 && r.h > 0) || r.x < 0 || r.y < 0 || r.x + r.w > s.picture.w || r.y + r.h > s.picture.h) out.push(`${s.id}: beat ${i} rectangle outside the picture`);
    if (b.wideOnly && b.narrowOnly) out.push(`${s.id}: beat ${i} is wideOnly and narrowOnly`);
  });
  return out;
}

export const prefersReduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

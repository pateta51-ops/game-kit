// Pure and DOM parts of a counter: level, bump, "+N" tag. The game owns look and layout.
import type { StoreApi } from 'zustand/vanilla';
import type { Speed } from '../motion-frame/index.ts';
import type { ToastState } from '../ui-helpers/index.ts';

export type Level = 'ok' | 'low' | 'out';
/** `low`: at or under this count the level is low; `out` (default 0): at or under it, out. */
export interface Thresholds {
  low: number;
  out?: number;
}

export const levelOf = (value: number, th?: Thresholds): Level => (!th ? 'ok' : value <= (th.out ?? 0) ? 'out' : value <= th.low ? 'low' : 'ok');
const RANK: Record<Level, number> = { ok: 0, low: 1, out: 2 };
/** The worse level the count has just crossed into, or null (same level, or better). */
export const crossed = (prev: number, next: number, th?: Thresholds): Level | null => {
  const a = levelOf(prev, th);
  const b = levelOf(next, th);
  return RANK[b] > RANK[a] ? b : null;
};
/** "+3" / "−3"; '' for no change. */
export const tagText = (delta: number): string => (delta === 0 ? '' : `${delta < 0 ? '−' : '+'}${String(Math.abs(delta))}`);

/** Bump on arrival: 1.35x, 0.92x, 1x. */
export const BUMP_FRAMES: Keyframe[] = [{ transform: 'scale(1.35)' }, { transform: 'scale(0.92)', offset: 0.5 }, { transform: 'scale(1)' }];
export const BUMP_MS = 300;
/** The tag is readable this long at speed 1. */
export const TAG_MS = 1700;

/** `ms` at the player's speed; 0 at 'instant' or speed 0. */
export const scaledMs = (ms: number, speed: Speed): number => (typeof speed === 'number' && speed > 0 ? ms * speed : 0);

/** The tag at progress k (0..1): opacity and its drift in font heights (down on a narrow screen, up on a wide one). */
export const tagAt = (k: number): { opacity: number; y: number } => {
  const t = Math.min(1, Math.max(0, k));
  if (t < 0.08) return { opacity: t / 0.08, y: 0.25 * (t / 0.08) };
  if (t < 0.8) return { opacity: 1, y: 0.25 + 0.15 * ((t - 0.08) / 0.72) };
  return { opacity: 1 - (t - 0.8) / 0.2, y: 0.4 + 0.4 * ((t - 0.8) / 0.2) };
};

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
};

/** Right edge of the counter's row (the counter and its siblings on the same line): free space starts there. Null on a narrow screen (`narrow`, default 700 px). */
export function rowRightOf(el: HTMLElement, narrow = 700): number | null {
  if (window.innerWidth <= narrow) return null;
  const me = boxOf(el);
  let right = me.x + me.w;
  for (const sib of el.parentElement?.children ?? []) {
    const b = boxOf(sib);
    if (b.w > 0 && b.y < me.y + me.h && b.y + b.h > me.y) right = Math.max(right, b.x + b.w);
  }
  return right;
}

/** The counter with `data-res="<anchor>"` that is on screen (a game may draw several), or null. */
export function counterOf(anchor: string, root: ParentNode = document): HTMLElement | null {
  for (const el of root.querySelectorAll<HTMLElement>(`[data-res="${anchor}"]`)) {
    const b = boxOf(el);
    if (b.w > 0 && b.h > 0 && b.x + b.w > 0 && b.y + b.h > 0 && b.x < window.innerWidth && b.y < window.innerHeight) return el;
  }
  return null;
}

/** Bumps the counter; nothing at 'instant' or speed 0. Flights call it on arrival. */
export function bumpCounter(el: HTMLElement, speed: Speed): void {
  const ms = scaledMs(BUMP_MS, speed);
  if (ms > 0 && typeof el.animate === 'function') el.animate(BUMP_FRAMES, { duration: ms, easing: 'ease-out' });
}

/**
 * One "+N" tag beside the counter: in the free space at the row's right on a wide screen, just under it on a narrow one.
 * `row` (0, 1...) spaces several tags of one row. Removed when done; nothing at 'instant'. Returns a function that removes it now.
 */
export function showTag(el: HTMLElement, delta: number, speed: Speed, row = 0): () => void {
  const ms = scaledMs(TAG_MS, speed);
  const text = tagText(delta);
  if (ms <= 0 || !text) return () => undefined;
  const box = boxOf(el);
  const px = parseFloat(getComputedStyle(el).fontSize) || 16;
  const right = rowRightOf(el);
  const tag = document.createElement('span');
  tag.dataset['part'] = 'tag';
  tag.dataset['sign'] = delta < 0 ? '-' : '+';
  tag.textContent = text;
  Object.assign(tag.style, { position: 'fixed', left: '0', top: `${String(right === null ? box.y + box.h + px * (0.35 + 1.35 * row) : box.y + box.h / 2 - px * 0.65)}px`, pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: '90' });
  document.body.append(tag);
  const want = right === null ? box.x : right + px * 0.6 + row * (tag.offsetWidth + px * 0.5);
  tag.style.left = `${String(Math.min(window.innerWidth - tag.offsetWidth - px * 0.3, Math.max(px * 0.3, want)))}px`;
  const dir = right === null ? 1 : -1;
  const at = (k: number): Keyframe => {
    const f = tagAt(k);
    return { opacity: f.opacity, transform: `translateY(${String(dir * px * f.y)}px)`, offset: k };
  };
  const gone = (): void => tag.remove();
  if (typeof tag.animate === 'function') void tag.animate([at(0), at(0.08), at(0.8), at(1)], { duration: ms, easing: 'ease-out', fill: 'forwards' }).finished.then(gone, gone);
  else setTimeout(gone, ms);
  return gone;
}

/** Toast when a counter crosses into low or out: `onCross={crossToast(toasts, { low: { text, tone }, out: { text, tone } })}`. */
export const crossToast =
  <Tone extends string>(toasts: StoreApi<ToastState<Tone>>, say: Partial<Record<Exclude<Level, 'ok'>, { text: string; tone: Tone }>>) =>
  (level: Level): void => {
    const t = level === 'ok' ? undefined : say[level];
    if (t) toasts.getState().push(t);
  };

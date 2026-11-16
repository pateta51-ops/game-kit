// The layout mode for a window, the fit zoom of the large screens, the safe-area tokens. Pure, apart from the two
// setters that write to an element.
import type { LayoutMode } from './machine.ts';

export type LayoutSetting = 'auto' | 'phone' | 'desk';

/** A phone: a coarse pointer and a short side of at most this many CSS px. */
export const PHONE_SHORT_SIDE = 500;
export const DESK_W = 3840;
export const DESK_H = 2160;

export interface ViewportInput {
  readonly w: number;
  readonly h: number;
  readonly coarse: boolean;
  readonly setting: LayoutSetting;
  /** Whether auto picks the phone screens (off until a game's phone screens ship). Default true. */
  readonly autoPhone?: boolean;
  readonly shortSide?: number;
  readonly deskW?: number;
  readonly deskH?: number;
}

/** The layout mode for a window. It follows the window, never the user agent, so a narrow desktop window is not a phone. */
export function layoutModeFor(i: ViewportInput): LayoutMode {
  const { w, h, coarse, setting } = i;
  const phone =
    setting === 'phone' ||
    (setting === 'auto' && (i.autoPhone ?? true) && coarse && Math.min(w, h) <= (i.shortSide ?? PHONE_SHORT_SIDE));
  // sideways needs a touch screen: a forced phone layout on a mouse-driven window stays upright, so a game's
  // turn-upright panel never locks a desktop out of its settings
  if (phone) return w > h && coarse ? 'phoneLandscape' : 'phonePortrait';
  return w >= (i.deskW ?? DESK_W) && h >= (i.deskH ?? DESK_H) ? 'desk' : 'fitted';
}

/** What <html data-layout> says for a mode. */
export const layoutAttr = (m: LayoutMode): 'desk' | 'fitted' | 'phone' =>
  m === 'phonePortrait' || m === 'phoneLandscape' ? 'phone' : m;

export const isPhone = (m: LayoutMode): boolean => m === 'phonePortrait' || m === 'phoneLandscape';

/** The zoom that fits a design of dw x dh inside a w x h window, never above 1. */
export function fitZoom(w: number, h: number, dw = DESK_W, dh = DESK_H): number {
  if (w <= 0 || h <= 0) return 1;
  return Math.min(1, w / dw, h / dh);
}

/** Zooms `el` to fit `size`, or clears the zoom (null). The phone screens never use CSS zoom. */
export function applyFit(el: HTMLElement, size: { w: number; h: number } | null, dw = DESK_W, dh = DESK_H): void {
  const z = size === null ? 1 : fitZoom(size.w, size.h, dw, dh);
  el.style.zoom = z === 1 ? '' : String(z);
}

/**
 * Sets the safe-area tokens --sat/--sar/--sab/--sal (CSS px) on `el` (default <html>). phone-mode.css reads them from
 * env(safe-area-inset-*) by default; an end-to-end test sets them here, since a browser test cannot emulate a notch.
 */
export function setSafeArea(top: number, right: number, bottom: number, left: number, el = document.documentElement): void {
  const s = el.style;
  s.setProperty('--sat', `${String(top)}px`);
  s.setProperty('--sar', `${String(right)}px`);
  s.setProperty('--sab', `${String(bottom)}px`);
  s.setProperty('--sal', `${String(left)}px`);
}

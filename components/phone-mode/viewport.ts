// The viewport store (machine kit.viewport): follows the window, the pointer and the game's Layout setting; writes
// data-layout (desk | fitted | phone), data-orient (portrait | landscape) and data-display (browser | standalone) on
// <html>, and zooms the app container only in the fitted mode, or on a phone when the location has no phone screen yet.
import { create } from 'zustand';
import { expectEdge } from '../state-machines/machine.ts';
import { applyFit, layoutAttr, layoutModeFor, type LayoutSetting } from './layout.ts';
import { VIEWPORT_MACHINE, type LayoutMode } from './machine.ts';

export interface ViewportOptions {
  /** The game's Layout setting now. Default auto. */
  readonly setting?: () => LayoutSetting;
  /** Calls back when the setting changes; returns the unsubscribe. */
  readonly onSetting?: (changed: () => void) => () => void;
  /** Whether the location (window.location.hash) has a phone screen. Default every location. */
  readonly phoneScreen?: (hash: string) => boolean;
  readonly autoPhone?: boolean;
  readonly shortSide?: number;
  /** false: never zoom the container (the game scales itself, e.g. with app-frame `<Stage>`); default true. */
  readonly fit?: boolean;
  readonly deskW?: number;
  readonly deskH?: number;
}

/** Whether the container is zoomed: the fitted mode, or a phone upright on a location with no phone screen. */
export function needsFit(mode: LayoutMode, hash: string, phoneScreen: (hash: string) => boolean = () => true): boolean {
  if (mode === 'fitted') return true;
  return mode === 'phonePortrait' && !phoneScreen(hash);
}

/** iOS sets navigator.standalone when the page runs as a Home Screen app. */
export const isIosHomeScreenApp = (): boolean => (navigator as Navigator & { standalone?: boolean }).standalone === true;

const coarsePointer = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

interface ViewportState {
  readonly mode: LayoutMode;
  readonly w: number;
  readonly h: number;
  update(): void;
  /** Starts following the window for `root` (the app container); returns the stop function. */
  start(root: HTMLElement, options?: ViewportOptions): () => void;
}

let container: HTMLElement | null = null;
let opts: ViewportOptions = {};

export const useViewport = create<ViewportState>((set, get) => ({
  mode: VIEWPORT_MACHINE.initial,
  w: 0,
  h: 0,
  update() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const { setting, onSetting: _, phoneScreen, fit: _f, ...rest } = opts;
    const mode = layoutModeFor({ w, h, coarse: coarsePointer(), setting: setting?.() ?? 'auto', ...rest });
    const from = get().mode;
    expectEdge(VIEWPORT_MACHINE, from, mode, 'window or Layout setting changed');
    const el = document.documentElement;
    el.dataset['layout'] = layoutAttr(mode);
    el.dataset['orient'] = w > h ? 'landscape' : 'portrait';
    el.dataset['display'] = isIosHomeScreenApp() ? 'standalone' : 'browser';
    if (container !== null)
      applyFit(container, opts.fit !== false && needsFit(mode, window.location.hash, phoneScreen) ? { w, h } : null, opts.deskW, opts.deskH);
    if (mode !== from || w !== get().w || h !== get().h) set({ mode, w, h });
  },
  start(root, options = {}) {
    container = root;
    opts = options;
    const update = () => {
      get().update();
    };
    update();
    const events = ['resize', 'hashchange', 'orientationchange'] as const;
    for (const e of events) window.addEventListener(e, update);
    window.visualViewport?.addEventListener('resize', update);
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)') : null;
    mq?.addEventListener('change', update);
    const unsub = options.onSetting?.(update);
    return () => {
      for (const e of events) window.removeEventListener(e, update);
      window.visualViewport?.removeEventListener('resize', update);
      mq?.removeEventListener('change', update);
      unsub?.();
      container = null;
      opts = {};
    };
  },
}));

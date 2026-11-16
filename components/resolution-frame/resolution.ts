// A Resolution setting on a PC: the game is laid out as on a screen of the chosen size, then the whole picture is scaled
// to fill the browser window. It runs in a same-origin <iframe> of that size, so every CSS media query sees the chosen
// width and height. Phone-sized screens keep their own layout.
import { readSettings, resolutionSize, type SettingsSchema } from '../settings/schema';

/** The scale and offset that fit a w×h picture into the window, centred (letterboxed). */
export function fitBox(size: { w: number; h: number }, win: { w: number; h: number }): { scale: number; left: number; top: number } {
  if (!(size.w > 0 && size.h > 0 && win.w > 0 && win.h > 0)) return { scale: 1, left: 0, top: 0 };
  const scale = Math.min(win.w / size.w, win.h / size.h);
  return { scale, left: (win.w - size.w * scale) / 2, top: (win.h - size.h * scale) / 2 };
}

export const PHONE_QUERY = '(max-width: 600px), (pointer: coarse) and (max-height: 600px)';

export interface FrameHost {
  /** The top page (not inside a frame). */
  readonly top: boolean;
  /** An automated test browser: its specs pick sizes with the viewport. */
  readonly webdriver: boolean;
  readonly phone: boolean;
}

export function frameHost(phoneQuery: string = PHONE_QUERY, win: Window = window): FrameHost {
  let top: boolean;
  try {
    top = win.self === win.top;
  } catch {
    top = false;
  }
  return { top, webdriver: win.navigator.webdriver === true, phone: 'matchMedia' in win && win.matchMedia(phoneQuery).matches };
}

/** The top page on a PC hosts the game in the sized frame; inside the frame, under webdriver and on phones the game runs directly. */
export function shouldFrame(resolution: string, host: FrameHost = frameHost()): boolean {
  return host.top && !host.webdriver && !host.phone && resolutionSize(resolution) !== null;
}

/** The stored value of the schema's Resolution choice `key` (as the settings store persists it, whatever its `version`), or its default. */
export function storedResolution(schema: SettingsSchema, key: string): string {
  let values: unknown = null;
  try {
    const raw = JSON.parse(window.localStorage.getItem(schema.storageKey) ?? 'null') as { state?: { values?: unknown } } | null;
    values = raw?.state?.values ?? null;
  } catch {
    /* blocked or broken storage: the default */
  }
  const v = (readSettings(schema, values) as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : 'window';
}

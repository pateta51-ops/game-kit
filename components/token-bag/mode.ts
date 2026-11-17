// Port of Warp's Edge bagMode.ts (decision 017): the parts of the 3D bag that do not need three.js, so the main bundle can
// decide between 2D and 3D without loading it. The 3D bag falls back to 2D, for the rest of the session, when WebGL is
// unavailable, when the scene fails (it throws, or the WebGL context is lost) or when the frame rate stays below 30 fps
// for 2 s. The face textures are sized to keep the scene's GPU textures inside the 32 MB budget.

export type FallbackReason = 'no-webgl' | 'error' | 'slow';

/** Whether the browser can give a WebGL context (`make` creates the canvas; a test passes its own). */
export function webglAvailable(
  make: () => HTMLCanvasElement = () => document.createElement('canvas'),
): boolean {
  try {
    const c = make();
    return c.getContext('webgl2') !== null || c.getContext('webgl') !== null;
  } catch {
    return false;
  }
}

/** below this frame rate for `SLOW_SECONDS`, the 3D bag gives way to 2D. */
export const MIN_FPS = 30;
export const SLOW_SECONDS = 2;

/**
 * The frame-rate watch: fed each frame's time (ms), it reports `slow` once the frame rate over the last `SLOW_SECONDS`
 * is below `MIN_FPS`, measured only after the watch has run that long (so a first slow frame alone never trips it). The
 * rate is the frame intervals in the window over the window's real elapsed time: the window keeps the newest frame at
 * or before `now - span`, so it always spans at least `span` and a steady 30 fps reads as 30, not one frame short.
 */
export function fpsWatch(minFps = MIN_FPS, seconds = SLOW_SECONDS): { frame: (now: number) => boolean } {
  const span = seconds * 1000;
  const times: number[] = [];
  return {
    frame(now: number): boolean {
      times.push(now);
      while (times.length > 1 && (times[1] ?? now) <= now - span) times.shift();
      const oldest = times[0] ?? now;
      const elapsed = now - oldest;
      if (elapsed < span) return false;
      const fps = ((times.length - 1) * 1000) / elapsed;
      // a relative tolerance for the float sums of frame times (a steady 30 fps must not read as 29.999…)
      return fps < minFps * (1 - 1e-9);
    },
  };
}

/** the iPhone's texture budget for the 3D bag. */
export const TEXTURE_BUDGET = 32 * 1024 * 1024;

// the print is twice as wide as tall in texels so the logo stays sharp on the 4K draw
export const EXTERIOR_WIDTH = 2048;
export const EXTERIOR_HEIGHT = 512;

const rgbaMip = (px: number): number => Math.round(px * px * 4 * (4 / 3));
/** The scene's textures other than the faces: the blank back (256 px), the table cloth (512 px), the shadow map, the exterior print and 64 px weave. */
export const FIXED_TEXTURE_BYTES =
  rgbaMip(256) +
  rgbaMip(512) +
  1024 * 1024 * 4 +
  Math.ceil(EXTERIOR_WIDTH * EXTERIOR_HEIGHT * 4 * (4 / 3)) +
  rgbaMip(64);

/** The GPU bytes of `faces` face textures of `size` px (RGBA with mipmaps) plus the fixed textures. */
export const textureBytes = (faces: number, size: number): number =>
  FIXED_TEXTURE_BYTES + faces * rgbaMip(size);

/**
 * The face size: 512 px when the faces fit the budget, else the largest of 256 and 128 px that does. A bag can
 * hold more kinds of token than the mock's fifteen; past about eighteen kinds the faces step down rather than overflow.
 */
export function faceSize(faces: number, budget = TEXTURE_BUDGET): number {
  for (const size of [512, 256, 128]) if (textureBytes(faces, size) <= budget) return size;
  return 64;
}

/** The dock's 3D bag canvas on screen (the table's or the phone's dock, Rest), if one is shown. */
export function dockCanvas(): HTMLCanvasElement | null {
  for (const c of document.querySelectorAll<HTMLCanvasElement>('canvas[data-part="token-bag-canvas"]')) {
    const r = c.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return c;
  }
  return null;
}

// The session's fallback: set once, read by the game's bag and the Settings screen.
let fallback: FallbackReason | null = null;
const listeners = new Set<() => void>();

export const getFallback = (): FallbackReason | null => fallback;

export function setFallback(reason: FallbackReason | null): void {
  if (fallback === reason) return;
  fallback = reason;
  for (const l of listeners) l();
}

export function subscribeFallback(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

let webgl: boolean | null = null;
/** Whether WebGL works here, checked once per session. */
export function hasWebgl(): boolean {
  webgl ??= webglAvailable();
  return webgl;
}

/** Tests: forget the WebGL check, so the next one runs again. */
export function forgetWebglCheck(): void {
  webgl = null;
}

/** What the bag shows: the 3D bag when chosen and the session has not fallen back (or WebGL is missing), else 2D. */
export const bagMode = (chosen: '2d' | '3d', fb: FallbackReason | null): '2d' | '3d' => (chosen === '3d' && fb === null ? '3d' : '2d');

/** The scene's input for a draw: the view's unordered contents after the draw plus the drawn tokens in draw order = the bag before it. */
export const drawContents = (left: readonly string[], drawn: readonly string[]): string[] => [...left, ...drawn];

/** The scene's rate for a speed factor (1 normal, 2 slow as in token-flights); 0 when there is no scene (speed 0 or reduced motion). */
export const rateFor = (speed: number, reduced = false): number => (reduced || !(speed > 0) ? 0 : 1 / speed);

export const FALLBACK_TEXT: Record<FallbackReason, string> = {
  'no-webgl': 'WebGL is not available on this device, so the bag shows in 2D.',
  error: 'The 3D bag failed to start, so the bag shows in 2D for the rest of this session.',
  slow: 'The 3D bag ran below 30 frames a second, so the bag shows in 2D for the rest of this session.',
};

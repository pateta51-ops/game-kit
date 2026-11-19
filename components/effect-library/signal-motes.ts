import type { Effect } from './effects.ts';

export interface MotesSettings {
  count?: number;
  colour?: string | readonly string[];
  glowColour?: string;
  minSize?: number;
  sizeJitter?: readonly [number, number];
  lifeJitter?: readonly [number, number];
  riseFactor?: readonly [number, number];
  peakOffset?: number;
  startTransform?: string;
  endScale?: number;
  ease?: string;
  dissolveEase?: string;
  size?: number;
  rise?: number;
  box?: readonly [number, number, number, number];
  z?: number;
  spread?: number;
  lag?: number;
  ms?: number;
  radius?: string;
  glow?: number;
  dissolve?: readonly Keyframe[];
  /** K435-3: easing per keyframe: [start to peak, peak to end] */
  easings?: readonly [string, string];
  /** K435-3: the start transform is held to this offset of each mote's life (default none) */
  holdStart?: number;
  /** K435-3: another seed gives other motes (default 0) */
  seed?: number;
  /** K435-3: travel direction in degrees (0 right, 90 down; default up, -90) */
  direction?: number;
  /** K435-3: px added downward to each mote's travel (drops that fall) */
  gravity?: number;
}

const noise = (i: number, k: number): number => {
  const j = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return j - Math.floor(j);
};

export const motes: Effect = ({ el, call, animate }) => {
  const { box, z } = call.step as MotesSettings;
  const [left, top, w, h] = box ?? call.from;
  const {
    count = 16, colour = '#fff', size = 6, rise = h, spread = w, lag = 0.35,
    radius = '50%', glow = 1.5, glowColour, ms, dissolve, minSize = 0,
    sizeJitter = [0.6, 0.8], lifeJitter = [0.6, 0.4], riseFactor = [0.4, 0.6],
    peakOffset = 0.15, startTransform = 'translate(0,0) scale(1)', endScale = 0.3,
    ease = 'ease-out', dissolveEase = 'ease-in', easings, holdStart, seed = 0, direction = -90, gravity = 0,
  } = call.step as MotesSettings;
  const rand = (i: number, k: number): number => noise(i + seed * 1000, k);
  const turn = (direction + 90) * Math.PI / 180;
  const duration = ms === undefined ? call.dur / (1 + lag) : call.dur * ms / Number(call.step['dur']);
  const parts = Array.from({ length: count }, (_, i) => {
    const s = Math.max(minSize, size * (sizeJitter[0] + rand(i, 7) * sizeJitter[1]));
    const tint = typeof colour === 'string' ? colour : colour[Math.floor(rand(i, 14) * colour.length)] ?? '#fff';
    const d = el.ownerDocument.createElement('div');
    Object.assign(d.style, {
      position: 'absolute', left: `${String(left + rand(i, 8) * w - s / 2)}px`, top: `${String(top + rand(i, 9) * h - s / 2)}px`,
      zIndex: z === undefined ? '' : String(z),
      width: `${String(s)}px`, height: `${String(s)}px`, borderRadius: radius, background: tint,
      boxShadow: `0 0 ${String(s * glow)}px ${glowColour ?? tint}`,
    });
    // Siblings keep the source's dissolve filter and opacity off the particles.
    el.after(d);
    const ux = (rand(i, 10) - 0.5) * spread;
    const uy = -rise * (riseFactor[0] + rand(i, 11) * riseFactor[1]);
    const dx = turn === 0 ? ux : ux * Math.cos(turn) - uy * Math.sin(turn);
    const dy = (turn === 0 ? uy : ux * Math.sin(turn) + uy * Math.cos(turn)) + gravity;
    const e = (k: number): { easing?: string } => (easings ? { easing: easings[k] ?? 'linear' } : {});
    const animation = d.animate([
      { opacity: 0, transform: startTransform, ...e(0) },
      ...(holdStart === undefined ? [] : holdStart < peakOffset ? [{ transform: startTransform, offset: holdStart, ...e(0) }] : []),
      holdStart !== undefined && holdStart >= peakOffset ? { opacity: 1, transform: startTransform, offset: peakOffset, ...e(1) } : { opacity: 1, offset: peakOffset, ...e(1) },
      ...(holdStart !== undefined && holdStart > peakOffset ? [{ transform: startTransform, offset: holdStart, ...e(1) }] : []),
      { opacity: 0, transform: `translate(${String(dx)}px, ${String(dy)}px) scale(${String(endScale)})` },
    ], { duration: duration * (lifeJitter[0] + rand(i, 12) * lifeJitter[1]), easing: ease, delay: rand(i, 13) * duration * lag, fill: 'both' });
    return () => {
      animation.cancel();
      d.remove();
    };
  });
  if (dissolve) animate([...dissolve], { opacity: '0' }, { duration, easing: dissolveEase });
  return () => {
    parts.forEach((finish) => { finish(); });
  };
};

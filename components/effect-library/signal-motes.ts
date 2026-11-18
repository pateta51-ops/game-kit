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
}

const rand = (i: number, k: number): number => {
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
    ease = 'ease-out', dissolveEase = 'ease-in',
  } = call.step as MotesSettings;
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
    const dx = (rand(i, 10) - 0.5) * spread;
    const dy = -rise * (riseFactor[0] + rand(i, 11) * riseFactor[1]);
    const animation = d.animate([
      { opacity: 0, transform: startTransform },
      { opacity: 1, offset: peakOffset },
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

import { clamp } from './particles.ts';

const TAU = Math.PI * 2;
type Stops = readonly (readonly [number, string])[];

export const orbGeometry = {
  haloRadius: 2, coreX: 0, coreY: 0,
  ringWidth: 1, ringStroke: 0.05, ringRadius: 0.5, ringDash: 0.25,
  referenceRadius: 30, filamentSamples: 64, filamentTwist: 0.2, filamentSpacing: 1,
  filamentRadius: 0.75, filamentWave: 0.1, filamentLobes: 2, filamentAspect: 0.75,
  filamentRotation: 0.5, brightEvery: 2, brightWidth: 1, filamentWidth: 0.5,
  filamentBlur: 4, angleStep: 2, angleWave: 0.1, arcPoints: 6,
  arcStart: 0.4, arcStride: 0.1, jagPoint: 6, jagArc: 8,
  jagSize: 0.1, arcOpacity: 0.4, arcPulse: 0.2, arcBlur: 6,
  forkPoint: 3, forkAngle: 0.5, forkLength: 0.25, moteRadius: 1.1,
  moteBands: 3, moteStride: 0.1, moteSize: 0.5, moteSizes: 2,
  moteSizeStride: 0.2,
};

interface OrbPalette {
  ring: string;
  halo: Stops;
  core: Stops;
  bright: string;
  filament: string;
  shadow: string;
  arc: string;
  mote: string;
}

const neutralPalette: OrbPalette = {
  ring: '#888', halo: [[0, '#aaa8'], [0.5, '#8883'], [1, '#8880']],
  core: [[0, '#fff'], [0.2, '#eee'], [0.6, '#aaa8'], [1, '#8880']],
  bright: '#eeeb', filament: '#aaa6', shadow: '#ddd', arc: '230,230,230', mote: '#ddd8',
};

export interface PlasmaOrbSettings {
  speed?: number | 'instant';
  arcCount?: number;
  pulsePeriod?: number;
  pulseAmount?: number;
  swell?: number;
  filaments?: number;
  motes?: number;
  palette?: OrbPalette;
  geometry?: typeof orbGeometry;
}

export const plasmaOrbScale = (t: number, boost = 0, { speed = 1, pulsePeriod = 2400, pulseAmount = 0.05, swell = 0.1 }: PlasmaOrbSettings = {}): number =>
  speed === 0 || speed === 'instant' ? 1 : 1 + pulseAmount * Math.sin((t / pulsePeriod) * TAU) + boost * swell;

export const plasmaSwellAt = (since: number, peak = 80, half = 180): number =>
  since < 0 ? 0 : clamp(1 - Math.abs(since - peak) / half);

function disc(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string | CanvasGradient,
): void {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fillStyle = fill;
  c.fill();
}

function glow(c: CanvasRenderingContext2D, x: number, y: number, r: number, stops: Stops): void {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  for (const [p, col] of stops) g.addColorStop(p, col);
  disc(c, x, y, r, g);
}

/**
 * Draw the orb centred at (x, y), ball radius r (px), at `t` ms (Normal) of its clock. `empty`: the exhausted ring.
 * `boost`: the launch swell (0..1).
 */
export function drawPlasmaOrb(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  t: number,
  empty: boolean,
  boost = 0,
  settings: PlasmaOrbSettings = {},
): void {
  const { palette = neutralPalette, arcCount = 5, filaments = 4, motes = 10, geometry = orbGeometry } = settings;
  c.save();
  c.translate(x, y);
  if (empty) {
    c.strokeStyle = palette.ring;
    c.lineWidth = Math.max(geometry.ringWidth, r * geometry.ringStroke);
    c.beginPath();
    c.arc(0, 0, r * geometry.ringRadius, 0, TAU);
    c.stroke();
    c.beginPath();
    c.moveTo(-r * geometry.ringDash, 0);
    c.lineTo(r * geometry.ringDash, 0);
    c.stroke();
    c.restore();
    return;
  }
  const phase = settings.speed === 0 || settings.speed === 'instant' ? 0 : (t / (settings.pulsePeriod ?? 2400)) * TAU;
  const size = plasmaOrbScale(t, boost, settings);
  c.scale(size, size);
  const lw = r / geometry.referenceRadius;
  c.globalCompositeOperation = 'lighter';
  glow(c, 0, 0, r * geometry.haloRadius, palette.halo);
  glow(c, r * geometry.coreX, r * geometry.coreY, r, palette.core);
  c.lineCap = 'round';
  for (let j = 0; j < filaments; j++) {
    c.beginPath();
    for (let k = 0; k <= geometry.filamentSamples; k++) {
      const a = (k / geometry.filamentSamples) * TAU;
      const twist = Math.sin(phase) * geometry.filamentTwist + j * geometry.filamentSpacing;
      const rr = r * (geometry.filamentRadius + geometry.filamentWave * Math.sin(a * geometry.filamentLobes + j + phase));
      const xx = Math.cos(a + twist) * rr;
      const yy = Math.sin(a + twist) * rr * geometry.filamentAspect;
      const rot = j * geometry.filamentRotation;
      const px = xx * Math.cos(rot) - yy * Math.sin(rot);
      const py = xx * Math.sin(rot) + yy * Math.cos(rot);
      if (k === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.strokeStyle = j % geometry.brightEvery === 0 ? palette.bright : palette.filament;
    c.lineWidth = (j % geometry.brightEvery === 0 ? geometry.brightWidth : geometry.filamentWidth) * lw;
    c.shadowColor = palette.shadow;
    c.shadowBlur = geometry.filamentBlur * lw;
    c.stroke();
  }
  for (let j = 0; j < arcCount; j++) {
    const a = j * geometry.angleStep + Math.sin(phase + j) * geometry.angleWave;
    const pts: [number, number][] = [];
    for (let k = 0; k < geometry.arcPoints; k++) {
      const d = r * (geometry.arcStart + k * geometry.arcStride);
      const jag = Math.sin(k * geometry.jagPoint + j * geometry.jagArc + phase) * r * geometry.jagSize;
      pts.push([Math.cos(a) * d - Math.sin(a) * jag, Math.sin(a) * d + Math.cos(a) * jag]);
    }
    c.beginPath();
    pts.forEach(([px, py], i) => (i === 0 ? c.moveTo(px, py) : c.lineTo(px, py)));
    c.strokeStyle = `rgba(${palette.arc},${String(geometry.arcOpacity + geometry.arcPulse * Math.sin(phase + j))})`;
    c.lineWidth = lw;
    c.shadowBlur = geometry.arcBlur * lw;
    c.stroke();
    const fork = pts[geometry.forkPoint];
    if (fork !== undefined) {
      c.beginPath();
      c.moveTo(fork[0], fork[1]);
      c.lineTo(fork[0] + Math.cos(a + geometry.forkAngle) * r * geometry.forkLength, fork[1] + Math.sin(a + geometry.forkAngle) * r * geometry.forkLength);
      c.stroke();
    }
  }
  c.shadowBlur = 0;
  for (let j = 0; j < motes; j++) {
    const a = j * geometry.angleStep + Math.sin(phase) * geometry.angleWave;
    const d = r * (geometry.moteRadius + (j % geometry.moteBands) * geometry.moteStride);
    disc(c, Math.cos(a) * d, Math.sin(a) * d, (geometry.moteSize + (j % geometry.moteSizes) * geometry.moteSizeStride) * lw, palette.mote);
  }
  c.restore();
}

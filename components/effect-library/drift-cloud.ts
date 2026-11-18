import { triangles } from './break-effects.ts';
import { clamp, seg } from './particles.ts';

const TAU = Math.PI * 2;
const driftLife = 5000;
type Triangle = readonly (readonly [number, number])[];
const defaultShards = triangles(2, 2, 1, [0, 0]);
const defaultSurvivors = [0, 1, 2, 3];

export interface DriftCloudSettings {
  pieceCount?: number;
  cohortCount?: number;
  cohortPhase?: number;
  shards?: readonly Triangle[];
  survivors?: readonly number[];
  variation?: number;
  angleStep?: number;
  life?: number;
  emerge?: number;
  fade?: readonly [number, number];
  stagger?: number;
  firstGroup?: number;
  secondPhase?: number;
  speed?: readonly [number, number];
  speedBands?: number;
  spin?: readonly [number, number];
  firstSize?: number;
  size?: number;
  sizeBands?: number;
  sizeStep?: number;
  startRadius?: number;
  aspect?: number;
  initialSpin?: number;
  shrink?: number;
  opacity?: number;
  cohortDim?: number;
  cutoff?: number;
  edgeFade?: number;
  emberEvery?: number;
  emberColour?: string;
  emberOpacity?: number;
  emberSize?: number;
  minEmberSize?: number;
  ring?: readonly [number, number, number];
  ringColour?: string;
  dashColour?: string;
  lineWidth?: number;
  minLineWidth?: number;
}

export interface DriftCohort {
  id: string;
  born: number;
  retired?: number;
}

export function syncDriftCloud(
  prev: readonly DriftCohort[],
  ids: readonly string[],
  held: ReadonlySet<string>,
  now: number,
  scale: number | 'instant',
  still: boolean,
  settings: DriftCloudSettings = {},
): DriftCohort[] {
  if (scale === 0 || scale === 'instant') return [];
  const there = new Set(ids);
  const life = (settings.life ?? driftLife) * Math.max(scale, 0.001);
  const out = prev.filter((c) => there.has(c.id));
  const known = new Set(out.map((c) => c.id));
  let k = 0;
  for (const id of ids) {
    if (known.has(id) || held.has(id)) continue;
    out.push({ id, born: still ? now - life - ((k * (settings.cohortPhase ?? 0.25) * life) % life) : now });
    k += 1;
  }
  const order = new Map(ids.map((id, i) => [id, i]));
  const live = out
    .filter((c) => c.retired === undefined)
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const retire = new Set(live.slice(0, Math.max(0, live.length - (settings.cohortCount ?? 3))));
  return out.map((c) => retire.has(c) ? { ...c, retired: still ? c.born : now } : c);
}

export interface DriftPiece {
  triangle: number;
  angle: number;
  speed: number;
  spin: number;
  size: number;
  offset: number;
  ember: boolean;
}

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

export function driftPieces(id: string, settings: DriftCloudSettings = {}, survivors: readonly number[] = settings.survivors ?? defaultSurvivors): DriftPiece[] {
  const h = hash(id);
  const [v0, dv] = settings.speed ?? [2, 0.6];
  const { firstGroup = 3, stagger = 100, secondPhase = 0.5, emberEvery = 3 } = settings;
  return Array.from({ length: settings.pieceCount ?? 5 }, (_, k) => {
    const j = (h + k * 7) % (settings.variation ?? 20);
    return {
      triangle: survivors[(h + k) % survivors.length] ?? 0,
      angle: ((h % 360) / 360) * TAU + k * (settings.angleStep ?? 2),
      speed: v0 + (j % (settings.speedBands ?? 5)) * dv,
      spin: (settings.spin ?? [8, -11])[k % 2]!,
      size: k === 0 ? (settings.firstSize ?? 22) : (settings.size ?? 11) + (j % (settings.sizeBands ?? 3)) * (settings.sizeStep ?? 3),
      offset: k < firstGroup ? k * stagger : (settings.life ?? driftLife) * secondPhase + (k - firstGroup) * stagger,
      ember: k % emberEvery === 0,
    };
  });
}

export interface DriftPose {
  x: number;
  y: number;
  rot: number;
  size: number;
  alpha: number;
}

export function driftPoseAt(p: DriftPiece, age: number, retiredAge?: number, settings: DriftCloudSettings = {}): DriftPose | null {
  const since = age - p.offset;
  if (since < 0) return null;
  const life = settings.life ?? driftLife;
  const a = since % life;
  if (retiredAge !== undefined && age - a >= retiredAge) return null;
  const s = a / 1000;
  const r = (settings.startRadius ?? 6) + s * p.speed;
  const alpha = seg(a, 0, (settings.emerge ?? 500)) * (1 - seg(a, ...(settings.fade ?? [life * 0.5, life] as const))) * (settings.opacity ?? 0.8);
  return {
    x: Math.cos(p.angle) * r,
    y: Math.sin(p.angle) * r * (settings.aspect ?? 0.8),
    rot: p.angle * (settings.initialSpin ?? 0.4) + (s * p.spin * Math.PI) / 180,
    size: p.size * (1 - s * (settings.shrink ?? 0.05)),
    alpha,
  };
}

export interface DriftArt {
  img: CanvasImageSource;
  w: number;
  h: number;
}

export function drawDriftCloud(
  c: CanvasRenderingContext2D,
  o: {
    w: number;
    h: number;
    u: number;
    now: number;
    scale: number | 'instant';
    cohorts: readonly DriftCohort[];
    art: (id: string) => DriftArt | null;
    empty: boolean;
    settings?: DriftCloudSettings;
  },
): number {
  const settings = o.settings ?? {};
  const { ring = [10, 4, 1.2], ringColour = '#777', dashColour = '#888', lineWidth = 0.5, minLineWidth = 1 } = settings;
  const cx = o.w / 2;
  const cy = o.h / 2;
  if (o.empty) {
    c.save();
    c.strokeStyle = ringColour;
    c.lineWidth = Math.max(minLineWidth, o.u * lineWidth);
    c.beginPath();
    c.ellipse(cx, cy, ring[0] * o.u, ring[1] * o.u, 0, 0, TAU);
    c.stroke();
    c.strokeStyle = dashColour;
    c.beginPath();
    c.moveTo(cx - ring[2] * o.u, cy);
    c.lineTo(cx + ring[2] * o.u, cy);
    c.stroke();
    c.restore();
    return 0;
  }
  if (o.scale === 0 || o.scale === 'instant') return 0;
  const scale = Math.max(o.scale, 0.001);
  let drawn = 0;
  const n = o.cohorts.length;
  const { shards = defaultShards, survivors = defaultSurvivors, cohortDim = 0.1, cutoff = 0.004, edgeFade = 0.7,
    emberColour = '#ddd', emberOpacity = 0.6, emberSize = 0.5, minEmberSize = 1 } = settings;
  o.cohorts.forEach((co, rank) => {
    const pic = o.art(co.id);
    if (pic === null) return;
    const age = (o.now - co.born) / scale;
    const retiredAge = co.retired === undefined ? undefined : (co.retired - co.born) / scale;
    const dim = 1 - cohortDim * (n - 1 - rank);
    for (const p of driftPieces(co.id, settings, survivors)) {
      const at = driftPoseAt(p, age, retiredAge, settings);
      if (at === null || at.alpha <= cutoff) continue;
      const x = cx + at.x * o.u;
      const y = cy + at.y * o.u;
      const size = at.size * o.u;
      const edge = Math.max(Math.abs(x - cx) / (cx - size / 2 || 1), Math.abs(y - cy) / (cy - size / 2 || 1));
      const alpha = at.alpha * dim * (1 - seg(edge, edgeFade, 1));
      if (alpha <= cutoff) continue;
      drawDriftPiece(c, pic, shards, p.triangle, x, y, size, at.rot, alpha);
      if (p.ember) {
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = clamp(alpha * emberOpacity);
        c.fillStyle = emberColour;
        c.fillRect(x, y, Math.max(minEmberSize, o.u * emberSize), Math.max(minEmberSize, o.u * emberSize));
        c.restore();
      }
      drawn += 1;
    }
  });
  return drawn;
}

function drawDriftPiece(
  c: CanvasRenderingContext2D,
  pic: DriftArt,
  shards: readonly Triangle[],
  triangle: number,
  x: number,
  y: number,
  size: number,
  rot: number,
  alpha: number,
): void {
  const t = shards[triangle];
  if (t === undefined) return;
  const xs = t.map(([px]) => (px / 100) * pic.w);
  const ys = t.map(([, py]) => (py / 100) * pic.h);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const bw = Math.max(...xs) - x0;
  const bh = Math.max(...ys) - y0;
  const k = size / Math.max(bw, bh, 1);
  const mx = (xs.reduce((a, b) => a + b, 0) / 3 - x0) * k;
  const my = (ys.reduce((a, b) => a + b, 0) / 3 - y0) * k;
  c.save();
  c.globalAlpha = clamp(alpha);
  c.translate(x, y);
  c.rotate(rot);
  c.translate(-mx, -my);
  c.beginPath();
  t.forEach(([px, py], i) => {
    const X = ((px / 100) * pic.w - x0) * k;
    const Y = ((py / 100) * pic.h - y0) * k;
    if (i === 0) c.moveTo(X, Y);
    else c.lineTo(X, Y);
  });
  c.closePath();
  c.clip();
  c.drawImage(pic.img, x0, y0, bw, bh, 0, 0, bw * k, bh * k);
  c.restore();
}

// Cubic arrival and quadratic passes ported from the pinned flight and evasion sources.
import type { Point, Rect } from '../motion-frame/index.ts';
import { clamp, ease, lerp, seg } from './particles.ts';

export interface Pt {
  x: number;
  y: number;
}

/** The four control points of the curve. */
export interface FlightPath {
  p0: Pt;
  p1: Pt;
  p2: Pt;
  p3: Pt;
}

/** Where the ship is at a moment of its flight, and how it is turned. */
export interface FlightPose {
  x: number;
  y: number;
  /** its size, a part of its size in the slot */
  scale: number;
  /** its turn in the screen's plane (degrees, clockwise): its nose along the travel, 0 = facing the player */
  rot: number;
  /** its roll into the turn (degrees, a rotateY), 0 = level */
  lean: number;
  opacity: number;
}

export interface CubicFlight {
  controls: readonly [number, number, number, number];
  minLift: number;
  startScale: number;
  bank: number;
  lean: number;
  levelFrom: number;
  curvature: number;
  leanIn: number;
  fadeIn: number;
  perspective: number;
}

/**
 * The curve from the portal to the slot. `lift` is the ship's height in its slot: the curve dips under the portal by
 * about half of it, then rises over the slot and drops into it.
 */
export function flightPath(from: Pt, to: Pt, lift: number, settings: CubicFlight): FlightPath {
  const dx = to.x - from.x;
  const h = Math.max(settings.minLift, lift);
  return {
    p0: from,
    p1: { x: from.x + dx * settings.controls[0], y: from.y + h * settings.controls[1] },
    p2: { x: to.x - dx * settings.controls[2], y: to.y - h * settings.controls[3] },
    p3: to,
  };
}

const bez = (a: number, b: number, c: number, d: number, t: number): number => {
  const m = 1 - t;
  return m * m * m * a + 3 * m * m * t * b + 3 * m * t * t * c + t * t * t * d;
};
const bez1 = (a: number, b: number, c: number, d: number, t: number): number => {
  const m = 1 - t;
  return 3 * m * m * (b - a) + 6 * m * t * (c - b) + 3 * t * t * (d - c);
};
const bez2 = (a: number, b: number, c: number, d: number, t: number): number =>
  6 * (1 - t) * (c - 2 * b + a) + 6 * t * (d - 2 * c + b);

/** The point of the curve at its parameter `e` (0..1). */
export const pointAt = (p: FlightPath, e: number): Pt => ({
  x: bez(p.p0.x, p.p1.x, p.p2.x, p.p3.x, e),
  y: bez(p.p0.y, p.p1.y, p.p2.y, p.p3.y, e),
});

/** The direction of travel at `e` (a vector, not normalised). */
export const tangentAt = (p: FlightPath, e: number): Pt => ({
  x: bez1(p.p0.x, p.p1.x, p.p2.x, p.p3.x, e),
  y: bez1(p.p0.y, p.p1.y, p.p2.y, p.p3.y, e),
});

/** The speed profile: the ship speeds up out of the portal, then brakes into its slot. */
export const travel = (k: number): number => ease.inOut(clamp(k));

/**
 * The turn that points a ship whose nose is down on screen (decision 026: it faces the player) along the direction
 * (dx, dy), in degrees clockwise, in -180..180.
 */
export function noseAlong(dx: number, dy: number): number {
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI - 90;
  return deg > 180 ? deg - 360 : deg <= -180 ? deg + 360 : deg;
}

/** The pose at `k`, the part of the flight's time gone (0..1). */
export function flightPose(p: FlightPath, k: number, settings: CubicFlight): FlightPose {
  const u = clamp(k);
  const e = travel(u);
  const at = pointAt(p, e);
  const v = tangentAt(p, e);
  const a = {
    x: bez2(p.p0.x, p.p1.x, p.p2.x, p.p3.x, e),
    y: bez2(p.p0.y, p.p1.y, p.p2.y, p.p3.y, e),
  };
  const speed = Math.hypot(v.x, v.y);
  const level = 1 - ease.inOut(seg(u, settings.levelFrom, 1));
  const rot = speed < 1e-6 ? 0 : clamp(noseAlong(v.x, v.y), -settings.bank, settings.bank);
  // signed curvature times the curve's span: + turns clockwise on screen (y down), so the ship rolls into that side
  const span = Math.hypot(p.p3.x - p.p0.x, p.p3.y - p.p0.y) || 1;
  const curv = speed < 1e-6 ? 0 : ((v.x * a.y - v.y * a.x) / speed ** 3) * span;
  const lean = clamp(curv * settings.curvature, -settings.lean, settings.lean) * seg(u, 0, settings.leanIn);
  return {
    x: at.x,
    y: at.y,
    scale: lerp(settings.startScale, 1, ease.out(u)),
    rot: rot * level,
    lean: lean * level,
    opacity: seg(u, 0, settings.fadeIn),
  };
}

export interface QuadraticFlight {
  control: Point;
  blend: number;
  lookAhead: number;
  nose: number;
  rollAxis: number;
  rollSquash: number;
  reverseBrightness: number;
  roll?: readonly [number, number];
  side?: number;
  juke?: number;
  fadeSlope?: number;
  exitScale?: number;
  exitFade?: number;
  afterimages?: { count: number; spacing: number; opacity: number; filter: string };
}

export function quadraticPose(from: Point, to: Point, k: number, path: QuadraticFlight) {
  const u = lerp(k, path.exitScale === undefined ? ease.inOut(k) : ease.in(k), path.blend);
  const at = (t: number): Point => {
    const m = 1 - t;
    return [
      m * m * from[0] + 2 * m * t * path.control[0] + t * t * to[0],
      m * m * from[1] + 2 * m * t * path.control[1] + t * t * to[1],
    ];
  };
  const [x, y] = at(u);
  const [x2, y2] = at(Math.min(1, u + path.lookAhead));
  const heading = Math.atan2(y2 - y, x2 - x);
  const rk = path.roll ? seg(k, ...path.roll) : 0;
  const side = path.side ?? 1;
  const juke = Math.sin(Math.PI * rk) * (path.juke ?? 0) * side;
  const roll = Math.cos(ease.inOut(rk) * Math.PI * 2 * side);
  return {
    x: x + Math.cos(heading + Math.PI / 2) * juke,
    y: y + Math.sin(heading + Math.PI / 2) * juke,
    heading, roll,
    scale: lerp(1, path.exitScale ?? 1, ease.in(k)),
    alpha: path.exitFade === undefined ? Math.min(1, k * (path.fadeSlope ?? 1), (1 - k) * (path.fadeSlope ?? 1)) : 1 - seg(k, path.exitFade, 1),
  };
}

export interface PathStop {
  box: Rect;
  dwell?: number;
  laps?: number;
}

export interface MultiStopSettings {
  stops: readonly PathStop[];
  launch: number;
  travel: number;
  lap: number;
  hop: number;
  back: number;
  padding: Point;
  nose: number;
  flip?: boolean;
  headingSample: number;
  roll: number;
  ghosts?: { count: number; spacing: number; opacity: number };
}

export const centre = (box: Rect): Point => [box[0] + box[2] / 2, box[1] + box[3] / 2];

const mix = (a: Point, b: Point, k: number): Point => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

export function multiStopPath(home: Point, settings: MultiStopSettings) {
  const { stops, launch, travel, lap, hop, back, padding } = settings;
  const lapEnd = launch + travel + stops.reduce((n, stop) => n + (stop.laps ?? 0) * lap + (stop.dwell ?? 0), 0)
    + Math.max(0, stops.length - 1) * hop;
  const orbit = (stop: PathStop, phase: number): Point => {
    const c = centre(stop.box);
    if (!stop.laps) return c;
    const a = phase * Math.PI * 2 + Math.PI / 2;
    return [
      c[0] + Math.cos(a) * (stop.box[2] / 2 + padding[0]),
      c[1] + Math.sin(a) * (stop.box[3] / 2 + padding[1]),
    ];
  };
  const finish = lapEnd + back;
  return {
    finish,
    at(time: number): Point {
      const first = stops[0];
      if (time <= launch || !first) return home;
      let start = launch + travel;
      if (time < start) return mix(home, orbit(first, 0), ease.inOut(seg(time, launch, start)));
      for (const [i, stop] of stops.entries()) {
        const lapsEnd = start + (stop.laps ?? 0) * lap;
        const end = lapsEnd + (stop.dwell ?? 0);
        if (time < lapsEnd) return orbit(stop, (time - start) / lap);
        if (time <= end) return orbit(stop, 1);
        const next = stops[i + 1];
        if (next && time < end + hop) return mix(orbit(stop, 1), orbit(next, 0), ease.inOut(seg(time, end, end + hop)));
        start = end + hop;
      }
      return mix(orbit(stops[stops.length - 1]!, 1), home, ease.out(seg(time, lapEnd, Math.max(lapEnd + 1, finish))));
    },
  };
}

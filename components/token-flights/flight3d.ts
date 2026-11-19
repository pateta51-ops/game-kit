// K447: port of Warp's Edge src/ui/tokens3d look.ts (the coin poses) and timing.ts (TOKEN_MS): a token that flies as a
// three.js object. Pure maths in screen px; applyPose / flyObject3d drive any Object3D the caller gives, in its own scene.

export type Flight3dMode = 'draw' | 'flick' | 'discard';
export interface ScreenSpot { x: number; y: number; radius: number }
export interface Flight3d { mode: Flight3dMode; from: ScreenSpot; to: ScreenSpot }
export interface Flight3dPreset {
  ms: {
    draw: { stagger: number; dur: number; settle: number };
    flick: { dur: number; settle: number; nudge: number };
    discard: { stagger: number; dur: number };
  };
  /** the arc's peak height in px for a token of radius 36 */
  lift: Record<Flight3dMode, number>;
}
/** Screen pose: centre, radius, lift above the table (px), tilt rx and spin rz (rad), and the flick's trail. */
export interface Pose3d extends ScreenSpot {
  lift: number;
  rx: number;
  rz: number;
  trail?: { x: number; y: number; width: number; alpha: number };
}

/** Warp's Edge approved tokens-3d mock: timings (TOKEN_MS) and arc heights. Opt in; the 2D arc stays the default. */
export const WARP_FLIGHTS_3D: Flight3dPreset = {
  ms: {
    draw: { stagger: 260, dur: 760, settle: 300 },
    flick: { dur: 520, settle: 80, nudge: 430 },
    discard: { stagger: 70, dur: 560 },
  },
  lift: { draw: 260, flick: 60, discard: 160 },
};

const clamp = (x: number): number => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const out = (k: number): number => 1 - (1 - k) ** 3;
const inOut = (k: number): number => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);
const outExpo = (k: number): number => (k >= 1 ? 1 : 1 - 2 ** (-10 * k));

/** The whole flight in ms, settle included (the draw's bounce, the flick's skid). */
export const flight3dMs = (p: Flight3dPreset, mode: Flight3dMode): number =>
  p.ms[mode].dur + (mode === 'discard' ? 0 : p.ms[mode].settle);

/** The pose at `t` ms into the flight. */
export function flight3dPose(p: Flight3dPreset, f: Flight3d, t: number): Pose3d {
  const { mode, from, to } = f;
  const duration = p.ms[mode].dur;
  const u = clamp(t / duration),
    e = mode === 'flick' ? outExpo(u) : inOut(u);
  const skid = u > 0.7 ? Math.sin((u - 0.7) * 30) * 0.05 * (1 - u) : 0;
  const after = t - duration;
  const bounce = mode === 'draw' && after > 0 ? Math.abs(Math.sin(after / 55)) * 8 * Math.exp(-after / 70) : 0;
  const wobble = after > 0 ? Math.sin(after / 40) * 0.18 * Math.exp(-after / 90) : 0;
  const size = mode === 'draw' ? lerp(0.5, 1, out(clamp(u * 3))) : lerp(from.radius / to.radius, 1, e);
  const pose: Pose3d = {
    x: lerp(from.x, to.x, e),
    y: lerp(from.y, to.y, e),
    radius: to.radius * size,
    lift: ((Math.sin(Math.PI * e) * p.lift[mode] + bounce) * to.radius) / 36,
    rx: mode === 'draw' ? out(u) * Math.PI * 4 + wobble : mode === 'discard' ? Math.PI * e : 0.18 * Math.sin(Math.PI * u) + skid,
    rz: mode === 'flick' ? e * Math.PI * 3 : mode === 'draw' ? u * 1.2 : 0.6 * e,
  };
  if (mode === 'flick' && u < 0.6) {
    const previous = outExpo(clamp(u - 0.12));
    pose.trail = { x: lerp(from.x, to.x, previous), y: lerp(from.y, to.y, previous), width: (16 * to.radius) / 36, alpha: 1 - u / 0.6 };
  }
  return pose;
}

/** The part of a three.js Object3D a flight moves. */
export interface Object3dLike {
  position: { set(x: number, y: number, z: number): unknown };
  rotation: { set(x: number, y: number, z: number): unknown };
  scale: { setScalar(s: number): unknown };
}
/** Screen px to the caller's world: the table point under (x, y) and the object's scale for that radius (three.ts tableMapper). */
export type ToWorld = (x: number, y: number, radius: number) => { x: number; y: number; z: number; scale: number };

export function applyPose(o: Object3dLike, pose: Pose3d, toWorld: ToWorld): void {
  const w = toWorld(pose.x, pose.y, pose.radius);
  o.position.set(w.x, w.y, w.z + pose.lift);
  o.rotation.set(pose.rx, 0, pose.rz);
  o.scale.setScalar(w.scale);
}

export interface Fly3dOptions {
  preset: Flight3dPreset;
  toWorld: ToWorld;
  /** after each pose: render the caller's scene */
  onFrame?: (pose: Pose3d) => void;
  /** settings factor: 1 normal, 2 slow, 0 none (lands at once) */
  speed?: number;
  now?: () => number;
  raf?: (f: (t: number) => void) => unknown;
}

/** Flies `o` along the flight on animation frames; `cancel` lands it at once. */
export function flyObject3d(o: Object3dLike, f: Flight3d, opt: Fly3dOptions): { done: Promise<void>; cancel: () => void } {
  const speed = opt.speed ?? 1;
  const now = opt.now ?? (() => performance.now());
  const raf = opt.raf ?? ((cb: (t: number) => void) => requestAnimationFrame(cb));
  const total = flight3dMs(opt.preset, f.mode);
  const start = now();
  let over = false;
  let finish = (): void => {};
  const done = new Promise<void>((resolve) => (finish = resolve));
  const show = (t: number): void => {
    const pose = flight3dPose(opt.preset, f, t);
    applyPose(o, pose, opt.toWorld);
    opt.onFrame?.(pose);
  };
  const land = (): void => {
    if (over) return;
    over = true;
    show(total);
    finish();
  };
  const frame = (): void => {
    if (over) return;
    const t = (now() - start) / speed;
    if (t >= total) return land();
    show(t);
    raf(frame);
  };
  if (speed <= 0) land();
  else frame();
  return { done, cancel: land };
}

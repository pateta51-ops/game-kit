// Port of Warp's Edge timeline.ts (decision 017): the 3D bag's motion as a pure function of (layout, drawn, t). The scene
// only poses meshes from it, so the same inputs always give the same picture. Which tokens are drawn is an input (the
// engine's draw event in D1; a fixed list in the mock); nothing here chooses them. The pile's rest layout comes from a
// small local seeded generator: it is decoration and never touches the engine's rng.

export interface Pose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}

export interface CoinRest extends Pose {
  /** per-coin phases of the jostle */
  p1: number;
  p2: number;
  p3: number;
}

export const COIN_RADIUS = 0.3;
export const COIN_HEIGHT = 0.07;

export const SHAKE_START = 0.2;
export const SHAKE_END = 1.8;
export const DRAW_START = 2.0;
export const STAGGER = 0.42;
export const DRAW_DURATION = 1.05;
/** The share of a draw spent rising out of the mouth; the coin counts as out of the bag after it. */
const RISE = 0.35;
const MOUTH = { x: 0, y: 2.35, z: 0.05 };
const ROW_Z = 2.2;
const ROW_GAP = 0.78;

/** mulberry32: the pile's layout only. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rest poses of `n` coins piled in the bottom of the bag (bag-local coordinates, the bag's base at y = 0). */
export function pileLayout(n: number, seed = 17): CoinRest[] {
  const rnd = seeded(seed);
  const out: CoinRest[] = [];
  for (let i = 0; i < n; i += 1) {
    const layer = Math.floor(i / 5);
    const r = Math.sqrt(rnd()) * (0.5 + layer * 0.11);
    const a = rnd() * Math.PI * 2;
    out.push({
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      y: 0.12 + layer * 0.17 + rnd() * 0.06,
      rx: (rnd() - 0.5) * 0.9,
      ry: rnd() * Math.PI * 2,
      rz: (rnd() - 0.5) * 0.9,
      p1: rnd() * Math.PI * 2,
      p2: rnd() * Math.PI * 2,
      p3: rnd() * Math.PI * 2,
    });
  }
  return out;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** The shake's envelope: 0 at rest, up to 1 in the middle of the shake. */
export function shakeAmount(t: number): number {
  const u = (t - SHAKE_START) / (SHAKE_END - SHAKE_START);
  if (u <= 0 || u >= 1) return 0;
  return Math.sin(Math.PI * u) ** 0.6;
}

/** The bag's pose: it rocks about its base while shaking and is still otherwise. */
export function bagPose(t: number): Pose {
  const a = shakeAmount(t);
  const w = t - SHAKE_START;
  return {
    x: 0.06 * a * Math.sin(2 * Math.PI * 2.1 * w),
    y: 0.1 * a * Math.abs(Math.sin(2 * Math.PI * 3.2 * w)),
    z: 0,
    rx: 0.1 * a * Math.sin(2 * Math.PI * 2.3 * w + 1),
    ry: 0.05 * a * Math.sin(2 * Math.PI * 1.1 * w),
    rz: 0.2 * a * Math.sin(2 * Math.PI * 3.2 * w),
  };
}

/** Where the k-th drawn coin lands: a row of five in front of the bag, face up. */
export function slotPose(k: number, of = 5): Pose {
  return { x: (k - (of - 1) / 2) * ROW_GAP, y: COIN_HEIGHT / 2, z: ROW_Z, rx: 0, ry: 0, rz: 0 };
}

/** The draw's progress of the k-th drawn coin, 0..1. */
export const drawProgress = (k: number, t: number): number =>
  clamp01((t - (DRAW_START + k * STAGGER)) / DRAW_DURATION);

/** The end of the whole shake-and-draw for `drawnCount` coins (with the last coin's settle). */
export const totalDuration = (drawnCount: number): number =>
  DRAW_START + Math.max(0, drawnCount - 1) * STAGGER + DRAW_DURATION + 0.4;

/**
 * The pose of coin `i` at time `t` (bag-local; the bag is at rest whenever a coin is drawn, so bag-local is world).
 * `drawnOrder` is the position of the coin in the drawn list, or -1 when it stays in the bag.
 */
export function coinPose(rest: CoinRest, drawnOrder: number, drawnCount: number, t: number): Pose {
  const a = shakeAmount(t);
  const w = t - SHAKE_START;
  const inside: Pose = {
    x: rest.x + a * 0.13 * Math.sin(2 * Math.PI * 3.1 * w + rest.p1),
    y: rest.y + a * 0.32 * Math.abs(Math.sin(2 * Math.PI * 2.7 * w + rest.p2)),
    z: rest.z + a * 0.13 * Math.sin(2 * Math.PI * 2.9 * w + rest.p3),
    rx: rest.rx + a * 1.4 * Math.sin(2 * Math.PI * 1.9 * w + rest.p2),
    ry: rest.ry + a * 2.0 * Math.sin(2 * Math.PI * 0.8 * w + rest.p3),
    rz: rest.rz + a * 1.4 * Math.sin(2 * Math.PI * 2.2 * w + rest.p1),
  };
  if (drawnOrder < 0) return inside;
  const u = drawProgress(drawnOrder, t);
  if (u <= 0) return inside;
  if (u < RISE) {
    // pinched and pulled up through the mouth, turning to stand and show its face to the camera
    const v = easeOutCubic(u / RISE);
    return {
      x: lerp(inside.x, MOUTH.x, v),
      y: lerp(inside.y, MOUTH.y, v),
      z: lerp(inside.z, MOUTH.z, v),
      rx: lerp(inside.rx, Math.PI / 2, v),
      ry: lerp(inside.ry, 0, v),
      rz: lerp(inside.rz, 0, v),
    };
  }
  const slot = slotPose(drawnOrder, drawnCount);
  const v = easeInOutCubic((u - RISE) / (1 - RISE));
  const pose: Pose = {
    x: lerp(MOUTH.x, slot.x, v),
    y: lerp(MOUTH.y, slot.y, v) + 0.55 * Math.sin(Math.PI * v),
    z: lerp(MOUTH.z, slot.z, v),
    rx: (Math.PI / 2) * (1 - v),
    ry: 0,
    rz: 0,
  };
  if (u >= 1) {
    // a short settle wobble once it lands
    const s = t - (DRAW_START + drawnOrder * STAGGER + DRAW_DURATION);
    const d = Math.exp(-7 * s);
    pose.rx = 0.07 * d * Math.sin(26 * s);
    pose.rz = 0.05 * d * Math.cos(21 * s);
    pose.y = slot.y + 0.012 * d * Math.abs(Math.sin(26 * s));
  }
  return pose;
}

/** How many coins are still in the bag at `t` (a drawn coin leaves once it is through the mouth). */
export function bagCountAt(total: number, drawnCount: number, t: number): number {
  let out = 0;
  for (let k = 0; k < drawnCount; k += 1) if (drawProgress(k, t) >= RISE) out += 1;
  return total - out;
}

/** A small string hash (FNV-1a), for picks that must not depend on where a coin lies. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Where each coin of the bag lies: a seeded permutation of the pile's places, so the order of `contents` (which may be
 * sorted) never decides which coins are on top. Decoration only, never the engine's rng.
 */
export function restOrder(n: number, seed = 29): number[] {
  const rnd = seeded(seed);
  const out = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const a = out[i] ?? 0;
    out[i] = out[j] ?? 0;
    out[j] = a;
  }
  return out;
}

/**
 * Which coin rises for each drawn token, decided at draw time from the drawn defs alone: a coin carrying that def,
 * wherever it lies in the pile. Coin positions are not an input, so nothing about where a coin lies predicts the next
 * draw; the engine's rng has already chosen the def (decision 017). A def missing from `contents` (bad input) takes any
 * coin still in the bag; -1 when the bag is empty.
 */
export function assignDraws(contents: readonly string[], drawn: readonly string[]): number[] {
  const used = new Set<number>();
  return drawn.map((def, k) => {
    let pool = contents.flatMap((c, i) => (c === def && !used.has(i) ? [i] : []));
    if (pool.length === 0) pool = contents.flatMap((_, i) => (used.has(i) ? [] : [i]));
    if (pool.length === 0) return -1;
    const pick = pool[hash(`${String(k)}:${def}`) % pool.length] ?? -1;
    used.add(pick);
    return pick;
  });
}

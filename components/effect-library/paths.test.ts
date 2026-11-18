// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { buildTimeline, createMotionPlayer, createVerbs } from '../motion-frame/index.ts';
import { flightPath, flightPose, multiStopPath, noseAlong, quadraticPose, registerEffects, tangentAt, travel, type EffectCtx } from './index.ts';
import type { QuadraticFlight } from './paths.ts';
import { trail } from './trail.ts';

const pass = {
  blend: 0.85, lookAhead: 0.02, nose: 148, rollAxis: 148, rollSquash: 0.15,
  reverseBrightness: 0.62, juke: 26, fadeSlope: 6,
  afterimages: { count: 4, spacing: 28, opacity: 0.32, filter: 'brightness(.7) sepia(1) hue-rotate(160deg) saturate(4)' },
};

const pathSettings = {
  arrival: {
    dur: 560,
    cubic: {
      controls: [0.18, 0.75, 0.28, 0.7], minLift: 24, startScale: 0.14,
      bank: 70, lean: 38, levelFrom: 0.62, curvature: 14, leanIn: 0.2, fadeIn: 0.12, perspective: 700,
    },
  },
  evasion: [
    { t: 250, dur: 650, from: [930, 790], to: [760, 300], quadratic: { ...pass, control: [700, 560], roll: [0.35, 0.7], side: 1 } },
    { t: 2770, dur: 480, from: [470, 330], to: [1280, 110], quadratic: { ...pass, control: [280, 300], blend: 0.7, exitScale: 0.28, exitFade: 0.85 } },
  ] satisfies readonly { t: number; dur: number; from: readonly [number, number]; to: readonly [number, number]; quadratic: QuadraticFlight }[],
  ribbon: { rear: 176 * 0.42, width: 12, tipWidth: 2, fade: 0.7, colour: '120,220,255', samples: 13, spacing: 12 },
  sortie: {
    padding: [52, 32], nose: 0, headingSample: 3, roll: 0.28,
    ghosts: { count: 4, spacing: 24, opacity: 0.18 },
  },
  sortieTimings: {
    overdrive: { launch: 640, travel: 300, lap: 560, hop: 260, back: 400 },
  },
} as const;

it.each([
  [{ x: 69, y: 590 }, { x: 304, y: 563 }, 150],
  [{ x: 69, y: 590 }, { x: 1327, y: 563 }, 150],
  [{ x: 30, y: 73 }, { x: 161, y: 250 }, 125],
] as const)('arrives at the slot level and banks and leans along the curve', (from, to, lift) => {
  const settings = pathSettings.arrival.cubic;
  const path = flightPath(from, to, lift, settings);
  expect(flightPose(path, 0, settings)).toMatchObject({ ...from, scale: 0.14, opacity: 0 });
  expect(flightPose(path, 1, settings)).toMatchObject({ ...to, scale: 1, opacity: 1 });
  expect(Math.abs(flightPose(path, 1, settings).rot)).toBe(0);
  const pose = flightPose(path, 0.35, settings);
  const v = tangentAt(path, travel(0.35));
  expect(pose.rot).toBeCloseTo(Math.max(-70, Math.min(70, noseAlong(v.x, v.y))));
  expect(Math.abs(pose.lean)).toBeGreaterThan(3);
});

it('passes along the quadratic curve, rolls, then shrinks out of view', () => {
  const pass = pathSettings.evasion[0]!;
  const mid = quadraticPose(pass.from, pass.to, 0.525, pass.quadratic);
  expect(mid.roll).toBeCloseTo(-1);
  expect(mid.alpha).toBe(1);
  const exit = pathSettings.evasion[1]!;
  expect(quadraticPose(exit.from, exit.to, 1, exit.quadratic)).toMatchObject({ x: 1280, y: 110, alpha: 0 });
  expect(quadraticPose(exit.from, exit.to, 1, exit.quadratic).scale).toBeCloseTo(0.28);
});

it('launches, laps, dwells, hops and returns; the DOM effect removes its ghosts on skip', () => {
  vi.useFakeTimers({ toFake: ['performance', 'requestAnimationFrame', 'cancelAnimationFrame'] });
  const home = [0, 0] as const;
  const settings = {
    ...pathSettings.sortie, ...pathSettings.sortieTimings.overdrive,
    stops: [{ box: [50, 20, 20, 20] as const, laps: 1, dwell: 100 }, { box: [110, 20, 20, 20] as const, dwell: 60 }],
  };
  const path = multiStopPath(home, settings);
  expect(path.at(500)).toEqual(home);
  expect(path.at(950)[1]).toBeGreaterThan(70);
  expect(path.at(1500)).toEqual(path.at(1580));
  expect(path.at(1810)[0]).toBeGreaterThan(60);
  expect(path.at(1880)).toEqual([120, 30]);
  expect(path.at(path.finish)).toEqual(home);
  const verbs = createVerbs<EffectCtx>();
  const context = registerEffects(verbs);
  try {
    const spec = { id: 'laps', actors: [{ id: 'ship', at: home }], steps: [{ actor: 'ship', t: 0, dur: path.finish, do: 'multi-stop-path', path: settings }] };
    const timeline = buildTimeline(spec, () => undefined);
    const finish = verbs.get('multi-stop-path')?.(timeline.calls[0]!, { id: 1, timeline, context });
    expect(context.el.childElementCount).toBe(5);
    vi.advanceTimersByTime(1000);
    expect(context.el.lastElementChild?.getAttribute('style')).toContain('rotate(');
    finish?.();
    expect(context.el.childElementCount).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    context.el.remove();
    vi.useRealTimers();
  }
});

it('draws the original tapered rear ribbon, stopping at the start of each pass', () => {
  const pass = pathSettings.evasion[0]!;
  const ribbon = { ...pathSettings.ribbon, quadratic: pass.quadratic };
  const strokes: [number, string][] = [];
  const ctx = {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    lineWidth: 0, strokeStyle: '',
    stroke() { strokes.push([this.lineWidth, this.strokeStyle]); },
  };
  const verbs = createVerbs<EffectCtx>();
  const layer = registerEffects(verbs);
  try {
    const timeline = buildTimeline({
      id: 'ribbon', actors: [{ id: 'ship', at: pass.from }],
      steps: [{ actor: 'ship', do: 'trail', t: 0, dur: pass.dur, to: pass.to, ribbon }],
    }, () => undefined);
    const fx = { call: timeline.calls[0]!, run: { id: 1, timeline, context: layer }, layer, x: 0, y: 0 };
    trail(ctx as unknown as CanvasRenderingContext2D, 30, fx);
    expect(strokes).toHaveLength(2);
    expect(strokes.map(([width]) => width)).toEqual([10, 6]);
    expect(strokes[0]?.[1]).toContain('120,220,255');
    expect(ctx.restore).toHaveBeenCalledOnce();
    trail(ctx as unknown as CanvasRenderingContext2D, pass.dur, fx);
    expect(strokes).toHaveLength(2);
    expect(verbs.has('trail')).toBe(true);
  } finally {
    layer.el.remove();
  }
});

it.each(['cubic', 'quadratic'] as const)('settles a %s arc on skipAll', (kind) => {
  vi.useFakeTimers({ toFake: ['performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'] });
  const verbs = createVerbs<EffectCtx>();
  const context = registerEffects(verbs);
  const player = createMotionPlayer({ specs: {}, stages: { default: () => undefined }, verbs, speed: () => 1, context });
  try {
    const shape = kind === 'cubic' ? pathSettings.arrival.cubic : pathSettings.evasion[0]!.quadratic;
    player.play({
      id: 'sampled', actors: [{ id: 'sample', at: [0, 0], w: 20, h: 20 }],
      steps: [{ actor: 'sample', do: 'arc-move', t: 0, dur: 500, to: [100, 60], [kind]: shape }],
    });
    vi.advanceTimersByTime(160);
    const clone = context.el.lastElementChild as HTMLElement;
    expect(context.el.childElementCount).toBe(kind === 'cubic' ? 1 : 5);
    expect(clone.style.transform).toContain(kind === 'cubic' ? 'perspective(700px) rotate(' : 'rotate(');
    player.skipAll();
    expect(context.el.childElementCount).toBe(1);
    expect(clone.style.transform).toBe('');
    expect(clone.style.left).toBe('90px');
    expect(clone.style.top).toBe('50px');
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    player.skipAll();
    context.el.remove();
    vi.useRealTimers();
  }
});

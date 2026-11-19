import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { WARP_FLIGHTS_3D, applyPose, flight3dMs, flight3dPose, flyObject3d, type Flight3d, type Object3dLike } from './index.ts';
import { tableMapper } from './three.ts';
import { endRect, isSoftwareGl } from './dom.ts';

const P = WARP_FLIGHTS_3D;
const from = { x: 100, y: 500, radius: 18 };
const to = { x: 700, y: 100, radius: 36 };
const fl = (mode: Flight3d['mode']): Flight3d => ({ mode, from, to });

describe('Warp preset (K447)', () => {
  it('keeps the approved mock numbers', () => {
    expect(P.ms).toEqual({
      draw: { stagger: 260, dur: 760, settle: 300 },
      flick: { dur: 520, settle: 80, nudge: 430 },
      discard: { stagger: 70, dur: 560 },
    });
    expect(P.lift).toEqual({ draw: 260, flick: 60, discard: 160 });
    expect(flight3dMs(P, 'draw')).toBe(1060);
    expect(flight3dMs(P, 'flick')).toBe(600);
    expect(flight3dMs(P, 'discard')).toBe(560);
  });
});

describe('flight3dPose (K447)', () => {
  it('starts on the source and rests on the target at full size, flat on the table', () => {
    for (const mode of ['flick', 'discard'] as const) {
      const a = flight3dPose(P, fl(mode), 0);
      expect([a.x, a.y, a.radius, a.lift]).toEqual([100, 500, 18, 0]);
      const b = flight3dPose(P, fl(mode), 5000);
      expect([b.x, b.y, b.radius]).toEqual([700, 100, 36]);
      expect(b.lift).toBeCloseTo(0, 6);
    }
  });

  it('lifts by the preset height scaled by radius / 36 at the midpoint of the eased path', () => {
    const mid = flight3dPose(P, fl('discard'), 280);
    expect(mid.x).toBeCloseTo(400, 6);
    expect(mid.lift).toBeCloseTo(160, 6);
    expect(mid.rx).toBeCloseTo(Math.PI / 2, 6);
    expect(flight3dPose({ ...P, lift: { ...P.lift, discard: 80 } }, fl('discard'), 280).lift).toBeCloseTo(80, 6);
  });

  it('a discard ends face down and turned 0.6 rad', () => {
    const end = flight3dPose(P, fl('discard'), 560);
    expect(end.rx).toBeCloseTo(Math.PI, 6);
    expect(end.rz).toBeCloseTo(0.6, 6);
  });

  it('a flick shoots out (outExpo), spins three half turns and leaves a fading trail for its first 60%', () => {
    const early = flight3dPose(P, fl('flick'), 104);
    expect(early.x).toBeGreaterThan(100 + 600 * 0.5);
    expect(early.trail?.alpha).toBeCloseTo(1 - 0.2 / 0.6, 6);
    expect(early.trail?.width).toBeCloseTo(16, 6);
    expect(flight3dPose(P, fl('flick'), 520 * 0.7).trail).toBeUndefined();
    expect(flight3dPose(P, fl('flick'), 520).rz).toBeCloseTo(3 * Math.PI, 6);
  });

  it('a draw grows from half size, tumbles and bounces after landing, then settles', () => {
    expect(flight3dPose(P, fl('draw'), 0).radius).toBe(18);
    expect(flight3dPose(P, fl('draw'), 760).rx).toBeCloseTo(4 * Math.PI, 6);
    expect(flight3dPose(P, fl('draw'), 760 + 85).lift).toBeGreaterThan(1);
    expect(flight3dPose(P, fl('draw'), 760 + 2000).lift).toBeLessThan(0.01);
  });
});

describe('applyPose and flyObject3d (K447)', () => {
  const fake = () => {
    const o = { position: { set: vi.fn() }, rotation: { set: vi.fn() }, scale: { setScalar: vi.fn() } };
    return o satisfies Object3dLike;
  };
  const toWorld = (x: number, y: number, radius: number) => ({ x, y: -y, z: 0, scale: radius });

  it('applyPose places, turns and scales a three.js object from the screen pose', () => {
    const o = fake();
    applyPose(o, { x: 10, y: 20, radius: 5, lift: 7, rx: 1, rz: 2 }, toWorld);
    expect(o.position.set).toHaveBeenCalledWith(10, -20, 7);
    expect(o.rotation.set).toHaveBeenCalledWith(1, 0, 2);
    expect(o.scale.setScalar).toHaveBeenCalledWith(5);
  });

  it('flies frame by frame on the given clock and lands on the target', async () => {
    const o = fake();
    let now = 0;
    const frames: ((t: number) => void)[] = [];
    const onFrame = vi.fn();
    const run = flyObject3d(o, fl('discard'), { preset: P, toWorld, onFrame, now: () => now, raf: (f) => frames.push(f) });
    while (frames.length) {
      now += 100;
      frames.shift()!(now);
    }
    await run.done;
    expect(o.position.set).toHaveBeenLastCalledWith(700, -100, expect.closeTo(0, 6));
    expect(onFrame.mock.calls.length).toBeGreaterThan(5);
  });

  it('speed 0 lands at once; speed 2 takes twice as long', async () => {
    const o = fake();
    const raf = vi.fn();
    await flyObject3d(o, fl('flick'), { preset: P, toWorld, speed: 0, raf }).done;
    expect(raf).not.toHaveBeenCalled();
    expect(o.position.set).toHaveBeenLastCalledWith(700, -100, expect.closeTo(0, 6));
    let now = 0;
    const frames: ((t: number) => void)[] = [];
    const o2 = fake();
    flyObject3d(o2, fl('discard'), { preset: P, toWorld, speed: 2, now: () => now, raf: (f) => frames.push(f) });
    now = 560;
    frames.shift()!(now);
    expect(o2.position.set).toHaveBeenLastCalledWith(expect.closeTo(400, 6), expect.closeTo(-300, 6), expect.closeTo(160, 6));
  });

  it('cancel stops the frames and lands the object', async () => {
    const o = fake();
    const frames: ((t: number) => void)[] = [];
    const run = flyObject3d(o, fl('discard'), { preset: P, toWorld, now: () => 0, raf: (f) => frames.push(f) });
    run.cancel();
    await run.done;
    expect(o.position.set).toHaveBeenLastCalledWith(700, -100, expect.closeTo(0, 6));
    const calls = o.position.set.mock.calls.length;
    frames.forEach((f) => f(100));
    expect(o.position.set.mock.calls.length).toBe(calls);
  });
});

describe('tableMapper (K447)', () => {
  it('maps the screen centre to the point the camera looks at, and scales 1:1 there', () => {
    const w = 800, h = 600;
    const camera = new PerspectiveCamera(24, w / h, 1, 50000);
    const d = h / (2 * Math.tan((12 * Math.PI) / 180));
    camera.position.set(w / 2, -h / 2, d);
    camera.lookAt(w / 2, -h / 2, 0);
    camera.updateMatrixWorld();
    const p = tableMapper(camera, () => ({ width: w, height: h }))(w / 2, h / 2, 36);
    expect(p.x).toBeCloseTo(400, 3);
    expect(p.y).toBeCloseTo(-300, 3);
    expect(p.z).toBe(0);
    expect(p.scale).toBeCloseTo(36, 3);
    expect(tableMapper(camera, () => ({ width: w, height: h }))(0, 0, 36).x).toBeCloseTo(0, 3);
  });
});

describe('endRect (K447)', () => {
  it("reads the element's rect at its animations' end and puts their clocks back", () => {
    const anims = [5, 10].map((t, i) => ({
      currentTime: t as number | null,
      effect: { getComputedTiming: () => ({ endTime: i ? 400 : Infinity }) },
    }));
    const el = {
      getAnimations: () => anims,
      getBoundingClientRect: () => ({ left: anims[1]!.currentTime, top: 0, width: 10, height: 10 }) as unknown as DOMRect,
    };
    expect(endRect(el as unknown as HTMLElement).left).toBe(400);
    expect(anims.map((a) => a.currentTime)).toEqual([5, 10]);
  });
});

describe('isSoftwareGl (K447)', () => {
  const gl = (renderer: string, ext = true) =>
    ({
      RENDERER: 1,
      getExtension: (n: string) => (ext && n === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 2 } : null),
      getParameter: (p: number) => (p === (ext ? 2 : 1) ? renderer : 'other'),
    }) as unknown as WebGLRenderingContext;

  it('names the CPU rasterisers as software and a GPU as not', () => {
    expect(isSoftwareGl(gl('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'))).toBe(true);
    expect(isSoftwareGl(gl('llvmpipe (LLVM 15.0.7, 256 bits)'))).toBe(true);
    expect(isSoftwareGl(gl('Microsoft Basic Render Driver'))).toBe(true);
    expect(isSoftwareGl(gl('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11)'))).toBe(false);
  });

  it('falls back to RENDERER without the debug extension', () => {
    expect(isSoftwareGl(gl('Mesa softpipe', false))).toBe(true);
    expect(isSoftwareGl(gl('Apple GPU', false))).toBe(false);
  });

  it('without a context probes a canvas; no WebGL at all counts as software', () => {
    const doc = { createElement: () => ({ getContext: () => null }) };
    expect(isSoftwareGl(undefined, doc as unknown as Document)).toBe(true);
    const lose = vi.fn();
    const g = gl('NVIDIA') as unknown as Record<string, unknown>;
    const ge = g['getExtension'] as (n: string) => unknown;
    g['getExtension'] = (n: string) => (n === 'WEBGL_lose_context' ? { loseContext: lose } : ge(n));
    expect(isSoftwareGl(undefined, { createElement: () => ({ getContext: () => g }) } as unknown as Document)).toBe(false);
    expect(lose).toHaveBeenCalled();
  });
});

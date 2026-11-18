// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createMotionPlayer, createVerbs } from '../motion-frame/index.ts';
import { crumplePose } from './crumple.ts';
import { registerEffects, registerGlEffect, type EffectCtx } from './index.ts';

function play(verb: string, register?: (verbs: ReturnType<typeof createVerbs<EffectCtx>>) => void, image?: HTMLCanvasElement) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  const verbs = createVerbs<EffectCtx>();
  const layer = registerEffects(verbs);
  register?.(verbs);
  const player = createMotionPlayer({
    specs: {}, stages: { default: () => undefined }, verbs, context: layer, speed: () => 2,
    onBeatEnd: (run) => layer.end(run),
  });
  player.play({
    id: 'pieces',
    actors: [{ id: 'piece', at: [50, 50], w: 80, h: 120 }],
    steps: [
      { t: 0, dur: 100, do: verb, actor: 'piece', image },
      { t: 0, dur: 200, do: verb, actor: 'piece', image },
    ],
  });
  vi.advanceTimersByTime(40);
  return { layer, player };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

it.each(['skip', 'finish', 'clear'])('shares one WebGL context and releases it on %s', (end) => {
  const loseContext = vi.fn();
  const release = vi.fn();
  const clear = vi.fn();
  const gl = {
    viewport() {}, disable() {}, colorMask() {}, depthMask() {}, clearColor() {}, clearDepth() {},
    COLOR_BUFFER_BIT: 1, DEPTH_BUFFER_BIT: 2, clear, getExtension: () => ({ loseContext }),
  };
  const get = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(gl as unknown as WebGL2RenderingContext);
  const draw = vi.fn();
  const { layer, player } = play('custom', (verbs) => {
    const active = new WeakSet();
    registerGlEffect(verbs, 'custom', (ctx, t, fx) => {
      if (!active.has(fx)) {
        active.add(fx);
        fx.onCleanup(release);
      }
      draw(ctx, t, fx.x, fx.y);
    });
  });
  expect(get).toHaveBeenCalledOnce();
  expect(draw).toHaveBeenCalledWith(gl, 8, 50, 50);
  expect(clear).toHaveBeenCalledWith(3);
  expect(layer.el.querySelectorAll('.fx-gl')).toHaveLength(1);
  if (end === 'skip') player.skipAll();
  else if (end === 'clear') {
    layer.clear();
    player.skipAll();
  } else {
    vi.advanceTimersByTime(180);
    expect(release).toHaveBeenCalledOnce();
    expect(loseContext).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
  }
  expect(layer.el.querySelector('.fx-gl')).toBeNull();
  expect(release).toHaveBeenCalledTimes(2);
  expect(loseContext).toHaveBeenCalledOnce();
});

const canvas2d = () => ({
  setTransform() {}, clearRect() {}, save() {}, restore() {}, beginPath() {}, roundRect() {}, clip() {},
  translate() {}, scale() {}, rotate() {}, drawImage: vi.fn(),
});

it.each(['skip', 'finish'])('draws crumple on 2D when WebGL2 is missing and drops the canvas on %s', (end) => {
  const ctx = canvas2d();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((type) => type === '2d' ? ctx as unknown as CanvasRenderingContext2D : null);
  const { layer, player } = play('crumple', undefined, document.createElement('canvas'));
  expect(layer.el.querySelectorAll('.fx-gl-fallback')).toHaveLength(1);
  expect(ctx.drawImage).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), -40, -60, 80, 120);
  if (end === 'skip') player.skipAll();
  else vi.advanceTimersByTime(400);
  expect(layer.el.querySelector('.fx-gl')).toBeNull();
});

it('switches live effects to 2D after context loss', () => {
  const gl = {
    viewport() {}, disable() {}, colorMask() {}, depthMask() {}, clearColor() {}, clearDepth() {}, clear() {},
  } as unknown as WebGL2RenderingContext;
  const ctx = canvas2d();
  const fallback = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((type) => type === '2d' ? ctx as unknown as CanvasRenderingContext2D : gl);
  const { layer, player } = play('custom', (verbs) => registerGlEffect(verbs, 'custom', () => {}, fallback));
  layer.el.querySelector('.fx-gl')?.dispatchEvent(new Event('webglcontextlost'));
  vi.advanceTimersByTime(20);
  expect(fallback).toHaveBeenCalledWith(ctx, expect.any(Number), expect.objectContaining({ x: 50, y: 50 }));
  expect(layer.el.querySelectorAll('.fx-gl-fallback')).toHaveLength(1);
  player.skipAll();
  expect(layer.el.querySelector('.fx-gl')).toBeNull();
});

it('lands opaque by default and supports both an exact endpoint and a timed fade', () => {
  const from = [0, 0, 100, 140] as const;
  const to = [200, 20, 100, 140] as const;
  expect(crumplePose(0, from, to, {})).toMatchObject({ p: 0, cx: 50, cy: 70, sx: 1, alpha: 1 });
  expect(crumplePose(1430, from, to, {})).toMatchObject({ p: 1, cx: 250, cy: 94.2, sx: .96, alpha: 1 });
  expect(crumplePose(1129, from, to, { fadeOut: true }).alpha).toBe(1);
  expect(crumplePose(1130, from, to, { fadeOut: true }).alpha).toBe(0);
  expect(crumplePose(1180, from, to, { fadeOut: [1130, 1230] }).alpha).toBe(.5);
});

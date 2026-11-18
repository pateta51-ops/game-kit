// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createMotionPlayer, createVerbs, type Step } from '../motion-frame/index.ts';
import { bolt } from './combat-canvas.ts';
import { dissolveSmoke } from './break-effects.ts';
import { registerEffects, type EffectCtx } from './index.ts';

const animate = vi.fn<HTMLElement['animate']>();
const cancel = vi.fn();

function play(step: Partial<Step> & Pick<Step, 'do'>) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  animate.mockReturnValue({ cancel } as unknown as Animation);
  const source = document.createElement('div');
  const verbs = createVerbs<EffectCtx>();
  const layer = registerEffects(verbs, { resolve: () => source });
  const actors = [{ id: 'piece', at: [50, 50] as const, w: 80, h: 120, hideSource: 'step' as const }];
  const show = vi.fn();
  const player = createMotionPlayer({
    specs: {}, stages: { default: () => undefined }, verbs, context: layer, speed: () => 1,
    onBeatStart: (run) => layer.start(run, actors),
    onBeatEnd: (run) => {
      show(layer.el.firstElementChild?.getAttribute('style'));
      layer.end(run);
    },
  });
  player.play({ id: 'combat', actors, steps: [{ t: 0, actor: 'piece', dur: 1400, to: [220, 80], ...step }] });
  vi.advanceTimersByTime(20);
  return { layer, player, show, source };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
  Reflect.deleteProperty(Element.prototype, 'animate');
  document.body.replaceChildren();
});

it.each(['skip', 'finish'])('removes projectiles on %s', (end) => {
  const set = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty');
  const { layer, player, source } = play({ do: 'projectile', travelMs: 200, delay: 50, miss: { past: .9, fadeMs: 420, mask: 'linear-gradient(black, transparent)' } });
  expect(animate).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ clipPath: 'inset(0 0 0 100%)' })]), expect.objectContaining({ duration: 800, delay: 50 }));
  expect(set).toHaveBeenCalledWith('-webkit-mask-image', expect.stringContaining('linear-gradient'));
  if (end === 'skip') player.skipAll();
  else vi.advanceTimersByTime(1450);
  expect(layer.el.children).toHaveLength(0);
  expect(source.style.visibility).toBe('');
  expect(cancel).toHaveBeenCalledTimes(2);
});

it.each([
  ['dissolve', { cols: 2, embers: 2 }, 10],
  ['shatter', { count: 5 }, 6],
] as const)('hides the %s actor at the end and removes its stand-ins on skip', (verb, settings, count) => {
  const { layer, player, show, source } = play({ do: verb, ...settings });
  expect(animate).toHaveBeenCalledTimes(count);
  player.skipAll();
  expect(layer.el.children).toHaveLength(0);
  expect(show).toHaveBeenCalledWith(expect.stringContaining('opacity: 0'));
  expect(source.style.visibility).toBe('');
});

it('delays and clears both shimmer layers', () => {
  const { layer, player } = play({ do: 'shimmer', delay: 200, ms: 620, jolt: { vector: [8, -4], ms: 240 } });
  expect(animate).toHaveBeenNthCalledWith(1, expect.anything(), expect.objectContaining({ delay: 200, duration: 620 }));
  expect(animate).toHaveBeenNthCalledWith(2, expect.anything(), expect.objectContaining({ delay: 200, duration: 496 }));
  expect(animate).toHaveBeenNthCalledWith(3, expect.arrayContaining([{ offset: .25, transform: 'translate(8px, -4px)', easing: 'ease-in-out' }]), expect.objectContaining({ delay: 200, duration: 240 }));
  player.skipAll();
  expect(layer.el.children).toHaveLength(0);
});

it('repeats a ring pulse and clears it at beat end', () => {
  const { layer } = play({ do: 'ring-pulse', count: 2, ms: 520 });
  expect(animate).toHaveBeenNthCalledWith(2, expect.anything(), expect.objectContaining({ delay: 520, duration: 520 }));
  vi.advanceTimersByTime(1450);
  expect(layer.el.children).toHaveLength(0);
});

function canvas() {
  return {
    globalAlpha: 1,
    clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })), beginPath: vi.fn(),
    arc: vi.fn(), fill: vi.fn(), fillRect: vi.fn(), stroke: vi.fn(), moveTo: vi.fn<CanvasRenderingContext2D["moveTo"]>(), lineTo: vi.fn<CanvasRenderingContext2D["lineTo"]>(), closePath: vi.fn(),
  };
}

it('paints a shield at contact and drops the canvas on skip', () => {
  const ctx = canvas();
  vi.stubGlobal('CanvasRenderingContext2D', class {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  const { layer, player } = play({ do: 'shield-bubble', hit: 100, radius: [30, 20], hitAngle: 0 });
  vi.advanceTimersByTime(200);
  expect(ctx.scale).toHaveBeenCalledWith(30, 20);
  expect(ctx.createRadialGradient).toHaveBeenCalledWith(79.1, 50, 0, 79.1, 50, 110);
  expect(ctx.closePath).toHaveBeenCalled();
  const [vx, vy] = ctx.lineTo.mock.calls[0]!;
  const [mx, my] = ctx.moveTo.mock.calls[0]!;
  expect(Math.hypot(vx - mx, vy - my)).toBeCloseTo(5.4);
  player.skipAll();
  expect(layer.el.querySelector('canvas')).toBeNull();
});

it.each([
  [{}, ['scaleX(1)', 'scaleX(0)', 'scaleX(1)']],
  [{ axis: 'y' }, ['scaleY(1)', 'scaleY(0)', 'scaleY(1)']],
  [{ direction: 1, holdMs: 200 }, [0, 0, 90, -90, 0].map((a) => `perspective(800px) rotateY(${a}deg)`)],
  [{ axis: 'y', direction: -1, perspective: 500 }, [0, -90, 90, 0].map((a) => `perspective(500px) rotateX(${a}deg)`)],
] as const)('flips through the requested axis and direction (%j)', (settings, transforms) => {
  const { layer, player } = play({ do: 'flip', ...settings });
  const frames = animate.mock.calls[0]?.[0] as Keyframe[];
  expect(frames.map((frame) => frame.transform)).toEqual(transforms);
  const actor = layer.el.firstElementChild!;
  vi.advanceTimersByTime('holdMs' in settings ? 770 : 670);
  expect(actor.hasAttribute('data-fx-flipped')).toBe(false);
  vi.advanceTimersByTime(40);
  expect(actor.hasAttribute('data-fx-flipped')).toBe(true);
  player.skipAll();
});

it('swaps immediately when squash is disabled', () => {
  const { layer, player } = play({ do: 'flip', squash: false, direction: -1, label: 'back' });
  expect(layer.el.firstElementChild?.getAttribute('data-fx-label')).toBe('back');
  expect(animate).not.toHaveBeenCalled();
  player.skipAll();
});

it('animates a clipped shockwave with scaled radius and custom strokes', () => {
  const { player } = play({ do: 'ring-pulse', delay: 40, unit: 2, clip: [0, 0, 100, 100], shockwaves: [
    { delay: 20, ms: 400, radius: 30, width: 10, alpha: .6, squash: .5, borderWidth: 3, outlineWidth: 4 },
  ] });
  const frames = animate.mock.calls[0]?.[0] as Keyframe[];
  expect(frames[0]?.transform).toBe(`scale(${1 / 60},${1 / 120})`);
  expect(frames.at(-1)).toMatchObject({ border: '6px solid rgb(255 255 255 / 0)', outline: '8px solid rgb(255 255 255 / 0)' });
  expect(animate.mock.calls[0]?.[1]).toMatchObject({ duration: 400, delay: 60 });
  player.skipAll();
});

it('lifts, spins and hides the dissolving actor', () => {
  const { player, show } = play({ do: 'dissolve', delay: 50, lift: { distance: 40, spin: 1.5, fade: [200, 380], ms: 380 } });
  expect(animate).toHaveBeenCalledWith(expect.arrayContaining([{ transform: 'translateY(-40px) rotate(1.5rad)', opacity: 0 }]), expect.objectContaining({ duration: 380, delay: 50 }));
  player.skipAll();
  expect(show).toHaveBeenCalledWith(expect.stringContaining('opacity: 0'));
});

function frame(settings: Record<string, unknown>) {
  return { call: { from: [0, 0, 20, 20], to: [100, 0, 20, 20], step: settings }, x: 10, y: 10 } as unknown as Parameters<typeof bolt>[2];
}

it('draws smoke after lift starts and lets the configured puff expire', () => {
  const ctx = canvas();
  const draw = ctx as unknown as CanvasRenderingContext2D;
  const data = frame({ delay: 50, lift: { distance: 40, ms: 380, smoke: { n: 1, life: 200 } } });
  dissolveSmoke(draw, 49, data);
  expect(ctx.fillRect).not.toHaveBeenCalled();
  dissolveSmoke(draw, 300, data);
  expect(ctx.fillRect).toHaveBeenCalledTimes(2);
  ctx.fillRect.mockClear();
  dissolveSmoke(draw, 500, data);
  expect(ctx.fillRect).toHaveBeenCalledTimes(1);
  ctx.fillRect.mockClear();
  dissolveSmoke(draw, 600, data);
  expect(ctx.fillRect).not.toHaveBeenCalled();
});

it.each(['streak', 'ribbon'] as const)('draws the %s path and core', (mode) => {
  const ctx = canvas();
  bolt(ctx as unknown as CanvasRenderingContext2D, 50, frame({
    bolt: mode, travelMs: 100, launchMs: 0, trailMs: 50, trailPoints: 3, lift: 20,
  }));
  expect(ctx.stroke).toHaveBeenCalledTimes(2);
  expect(ctx.moveTo).toHaveBeenCalledWith(10, mode === 'ribbon' ? -10 : 10);
  expect(ctx.lineTo).toHaveBeenCalledTimes(mode === 'ribbon' ? 2 : 1);
  expect(ctx.lineTo).toHaveBeenLastCalledWith(...(mode === 'ribbon' ? [60, -20] : [22.5, 10]));
});

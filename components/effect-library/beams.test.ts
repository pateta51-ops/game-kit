// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { buildTimeline, createVerbs, type Step } from '../motion-frame/index.ts';
import { registerEffects, type EffectCtx } from './index.ts';
import { curvedBeam, radialStreaks } from './beam-canvas.ts';

const animate = vi.fn<HTMLElement['animate']>();
const cancel = vi.fn();
function setup(step: Partial<Step> & Pick<Step, 'do'>) {
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  animate.mockReturnValue({ cancel } as unknown as Animation);
  const verbs = createVerbs<EffectCtx>();
  const context = registerEffects(verbs);
  const timeline = buildTimeline({
    id: 'beams', actors: [{ id: 'piece', at: [50, 50], w: 20, h: 40 }],
    steps: [{ t: 0, actor: 'piece', dur: 1600, to: [150, 80], ...step }],
  }, () => undefined);
  const call = timeline.calls[0]!;
  const run = { id: 1, context, timeline };
  const end = verbs.get(call.verb)?.(call, run);
  return { context, end, run, call };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
  Reflect.deleteProperty(Element.prototype, 'animate');
  document.body.replaceChildren();
});

it('stages the crossing and overlapping transfer columns with one label', () => {
  const setProperty = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty');
  const { context, end } = setup({ do: 'warp-transfer', count: 2, totalLabel: { text: '+2', at: [20, 20] } });
  const opts = animate.mock.calls.map(([, opts]) => opts);
  expect(opts).toEqual(expect.arrayContaining([
    expect.objectContaining({ duration: 420, delay: 510 }),
    expect.objectContaining({ duration: 320, delay: 846 }),
    expect.objectContaining({ duration: 320, delay: 956 }),
    expect.objectContaining({ duration: 1700, delay: 1025.2 }),
  ]));
  expect(setProperty).toHaveBeenCalledWith('-webkit-mask-image', expect.stringContaining('linear-gradient'));
  expect(context.el.textContent).toBe('+2');
  end?.();
  expect(context.el.children).toHaveLength(1);
  expect(context.el.firstElementChild?.getAttribute('style')).not.toContain('visibility: hidden');
});

it('collapses, waits, and expands at the destination', () => {
  const { context, end } = setup({ do: 'collapse-jump', n: 3 });
  expect(context.el.children).toHaveLength(9);
  expect(animate).toHaveBeenNthCalledWith(2, expect.arrayContaining([
    expect.objectContaining({ transform: 'translate(100px, 30px) scale(0)' }),
  ]), expect.objectContaining({ delay: 780, duration: 640 }));
  end?.();
  expect(context.el.firstElementChild?.getAttribute('style')).toContain('left: 140px');
});

it('clips the tucked card and limits the glitter to the requested count', () => {
  const { context, end } = setup({ do: 'column-beam', tuck: 12, glitter: 4, way: 'in', core: true });
  expect(animate).toHaveBeenCalledTimes(7);
  expect(animate).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ clipPath: 'inset(0 0 12px 0)' })]), expect.anything());
  end?.();
  expect(context.el.children).toHaveLength(1);
});

it('rotates the wedge through every requested turn', () => {
  const setProperty = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty');
  const { context, end } = setup({ do: 'rotating-beam', turns: 3 });
  expect(setProperty).toHaveBeenCalledWith('-webkit-mask-image', expect.stringContaining('radial-gradient'));
  expect(animate).toHaveBeenNthCalledWith(2, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(1080deg)' }], expect.anything());
  end?.();
  expect(context.el.children).toHaveLength(1);
});

it('clips the rotating beam to the actor only when asked', () => {
  const clipped = setup({ do: 'rotating-beam', clip: true }).context.el.children;
  expect([...clipped].map((e) => (e as HTMLElement).style.clipPath)).toEqual(['inset(52px 62px)', 'inset(7px 5px)']);
  document.body.replaceChildren();
  const plain = setup({ do: 'rotating-beam' }).context.el.children;
  expect([...plain].every((e) => !(e as HTMLElement).style.clipPath)).toBe(true);
});

it('draws deterministic radial streaks at the specified centre', () => {
  const { call, run, context } = setup({ do: 'unused', count: 4, centre: [100, 300], alpha: .2, palette: ['1,2,3', '4,5,6', '7,8,9'] });
  const ctx = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), strokeStyle: '' };
  const fx = { call, run, layer: context, x: 0, y: 0 };
  radialStreaks(ctx as unknown as CanvasRenderingContext2D, 800, fx);
  const { strokeStyle } = ctx;
  expect(strokeStyle).toMatch(/^rgba\((1,2,3|4,5,6|7,8,9),/);
  const alpha = Number(strokeStyle.split(',').at(-1)?.slice(0, -1));
  expect(alpha).toBeGreaterThan(0);
  expect(alpha).toBeLessThanOrEqual(.2);
  const points = ctx.lineTo.mock.calls.slice();
  expect(points).toHaveLength(4);
  ctx.lineTo.mockClear();
  radialStreaks(ctx as unknown as CanvasRenderingContext2D, 800, fx);
  expect(ctx.lineTo.mock.calls).toEqual(points);
});

it('draws the curved lock and retracts it at the scheduled time', () => {
  const { call, run, context } = setup({ do: 'unused', curve: { control: [75, 0] } });
  const ctx = {
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(),
    createRadialGradient: () => ({ addColorStop: vi.fn() }), beginPath: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fill: vi.fn(), arc: vi.fn(), ellipse: vi.fn(), fillRect: vi.fn(),
  };
  const fx = { call, run, layer: context, x: 0, y: 0 };
  curvedBeam(ctx as unknown as CanvasRenderingContext2D, 650, fx);
  expect(ctx.lineTo).toHaveBeenCalledTimes(120);
  expect(ctx.lineTo).toHaveBeenLastCalledWith(150, 80);
  ctx.ellipse.mockClear();
  curvedBeam(ctx as unknown as CanvasRenderingContext2D, 1050, fx);
  expect(ctx.ellipse).not.toHaveBeenCalled();
});

it('holds the portal marker until travel begins and draws four spiral arms', () => {
  const setProperty = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty');
  const { context, end } = setup({
    do: 'warp-transfer', mode: 'portal',
    portal: { outward: true, travelAt: 1200, travelMs: 400, startSize: 60, endSize: 20, vortex: { size: 120, open: [0, 300] } },
  });
  expect(setProperty).toHaveBeenCalledWith('-webkit-mask-image', expect.stringContaining('radial-gradient'));
  expect(context.el.querySelectorAll('polyline')).toHaveLength(4);
  const frames = animate.mock.calls[0]![0] as Keyframe[];
  expect(frames[50]?.transform).toContain('translate(0px, 0px)');
  expect(frames[99]?.transform).not.toContain('translate(0px, 0px)');
  end?.();
  expect(context.el.querySelector('svg')).toBeNull();
});

it('applies the spent look after the greying step is skipped', () => {
  const { context, end } = setup({
    do: 'warp-transfer', mode: 'grey', dur: 300, afterLook: { opacity: .4, filter: 'grayscale(1)' },
  });
  expect(animate).toHaveBeenLastCalledWith(expect.arrayContaining([
    expect.objectContaining({ transform: 'scale(.92)', offset: .5 }),
  ]), expect.objectContaining({ duration: 300, easing: 'ease-out' }));
  end?.();
  expect(context.el.firstElementChild?.getAttribute('style')).toContain('filter: grayscale(1)');
});

it('plays only the requested crossing dots and removes them on skip', () => {
  const { context, end } = setup({ do: 'warp-transfer', mode: 'crossing', crossingDots: 2 });
  expect(animate).toHaveBeenCalledTimes(2);
  expect(animate).toHaveBeenLastCalledWith(expect.arrayContaining([
    expect.objectContaining({ offset: 1, transform: 'translate(140px, 70px)', opacity: 0 }),
  ]), expect.objectContaining({ duration: 420, delay: 28 }));
  end?.();
  expect(context.el.children).toHaveLength(1);
});

it('zips with one ghost and two landing sparks', () => {
  const { end } = setup({ do: 'warp-transfer', mode: 'zip', zipGhosts: 1, zipSparks: 2, zipPopMs: 90 });
  const timing = animate.mock.calls.map(([, options]) => options);
  expect(timing.map((o) => (o as KeyframeAnimationOptions).duration)).toEqual([200, 200, 90, 250, 250]);
  expect(timing.map((o) => (o as KeyframeAnimationOptions).delay)).toEqual([22, 0, 200, 200, 200]);
  end?.();
});

it('starts the rise flight when the configured lift ends', () => {
  const { end } = setup({ do: 'warp-transfer', mode: 'rise', lift: 25, riseMs: 80, riseTravelMs: 170 });
  expect(animate).toHaveBeenNthCalledWith(1, expect.arrayContaining([
    { opacity: 1, transform: 'translateY(-25px) scale(1.1)' },
  ]), expect.objectContaining({ duration: 80, delay: 0 }));
  expect(animate).toHaveBeenLastCalledWith(expect.arrayContaining([
    { opacity: 1, transform: 'translate(100px, 30px) scale(1)' },
  ]), expect.objectContaining({ duration: 170, delay: 80 }));
  end?.();
});

it('pops a revealed actor at the requested offsets', () => {
  const { context, end } = setup({ do: 'warp-transfer', mode: 'pop', dur: 300, popOffsets: [.3, .6] });
  expect(animate).toHaveBeenLastCalledWith([
    { transform: 'scale(0)', opacity: 0 },
    { transform: 'scale(1.35)', opacity: 1, offset: .3 },
    { transform: 'scale(.92)', offset: .6 },
    { transform: 'scale(1)' },
  ], expect.objectContaining({ duration: 300 }));
  end?.();
  expect(context.el.firstElementChild?.getAttribute('style')).toContain('opacity: 1');
});

it('flashes the counter colour while bumping', () => {
  const { end } = setup({ do: 'warp-transfer', mode: 'bump', counterColour: 'gold', dur: 300 });
  expect(animate).toHaveBeenLastCalledWith([
    { transform: 'scale(1.35)', color: 'gold' },
    { transform: 'scale(.92)', color: 'gold', offset: .5 },
    { transform: 'scale(1)' },
  ], expect.objectContaining({ duration: 300 }));
  end?.();
});

it('fades the actor out as the outward column retracts', () => {
  const { context, end } = setup({ do: 'column-beam', way: 'out', glitter: 0 });
  expect(animate).toHaveBeenNthCalledWith(1, expect.arrayContaining([
    { offset: 1, transform: 'scaleX(.04)', opacity: 0 },
  ]), expect.anything());
  expect(animate).toHaveBeenLastCalledWith(expect.arrayContaining([
    expect.objectContaining({ offset: .7, opacity: 0, transform: 'translateY(-2.4px)' }),
  ]), expect.anything());
  end?.();
  expect(context.el.firstElementChild?.getAttribute('style')).toContain('opacity: 0');
});

it('draws a spiral transfer on the canvas and removes it on skip', () => {
  vi.useFakeTimers({ toFake: ['performance', 'requestAnimationFrame', 'cancelAnimationFrame'] });
  const ctx = {
    clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), ellipse: vi.fn(),
    fill: vi.fn(), translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), drawImage: vi.fn(),
    fillRect: vi.fn(), createRadialGradient: () => ({ addColorStop: vi.fn() }),
  };
  vi.stubGlobal('CanvasRenderingContext2D', class {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(20);
  const { context, end } = setup({ do: 'warp-transfer', spiral: { image: 'ship.png' } });
  expect(context.el.querySelector('canvas')).toBeInstanceOf(HTMLCanvasElement);
  vi.advanceTimersByTime(336);
  expect(ctx.drawImage).toHaveBeenCalled();
  expect(animate).not.toHaveBeenCalled();
  end?.();
  expect(context.el.querySelector('canvas')).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});

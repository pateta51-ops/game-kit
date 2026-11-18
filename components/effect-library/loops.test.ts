// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMotionPlayer, createVerbs, type Step } from '../motion-frame/index.ts';
import { registerEffects, startIdle, startPulse, type EffectCtx } from './index.ts';

const cancel = vi.fn();
const clock = { cancel, currentTime: 0 };
const animate = vi.fn<HTMLElement['animate']>().mockReturnValue(clock as unknown as Animation);

beforeEach(() => {
  vi.useFakeTimers();
  clock.currentTime = 0;
  vi.clearAllMocks();
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  document.body.replaceChildren();
});

function play(step: Omit<Step, 'actor' | 't' | 'dur'>, dur = 800, speed: number | 'instant' = 1) {
  const source = document.createElement('div');
  source.style.overflow = 'clip';
  source.style.borderRadius = '6px';
  source.innerHTML = '<div class="face" id="face" data-card-id="a"><span id="art"></span></div><div class="banner" id="banner"><span>State</span></div><div class="badge"></div>';
  document.body.append(source);
  const verbs = createVerbs<EffectCtx>();
  const layer = registerEffects(verbs, { resolve: () => source });
  const end = vi.fn<(run: Parameters<typeof layer.end>[0]) => void>((run) => layer.end(run));
  const player = createMotionPlayer({ specs: {}, stages: { default: () => undefined }, verbs, context: layer, speed: () => speed, onBeatEnd: end });
  player.play({ id: 'sample', actors: [{ id: 'a', at: [0, 0], w: 80, h: 100 }], steps: [{ ...step, actor: 'a', t: 0, dur } as Step] });
  vi.advanceTimersByTime(1);
  return { layer, player, source, end };
}

it.each([false, true])('refresh removes its filtered copy, sweep and banner (skip=%s)', (skip) => {
  const { layer, player, source, end } = play({ do: 'refresh', banner: '.banner', face: '.face', liftMs: 560, drainMs: 480, textShadow: ['none', '0 1px 2px'] }, 620, 2);
  const actor = layer.el.firstElementChild;
  expect(actor?.querySelector('.banner')).not.toBeNull();
  expect(animate).toHaveBeenCalledTimes(4);
  const lift = actor?.querySelector<HTMLElement>('[aria-hidden] .banner')?.parentElement;
  expect(lift?.style.overflow).toBe('hidden');
  expect(lift?.style.borderRadius).toBe('6px');
  expect(animate.mock.calls[0]?.[0]).toMatchObject([{ overflow: 'visible' }, {}, {}]);
  expect(animate.mock.calls[0]?.[1]).toMatchObject({ duration: 1120, delay: 0 });
  expect(animate.mock.calls[2]?.[1]).toMatchObject({ duration: 960, delay: 280 });
  const grey = actor?.querySelector<HTMLElement>('[aria-hidden] .face');
  const sweep = actor?.querySelector<HTMLElement>('[aria-hidden] > div:last-child');
  expect(grey?.style.filter).toBe('grayscale(1)');
  expect(grey?.parentElement?.style.borderRadius).toBe('6px');
  expect(sweep?.style.background).toBe('rgb(224, 224, 224)');
  expect(actor?.querySelector('[aria-hidden] :is([id], [data-card-id], .badge)')).toBeNull();
  if (skip) player.skipAll();
  else vi.advanceTimersByTime(1240);
  expect(cancel).toHaveBeenCalledTimes(4);
  expect(grey?.isConnected).toBe(false);
  expect(sweep?.isConnected).toBe(false);
  expect(actor?.querySelector('.banner')).toBeNull();
  expect(actor?.querySelectorAll('.face, .badge')).toHaveLength(2);
  expect((actor as HTMLElement).style.overflow).toBe('clip');
  expect(source.querySelector('.banner')).not.toBeNull();
  expect(layer.el.childElementCount).toBe(0);
  expect(end).toHaveBeenCalledTimes(1);
});

it('starts draining immediately without a banner', () => {
  const { end } = play({ do: 'refresh', banner: '.missing', drainMs: 480 }, 480);
  expect(animate).toHaveBeenCalledTimes(2);
  expect(animate.mock.calls[0]?.[1]).toMatchObject({ delay: 0, duration: 480 });
  expect(end).not.toHaveBeenCalled();
  vi.advanceTimersByTime(480);
  expect(end).toHaveBeenCalledTimes(1);
});

it.each(['pulse', 'bob', 'breathe', 'orbit'])('%s stops on beat end and skip', (name) => {
  const ellipse = vi.fn();
  const ctx = {
    setTransform: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), ellipse,
    stroke: vi.fn(), translate: vi.fn(), rotate: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  vi.stubGlobal('CanvasRenderingContext2D', function () {});
  const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  try {
    for (const skip of [false, true]) {
      cancel.mockClear();
      const step = name === 'pulse' ? { do: 'pulse', period: 200 } : { do: 'idle', kind: name, period: 200 };
      const { player, layer } = play(step, 800, 2);
      const actor = layer.el.firstElementChild;
      expect(animate.mock.lastCall?.[1]).toMatchObject({ duration: 400, iterations: Infinity });
      expect(actor?.querySelectorAll('canvas').length).toBe(name === 'orbit' ? 1 : 0);
      if (name === 'orbit') expect(ellipse).toHaveBeenCalled();
      if (skip) player.skipAll();
      else vi.advanceTimersByTime(1600);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(actor?.querySelector('canvas')).toBeNull();
      expect(layer.el.childElementCount).toBe(0);
    }
  } finally {
    context.mockRestore();
  }
});

it('pops stars and repeats a crackle on a decorative copy', () => {
  const ctx = {
    setTransform: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(),
    ellipse: vi.fn(), stroke: vi.fn(), translate: vi.fn(), rotate: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    closePath: vi.fn(), fill: vi.fn(),
  };
  vi.stubGlobal('CanvasRenderingContext2D', function () {});
  const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  try {
    const { player, layer } = play({
      do: 'idle', kind: 'orbit', orbit: {
        copySaturation: 0.8, jitter: 0.8, popMs: 260, trackWidth: 0,
        crackle: { period: 1700, at: 600, duration: 140 },
      },
    }, 4000);
    const twin = layer.el.querySelector<HTMLElement>('div[aria-hidden="true"]');
    expect(twin?.style.filter).toBe('brightness(1) saturate(0.8)');
    expect(ctx.fill).not.toHaveBeenCalled();
    for (const time of [650, 2350]) {
      clock.currentTime = time;
      ctx.stroke.mockClear();
      vi.advanceTimersByTime(20);
      expect(ctx.stroke.mock.calls.length).toBeGreaterThan(4);
      expect(ctx.fill).toHaveBeenCalled();
      expect(twin?.style.translate).toMatch(/px$/);
    }
    clock.currentTime = 2500;
    vi.advanceTimersByTime(20);
    expect(twin?.style.translate).toBe('');
    player.skipAll();
    expect(twin?.parentElement).toBeNull();
  } finally {
    context.mockRestore();
  }
});

it('keeps the still state in reduced motion and instant beats', () => {
  vi.mocked(matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
  const el = document.createElement('div');
  startPulse(el);
  startIdle(el, { kind: 'orbit' });
  play({ do: 'refresh' }, 800, 'instant');
  expect(animate).not.toHaveBeenCalled();
  expect(el.childElementCount).toBe(0);
});

it('lets the game stop a live loop, preserving its still style', () => {
  const el = document.createElement('div');
  el.style.opacity = '0.8';
  const controller = new AbortController();
  const stop = startPulse(el, { frames: [{}, { opacity: 0.4 }, {}] }, { signal: controller.signal });
  controller.abort();
  stop();
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(el.style.opacity).toBe('0.8');
});

it.each([false, true])('sheen sweeps and removes its overlay (loop=%s)', (loop) => {
  const { player, layer } = play({
    do: 'sheen', angle: 110, bandWidth: 45, colour: 'white', stops: [25, 75],
    travel: [-120, 260], sweep: [.65, .95], loop, period: 200,
  }, 800, 2);
  const clip = layer.el.querySelector('[aria-hidden]');
  const band = clip?.querySelector<HTMLElement>(':scope > div > div');
  expect(band?.style.backgroundImage).toBe('linear-gradient(90deg, transparent 25%, white 50%, transparent 75%)');
  expect(band?.parentElement?.style.rotate).toBe('20deg');
  expect(animate.mock.lastCall).toMatchObject([
    [
      { transform: 'translateX(-120%)', offset: 0 },
      { transform: 'translateX(-120%)', offset: .65 },
      { transform: 'translateX(260%)', offset: .95 },
      { transform: 'translateX(260%)', offset: 1 },
    ],
    { duration: loop ? 400 : 1600, iterations: loop ? Infinity : 1 },
  ]);
  if (loop) player.hurry();
  else player.skipAll();
  expect(cancel).toHaveBeenCalledOnce();
  expect(clip?.parentElement).toBeNull();
  expect(layer.el.childElementCount).toBe(0);
});

it('sheen removes its overlay when animation setup throws', () => {
  animate.mockImplementationOnce(() => { throw new Error('animation failed'); });
  const { layer, player } = play({ do: 'sheen' });
  expect(layer.el.querySelector('[aria-hidden]')).toBeNull();
  player.skipAll();
  expect(layer.el.childElementCount).toBe(0);
});

it('drift travels to its translated and scaled pose and returns', () => {
  const { layer, player, source } = play({ do: 'idle', kind: 'drift', drift: { x: 8, y: -5, scale: 1.012 }, period: 48000 });
  expect(animate.mock.lastCall).toEqual([
    [{ easing: 'ease-in-out' }, { easing: 'ease-in-out', translate: '8px -5px', scale: '1.012' }, { easing: 'ease-in-out' }],
    { duration: 48000, iterations: Infinity },
  ]);
  player.skipAll();
  expect(cancel).toHaveBeenCalledOnce();
  expect(layer.el.childElementCount).toBe(0);
  expect(source.style.transform).toBe('');
});

it.each([{ do: 'sheen' }, { do: 'idle', kind: 'drift' }, { do: 'slash' }])('%o stays at rest at speed zero', (step) => {
  const requestFrame = vi.fn();
  vi.stubGlobal('requestAnimationFrame', requestFrame);
  const { layer, source } = play(step, 800, 0);
  expect(animate).not.toHaveBeenCalled();
  expect(requestFrame).not.toHaveBeenCalled();
  expect(layer.el.querySelector('canvas')).toBeNull();
  expect(layer.el.childElementCount).toBe(0);
  expect(source.style.transform).toBe('');
});

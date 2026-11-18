// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMotionPlayer, createVerbs, type Step } from '../motion-frame/index.ts';
import { registerEffects, type EffectCtx } from './index.ts';

const cancel = vi.fn();
const animate = vi.fn<HTMLElement['animate']>().mockReturnValue({ cancel, currentTime: 0 } as unknown as Animation);
const actors = [{ id: 'a', at: [100, 50], w: 80, h: 40 }] as const;

function play(step: Step) {
  const verbs = createVerbs<EffectCtx>();
  const layer = registerEffects(verbs);
  const end = vi.fn((run: Parameters<typeof layer.end>[0]) => {
    layer.end(run);
  });
  const player = createMotionPlayer({
    specs: {}, stages: { default: () => undefined }, verbs, context: layer, speed: () => 1,
    onBeatStart: (run) => layer.start(run, actors), onBeatEnd: end,
  });
  player.play({ id: 'signal', actors, steps: [step, { actor: 'a', t: 900, dur: 100, do: 'move', to: [0, 0] }] });
  vi.advanceTimersByTime(0);
  return { layer, player, end, actor: layer.el.firstElementChild as HTMLElement };
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  document.body.replaceChildren();
});

it('stamps text with its tilt and keeps the settled mark until the beat ends', () => {
  const { actor, player, layer } = play({ actor: 'a', t: 0, dur: 300, do: 'stamp', text: '<ready>', tilt: -8, ms: 200 });
  const tag = actor.firstElementChild as HTMLElement;
  expect(tag.textContent).toBe('<ready>');
  expect(animate.mock.calls[0]?.[1]).toMatchObject({ duration: 200, easing: 'ease-in' });
  vi.advanceTimersByTime(300);
  expect(tag.style.transform).toBe('rotate(-8deg) scale(1)');
  expect(tag.style.opacity).toBe('1');
  player.skipAll();
  expect(layer.el.children).toHaveLength(0);
});

it('dissolves into seeded motes and clears every part on skip', () => {
  const { layer, actor, player } = play({ actor: 'a', t: 0, dur: 540, do: 'motes', count: 3, colour: ['#ddd', '#acf'], ms: 400,
    size: 4, sizeJitter: [1, 0], lifeJitter: [1, 0], riseFactor: [1, 0], rise: 20, spread: 0,
    ease: 'linear', startTransform: 'none', endScale: .5, peakOffset: .25, dissolve: [{ opacity: 1 }, { opacity: 0 }] });
  expect(layer.el.children).toHaveLength(4);
  const dots = Array.from(layer.el.children).slice(1) as HTMLElement[];
  expect(new Set(dots.map((dot) => dot.style.backgroundColor))).toEqual(new Set(['rgb(221, 221, 221)', 'rgb(170, 204, 255)']));
  expect(dots[0]?.style.width).toBe('4px');
  expect(animate.mock.calls[0]).toEqual([[
    { opacity: 0, transform: 'none' }, { opacity: 1, offset: .25 },
    { opacity: 0, transform: 'translate(0px, -20px) scale(0.5)' },
  ], expect.objectContaining({ duration: 400, easing: 'linear', fill: 'both' })]);
  player.skipAll();
  expect(actor.style.opacity).toBe('0');
  expect(layer.el.children).toHaveLength(0);
  expect(cancel).toHaveBeenCalledTimes(4);
});

it('loops the requested number of flickers per cycle and clears the overlay on skip', () => {
  const { actor, player } = play({ actor: 'a', t: 0, dur: 800, do: 'flicker', times: 3, loop: true, period: 200 });
  expect(actor.children).toHaveLength(1);
  expect(animate).toHaveBeenCalledWith([0, 1, 0, 1, 0, 1, 0].map((opacity) => ({ opacity })),
    expect.objectContaining({ iterations: Infinity, duration: 200 }));
  player.skipAll();
  expect(actor.children).toHaveLength(0);
  expect(cancel).toHaveBeenCalledOnce();
});

it.each([false, true])('settles bar-fill at its requested value when skipped=%s', (skip) => {
  const { actor, player } = play({ actor: 'a', t: 0, dur: 500, do: 'bar-fill', from: .2, to: .7, colour: 'silver' });
  expect(animate).toHaveBeenCalledWith([{ width: '20%' }, { width: '70%' }], expect.objectContaining({ duration: 500 }));
  if (skip) player.skipAll();
  else vi.advanceTimersByTime(500);
  expect((actor.firstElementChild as HTMLElement).style.width).toBe('70%');
  expect(cancel).toHaveBeenCalledOnce();
  player.skipAll();
});

it('settles a numbered pin at the destination on skip', () => {
  const { actor, player } = play({ actor: 'a', t: 0, dur: 500, do: 'bar-fill', from: 3, to: 2, pin: { delta: [50, 12] } });
  expect(actor.textContent).toBe('3');
  player.skipAll();
  expect(actor.textContent).toBe('2');
  expect(actor.style.translate).toBe('50px 12px');
  expect(cancel).toHaveBeenCalledOnce();
});

it('flickers a grey filter on the actor with the supplied frame levels and offsets', () => {
  const frames = [{ opacity: 0 }, { opacity: .8, offset: .4 }, { opacity: 0 }];
  const { player } = play({ actor: 'a', t: 0, dur: 600, do: 'flicker', frames, grey: { brightness: .75 }, ease: 'ease-in' });
  expect(animate.mock.calls[0]).toEqual([frames, expect.objectContaining({ easing: 'ease-in' })]);
  expect(animate.mock.calls[1]?.[0]).toEqual([
    { filter: 'grayscale(0) brightness(1)' },
    { filter: 'grayscale(0.8) brightness(0.8)', offset: .4 },
    { filter: 'grayscale(0) brightness(1)' },
  ]);
  player.skipAll();
});

it('uses the press and ring frames and gives each accent its own timing', () => {
  const press = [{ transform: 'scale(1)' }, { transform: 'scale(.97)', offset: .45 }, { transform: 'scale(1)' }];
  const ring = [{ transform: 'scale(.7)', opacity: .95, easing: 'ease-out' }, { transform: 'scale(1.9)', opacity: 0 }];
  const { player, actor } = play({ actor: 'a', t: 0, dur: 500, do: 'stamp', scales: [2, .9, 1], pressOffset: .6,
    style: { left: '12%', color: 'red' },
    press: { ms: 120, delay: 100, frames: press, ease: 'ease-in' },
    ring: { ms: 200, delay: 140, frames: ring, style: { border: '1px solid white' } },
  });
  expect(animate.mock.calls[0]?.[0]).toEqual([
    { transform: 'rotate(0deg) scale(2)', opacity: 0 },
    { transform: 'rotate(0deg) scale(0.9)', opacity: 1, offset: .6 },
    { transform: 'rotate(0deg) scale(1)', opacity: 1 },
  ]);
  expect(animate.mock.calls[1]).toEqual([press, expect.objectContaining({ delay: 100, duration: 120, easing: 'ease-in', composite: 'add' })]);
  expect(animate.mock.calls[2]).toEqual([ring, expect.objectContaining({ delay: 140, duration: 200, composite: 'replace' })]);
  expect((actor.firstElementChild as HTMLElement).style.left).toBe('12%');
  expect((actor.lastElementChild as HTMLElement).style.color).toBe('red');
  player.skipAll();
});

it('samples the buzz filter and jitter through its active window', () => {
  const { player } = play({ actor: 'a', t: 0, dur: 200, do: 'flicker',
    buzz: { window: [0, 200], sampleMs: 100, peak: .5, brightness: [.5, 2], noiseMs: 50, threshold: -2, saturation: .8, hue: 30, jitter: [5, 3] },
  });
  const neutral = { filter: 'brightness(1) saturate(0.8) hue-rotate(0deg)', transform: 'translate(0px,0px)' };
  const keys = animate.mock.calls[0]?.[0] as Keyframe[];
  expect(keys).toHaveLength(3);
  expect(keys[0]).toEqual(neutral);
  expect(keys[1]?.filter).toBe('brightness(2) saturate(0.8) hue-rotate(30deg)');
  expect(keys[1]?.transform).toMatch(/^translate\(-?[1-9][\d.]*px,-?[\d.]+px\)$/);
  expect(keys[2]).toEqual(neutral);
  player.skipAll();
});

it('uses the requested scale, offsets and easing for the marker hop', () => {
  const query = vi.spyOn(HTMLElement.prototype, 'querySelector').mockReturnValue(document.createElement('i'));
  try {
    const { player } = play({ actor: 'a', t: 0, dur: 500, do: 'bar-fill', property: '--v', ease: 'linear',
      marker: { selector: 'i', base: 'translateX(0px)', lift: 8, scales: [1, 1.2, .8, 1], offsets: [.3, .7], ease: 'ease-in' },
    });
    expect(animate.mock.calls[0]?.[1]).toMatchObject({ easing: 'linear' });
    expect(animate.mock.calls[1]).toEqual([[
      { transform: 'translateX(0px) translateY(0px) scale(1)' },
      { transform: 'translateX(0px) translateY(-8px) scale(1.2)', offset: .3 },
      { transform: 'translateX(0px) translateY(0px) scale(0.8)', offset: .7 },
      { transform: 'translateX(0px) translateY(0px) scale(1)' },
    ], expect.objectContaining({ easing: 'ease-in' })]);
    player.skipAll();
  } finally {
    query.mockRestore();
  }
});

it('draws the pip sweep from the sampled timeline', () => {
  const ctx = {
    setTransform: vi.fn(), clearRect: vi.fn(), save: vi.fn(), beginPath: vi.fn(),
    roundRect: vi.fn(), clip: vi.fn(), fillRect: vi.fn(), restore: vi.fn(),
  };
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  animate.mockReturnValueOnce({ cancel, currentTime: 100 } as unknown as Animation);
  try {
    const { player } = play({ actor: 'a', t: 0, dur: 500, do: 'bar-fill', from: 0, to: 2,
      pips: { boxes: [[0, 0, 20, 5], [25, 0, 20, 5]], sweep: 200, gap: 100, empty: 'black' },
    });
    expect(ctx.fillRect.mock.calls).toEqual([[0, 0, 20, 5], [0, 0, 17.5, 5], [25, 0, 20, 5]]);
    player.skipAll();
    expect(ctx.fillRect).toHaveBeenLastCalledWith(25, 0, 20, 5);
  } finally {
    getContext.mockRestore();
  }
});

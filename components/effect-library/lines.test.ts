// @vitest-environment jsdom
import { afterEach, expect, it, onTestFinished, vi } from 'vitest';
import { createMotionPlayer, createVerbs, withReducedMotion, type Step } from '../motion-frame/index.ts';
import { registerEffects, type EffectCtx } from './index.ts';

function play(step: Partial<Step> & Pick<Step, 'do'>, reduced = false, live = true) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  const source = document.createElement('div');
  source.textContent = 'One two three';
  const dest = document.createElement('div');
  document.body.append(source, dest);
  vi.spyOn(source, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 20, 20));
  const destRect = vi.spyOn(dest, 'getBoundingClientRect').mockReturnValue(new DOMRect(90, 20, 20, 20));
  const verbs = createVerbs<EffectCtx>();
  const layer = registerEffects(verbs, live ? { resolve: (id) => id === 'a' ? source : dest } : undefined);
  const animate = vi.fn<HTMLElement['animate']>().mockReturnValue({ cancel: vi.fn() } as unknown as Animation);
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
  onTestFinished(() => {
    if (original) Object.defineProperty(HTMLElement.prototype, 'animate', original);
    else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  });
  const done = vi.fn();
  const player = createMotionPlayer({
    specs: {}, stages: { default: (id) => id === 'a' ? [10, 20, 20, 20] : [90, 20, 20, 20] },
    verbs, context: layer, speed: () => withReducedMotion(1, reduced), onBeatEnd: (run) => layer.end(run),
  });
  player.play({ id: 'lines', steps: [{ t: 0, dur: 1000, actor: 'a', ...step }] }, { onEnded: done });
  vi.advanceTimersByTime(20);
  return { layer, player, destRect, source, done, animate };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function mockHighlights() {
  const highlights = new Map<string, Range>();
  vi.stubGlobal('CSS', { highlights });
  vi.stubGlobal('Highlight', class {
    constructor(range: Range) {
      return range;
    }
  });
  return highlights;
}

it.each([
  ['word', 'skip', ' two three', ' three'],
  ['letter', 'finish', 'ne two three', 'e two three'],
] as const)('reveals by %s with a stable text node and cleans up on %s', (unit, end, first, second) => {
  const highlights = mockHighlights();
  const { layer, player } = play({ do: 'text', text: 'One two three', typewriter: { unit, pace: 100 } });
  const clone = layer.el.firstElementChild;
  const unread = [...highlights.values()][0];
  const node = clone?.firstChild;
  expect(unread?.toString()).toBe('One two three');
  vi.advanceTimersByTime(100);
  expect(unread?.toString()).toBe(first);
  vi.advanceTimersByTime(100);
  expect(unread?.toString()).toBe(second);
  expect(clone?.firstChild).toBe(node);
  if (end === 'skip') player.skipAll();
  else vi.advanceTimersByTime(850);
  expect(clone?.textContent).toBe('One two three');
  expect(highlights.size).toBe(0);
  expect(layer.el.children).toHaveLength(0);
  expect(document.head.querySelector('style')).toBeNull();
});

it('uses narration progress and resumes the timed pace when progress is undefined', () => {
  const highlights = mockHighlights();
  const progress = vi.fn<() => number | undefined>().mockReturnValue(0.4);
  const { player } = play({ do: 'text', text: 'One two three', typewriter: { progress, pace: 100 } });
  expect([...highlights.values()][0]?.toString()).toBe(' three');
  progress.mockReturnValue(undefined);
  vi.advanceTimersByTime(320);
  expect(highlights.size).toBe(0);
  player.skipAll();
});

it('fits the default word reveal to dur', () => {
  const highlights = mockHighlights();
  const { player } = play({ do: 'text', text: 'One two three', typewriter: true, dur: 500 });
  const unread = [...highlights.values()][0];
  vi.advanceTimersByTime(45);
  expect(unread?.toString()).toBe(' two three');
  vi.advanceTimersByTime(250);
  expect(unread?.toString()).toBe(' three');
  player.skipAll();
});

it('shows all typewriter text without CSS highlights and preserves centring and rise', () => {
  vi.stubGlobal('CSS', undefined);
  const { layer, player, animate } = play({ do: 'text', typewriter: true, text: 'One two three' });
  const clone = layer.el.querySelector<HTMLElement>('.fx-actor');
  expect([clone?.textContent, clone?.style.opacity, clone?.style.textAlign]).toEqual(['One two three', '1', 'center']);
  expect(animate.mock.lastCall?.[0]).toEqual([{ transform: 'translateY(var(--fx-text-rise,12px))' }, { transform: 'none' }]);
  expect(document.head.querySelector('style')).toBeNull();
  player.skipAll();
});

it('keeps inherited alignment and omits rise when requested', () => {
  const { layer, player, animate } = play({ do: 'text', typewriter: { textAlign: 'inherit', rise: false } });
  expect(layer.el.querySelector<HTMLElement>('.fx-actor')?.style.textAlign).toBe('inherit');
  expect(animate).not.toHaveBeenCalled();
  player.skipAll();
});

it('preserves plain text centring and rise', () => {
  const { layer, player, animate } = play({ do: 'text', text: '+3' });
  expect(layer.el.querySelector<HTMLElement>('.fx-actor')?.style.textAlign).toBe('center');
  expect(animate.mock.lastCall?.[0]).toEqual([
    { opacity: 0, transform: 'translateY(var(--fx-text-rise,12px))' },
    { opacity: 1, offset: 0.25 }, { opacity: 1, transform: 'none' },
  ]);
  player.skipAll();
});

it('draws the dash line from stage rects without a resolver', () => {
  const { layer, player } = play({ do: 'dash-line', to: 'b' }, false, false);
  expect(layer.el.querySelector('path')?.getAttribute('d')).toBe('M 30.0 30.0 L 90.0 30.0');
  player.skipAll();
});

it.each([false, true])('hides inside the target only when requested (%s)', (hideInsideTarget) => {
  const { layer, player, destRect } = play({ do: 'dash-line', to: 'b', hideInsideTarget });
  destRect.mockReturnValue(new DOMRect(15, 15, 50, 50));
  vi.advanceTimersByTime(20);
  expect(layer.el.querySelector('path')?.hasAttribute('d')).toBe(!hideInsideTarget);
  player.skipAll();
});

it.each(['skip', 'finish'])('follows the live endpoints and stops marching on %s', (end) => {
  const { layer, player, destRect } = play({ do: 'dash-line', to: 'b', dash: 9, gap: 6, speed: 20 });
  const path = layer.el.querySelector('path');
  expect(path?.getAttribute('d')).toBe('M 30.0 30.0 L 90.0 30.0');
  expect(path?.getAttribute('stroke-dasharray')).toBe('9 6');
  const phase = path?.getAttribute('stroke-dashoffset');
  destRect.mockReturnValue(new DOMRect(110, 20, 20, 20));
  vi.advanceTimersByTime(100);
  expect(path?.getAttribute('d')).toBe('M 30.0 30.0 L 110.0 30.0');
  expect(path?.getAttribute('stroke-dashoffset')).not.toBe(phase);
  if (end === 'skip') player.skipAll();
  else vi.advanceTimersByTime(1000);
  expect(layer.el.children).toHaveLength(0);
});

function mockCanvas() {
  const ctx = {
    clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    translate: vi.fn(), scale: vi.fn(), rotate: vi.fn(), fillRect: vi.fn(), globalAlpha: 1,
  };
  vi.stubGlobal('CanvasRenderingContext2D', class {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  return ctx;
}

it.each(['skip', 'finish'])('closes and fades the four brackets before cleanup on %s', (end) => {
  const ctx = mockCanvas();
  const { layer, player } = play({ do: 'reticle', closeMs: 200, fade: [500, 650] });
  vi.advanceTimersByTime(200);
  expect(ctx.moveTo.mock.calls.slice(-4)).toEqual([[20, 14], [20, 46], [20, 14], [20, 46]]);
  vi.advanceTimersByTime(480);
  const strokes = ctx.stroke.mock.calls.length;
  if (end === 'skip') player.skipAll();
  vi.advanceTimersByTime(400);
  expect(ctx.stroke).toHaveBeenCalledTimes(strokes);
  expect(layer.el.children).toHaveLength(0);
});

it.each(['skip', 'finish'])('drops, rotates and fades debris before cleanup on %s', (end) => {
  const ctx = mockCanvas();
  const opacity = vi.fn<(alpha: number) => void>();
  const { layer, player } = play({
    do: 'debris', pieces: [{ travel: [0, 0], spin: 90, paint: () => opacity(ctx.globalAlpha) }],
    gravity: 100, ms: 800, fade: [400, 800],
  });
  vi.advanceTimersByTime(550);
  expect(ctx.translate.mock.lastCall?.[1]).toBeGreaterThan(30);
  expect(ctx.rotate.mock.lastCall?.[0]).toBeGreaterThan(0);
  expect(opacity.mock.lastCall?.[0]).toBeLessThan(1);
  if (end === 'skip') player.skipAll();
  else vi.advanceTimersByTime(450);
  expect(layer.el.children).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
});

it('holds the initial debris pose through the delay and eases the fall at full opacity', () => {
  const ctx = mockCanvas();
  const { player } = play({
    do: 'debris', backwards: true, delay: 600, ms: 4500, dur: 5200, fade: false, gravity: 0,
    easeMotion: (p: number) => p * p,
    pieces: [{ offset: [-14, -10], travel: [0, 0], spin: -28, scale: [1, 0.55] }],
  });
  expect(ctx.translate.mock.lastCall).toEqual([6, 20]);
  expect(ctx.rotate.mock.lastCall?.[0]).toBe(-0);
  expect(ctx.scale.mock.lastCall).toEqual([1, 1]);
  vi.advanceTimersByTime(2830);
  expect(ctx.translate.mock.lastCall?.[0]).toBeCloseTo(9.5, 1);
  expect(ctx.rotate.mock.lastCall?.[0]).toBeCloseTo(-7 * Math.PI / 180, 3);
  vi.advanceTimersByTime(2290);
  expect(ctx.translate.mock.lastCall).toEqual([20, 30]);
  expect(ctx.scale.mock.lastCall).toEqual([0.55, 0.55]);
  expect(ctx.globalAlpha).toBe(1);
  player.skipAll();
});

it.each(['text', 'dash-line', 'reticle', 'debris'])('keeps the live end state under reduced motion for %s', (verb) => {
  const { layer, source, done } = play({ do: verb, to: 'b', typewriter: true }, true);
  expect(layer.el.children).toHaveLength(0);
  expect(source.textContent).toBe('One two three');
  expect(done).toHaveBeenCalledWith('done');
});

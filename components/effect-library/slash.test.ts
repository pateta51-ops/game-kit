import { afterEach, expect, it, vi } from 'vitest';
import { createMotionPlayer, createVerbs } from '../motion-frame/index.ts';
import type { CanvasFx } from './canvas.ts';
import { registerEffects } from './effects.ts';
import { fakeDom } from './fake/dom.ts';
import type { EffectLayer } from './layer.ts';
import { slash } from './slash.ts';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('grows, staggers and fades the two passes of each stroke', () => {
  const moveTo = vi.fn();
  const lineTo = vi.fn();
  const styles: string[] = [];
  const canvas = {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo, lineTo,
    strokeStyle: '', stroke(): void { styles.push(canvas.strokeStyle); },
  };
  const ctx = canvas as unknown as CanvasRenderingContext2D;
  const fx = { call: { to: [10, 20, 100, 80], step: { count: 2, angle: 0, spacing: .2, length: .6, stagger: 80 } } } as unknown as CanvasFx;
  slash(ctx, 0, fx);
  expect(lineTo).not.toHaveBeenCalled();
  slash(ctx, 50, fx);
  expect(moveTo.mock.calls).toEqual([[20, 60]]);
  expect(lineTo.mock.calls).toEqual([[72.5, 60]]);
  slash(ctx, 190, fx);
  expect(lineTo.mock.calls.slice(1)).toEqual([[80, 60], [100, 60]]);
  expect(styles).toContain('rgba(255,255,255,0.16)');
  slash(ctx, 340, fx);
  expect(lineTo).toHaveBeenCalledTimes(3);
});

it.each(['skipAll', 'hurry', 'draw error'] as const)('removes the slash canvas on %s', (stop) => {
  vi.useFakeTimers();
  const dom = fakeDom();
  const verbs = createVerbs<EffectLayer>();
  const layer = registerEffects(verbs);
  const player = createMotionPlayer({
    specs: {}, stages: { default: () => undefined }, verbs, context: layer, speed: () => 1,
    onBeatEnd: (run) => layer.end(run),
  });
  player.play({ id: 'slash-test', actors: [{ id: 'a', at: [0, 0], w: 100, h: 100 }], steps: [{ do: 'slash', actor: 'a', t: 0, dur: 340 }] });
  vi.advanceTimersByTime(1);
  expect(dom.waiting()).toBe(1);
  if (stop === 'draw error') {
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      dom.step();
      expect(report).toHaveBeenCalledOnce();
    } finally {
      report.mockRestore();
    }
  } else {
    player[stop]();
  }
  expect(dom.waiting()).toBe(0);
  expect(dom.body.children[0]?.children).toHaveLength(0);
  player.skipAll();
});

// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { buildTimeline, createMotionPlayer, createVerbs, type MotionSpec, type Run } from '../motion-frame/index.ts';
import { registerEffects, type EffectActor, type EffectCtx } from './index.ts';
import { seventhInning as preset } from './presets/seventh-inning.ts';

const stage = () => undefined;
const actor = { id: 'a', at: [0, 0], w: 20, h: 20 } as const;
const b = { ...actor, id: 'b' };
const cancel = vi.fn();
const animate = vi.fn<HTMLElement['animate']>().mockReturnValue({ cancel } as unknown as Animation);
function setup(spec: MotionSpec) {
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
  const verbs = createVerbs<EffectCtx>();
  const context = registerEffects(verbs, { resolve: (id) => document.getElementById(id) ?? undefined });
  const run: Run<EffectCtx> = { id: 1, context, timeline: buildTimeline(spec, stage) };
  return {
    run, context, verbs,
    play: (index = 0) => {
      const call = run.timeline.calls[index]!;
      return verbs.get(call.verb)?.(call, run);
    },
  };
}
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  document.body.replaceChildren();
});

it('ports the arc path, staggers simultaneous flights and settles on finish', () => {
  const { play, context } = setup({ id: 'arc', actors: [actor, b], steps: ['a', 'b'].map((id) => ({
    actor: id, do: 'arc-move', t: 0, dur: 500, to: [100, -50], ...preset.arcMove, arcHeight: 4, stagger: 40,
  })) });
  play();
  const finish = play(1);
  expect(animate).toHaveBeenLastCalledWith([
    { translate: '0 0' }, { translate: '40px -39px', offset: 0.55 }, { translate: '100px -50px' },
  ], expect.objectContaining({ easing: 'ease-out', delay: 40, duration: 460 }));
  finish?.();
  expect(context.el.lastElementChild?.getAttribute('style')).toContain('left: 90px');
  expect(cancel).toHaveBeenCalledOnce();
});

it('holds the coloured shadow and keeps the legacy glow pulse by default', () => {
  const { play } = setup({ id: 'glow', actors: [actor], steps: [
    { actor: 'a', do: 'glow', t: 0, dur: 500 },
    { actor: 'a', do: 'glow', t: 500, dur: 500, ...preset.glow },
  ] });
  play()?.();
  expect(animate.mock.calls[0]?.[0]).toEqual([
    { boxShadow: 'var(--fx-glow-off,0 0 0 0)' }, { boxShadow: 'var(--fx-glow,0 0 24px 6px)' },
    { boxShadow: 'var(--fx-glow-off,0 0 0 0)' },
  ]);
  play(1)?.();
  const [, rise, fall] = animate.mock.calls[1]?.[0] as Keyframe[];
  expect(rise?.offset).toBeCloseTo(0.15);
  expect(fall?.offset).toBeCloseTo(0.85);
  expect(rise?.boxShadow).toBe(preset.glow.shadows.map((s) => `${s} ${preset.glow.colour}`).join(','));
  expect(fall?.boxShadow).toBe(rise?.boxShadow);
});

it('swaps the face immediately with squash disabled', () => {
  const { play, context } = setup({ id: 'flip', actors: [actor], steps: [
    { actor: 'a', do: 'flip', t: 0, dur: 500, ...preset.flip, label: 'on' },
  ] });
  play()?.();
  expect(animate).not.toHaveBeenCalled();
  expect(context.el.firstElementChild?.hasAttribute('data-fx-flipped')).toBe(true);
  expect(context.el.firstElementChild?.getAttribute('data-fx-label')).toBe('on');
});

it.each(['selector', 'actors'])('shakes the selected group by %s and cancels on finish', (mode) => {
  document.body.innerHTML = '<div class="score-grid"><div class="tin-plate"></div><div class="tin-plate"></div></div>';
  const { selector, ...look } = preset.shakeGroup;
  const { play, context } = setup({ id: 'shake', actors: [actor, b], steps: [
    { actor: 'a', do: 'shake-group', t: 0, dur: 500, ...look, ...(mode === 'selector' ? { selector } : { actors: ['a', 'b'] }) },
  ] });
  const finish = play();
  expect(animate.mock.contexts).toEqual(mode === 'selector'
    ? Array.from(document.querySelectorAll('.tin-plate')) : Array.from(context.el.children));
  expect(animate.mock.calls[0]?.[0]).toHaveLength(preset.shakeGroup.frames);
  expect((animate.mock.calls[1]?.[0] as Keyframe[])[1]?.transform).toBe('translate(6px,1px)');
  finish?.();
  expect(cancel).toHaveBeenCalledTimes(2);
});

it.each([preset.unroll, { axis: 'x', origin: 'right' }])('unrolls along $axis from $origin', (settings) => {
  const { play, context } = setup({ id: 'unroll', actors: [{ ...actor, hidden: true }], steps: [
    { actor: 'a', do: 'unroll', t: 0, dur: 500, ...settings },
  ] });
  play()?.();
  expect(animate).toHaveBeenCalledWith([0, 1].map((n) => ({
    transform: `scale${settings.axis.toUpperCase()}(${String(n)})`, transformOrigin: settings.origin,
  })), expect.objectContaining({ easing: 'ease-out' }));
  expect(context.el.querySelector<HTMLElement>('.fx-actor')?.style.visibility).toBe('visible');
});

it.each(['start', 'step'] as const)('hides the source at %s and restores it on skipAll or clear', (hideSource) => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="a" style="visibility: visible !important"></div>';
  const source = document.getElementById('a')!;
  const actors: EffectActor[] = [{ ...actor, hideSource }];
  const spec: MotionSpec = { id: 'hide', actors, steps: [{ actor: 'a', do: 'move', t: 100, dur: 150, to: [40, 50] }] };
  const { context, verbs } = setup(spec);
  const player = createMotionPlayer({
    specs: {}, stages: { default: stage }, verbs, speed: () => 1, context,
    onBeatStart: (run) => context.start(run, actors), onBeatEnd: (run) => context.end(run),
  });
  player.play(spec);
  expect(source.style.visibility).toBe(hideSource === 'start' ? 'hidden' : 'visible');
  expect(animate).not.toHaveBeenCalled();
  vi.advanceTimersByTime(99);
  expect(source.style.visibility).toBe(hideSource === 'start' ? 'hidden' : 'visible');
  vi.advanceTimersByTime(1);
  expect(source.style.visibility).toBe('hidden');
  player.play(spec, { parallel: true });
  expect(context.el.querySelectorAll('.fx-actor')).toHaveLength(2);
  expect(context.el.querySelectorAll<HTMLElement>('.fx-actor')[1]?.style.visibility).toBe('visible');
  vi.advanceTimersByTime(150);
  expect(source.style.visibility).toBe('hidden');
  player.skipAll();
  expect(source.style.visibility).toBe('visible');
  expect(source.style.getPropertyPriority('visibility')).toBe('important');
  player.play(spec);
  context.clear();
  expect(source.style.visibility).toBe('visible');
  vi.advanceTimersByTime(100);
  expect(source.style.visibility).toBe('visible');
  player.skipAll();
});

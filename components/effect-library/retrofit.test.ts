// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { buildTimeline, createMotionPlayer, createVerbs, type MotionSpec, type Run } from '../motion-frame/index.ts';
import { registerEffects, type EffectActor, type EffectCtx } from './index.ts';

const ease = 'cubic-bezier(0.45, 0, 0.25, 1)';

const glideSettings = {
  card: {
    flightMs: 420, ease: 'cubic-bezier(0.3, 0.7, 0.2, 1)', arcHeight: 48, apex: 0.55,
    glide: { anchor: 'destination', liftRatio: 0.12, progress: 0.55, swell: 0.06, relativeSwell: true, round: 1000, opaque: true },
  },
  token: {
    flightMs: 700, ease, stagger: 110, arcHeight: 60,
    glide: { liftRatio: 0.15, swell: 0.15, opaque: true },
  },
  marker: {
    flightMs: 650, ease, arcHeight: 14,
    glide: { anchor: 'destination', swell: 0.15, plainEnds: true },
  },
} as const;

const waypointSettings = {
  rest: [0.4, 0.6],
  ease: 'cubic-bezier(0.45, 0, 0.25, 1)',
  stagger: 70,
  staggerMax: 8,
  staggerUnscaled: true,
} as const;

const settings = {
  arcMove: { bank: 1 / 5, lean: 0.2, apex: 0.55 },
  glow: {
    colour: 'var(--demo-accent)',
    hold: 0.7,
    shadows: ['0 0 0 calc(30px * var(--fx-k,1))', '0 0 calc(120px * var(--fx-k,1)) calc(50px * var(--fx-k,1))'],
  },
  flip: { squash: false },
  shakeGroup: { selector: '.demo-grid .demo-tile', amplitude: 6, crossAmplitude: 1, frames: 9 },
  unroll: { axis: 'y', origin: 'top' },
  hideSource: 'step',
} as const;

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
    actor: id, do: 'arc-move', t: 0, dur: 500, to: [100, -50], ...settings.arcMove, arcHeight: 4, stagger: 40,
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
    { actor: 'a', do: 'glow', t: 500, dur: 500, ...settings.glow },
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
  expect(rise?.boxShadow).toBe(settings.glow.shadows.map((s) => `${s} ${settings.glow.colour}`).join(','));
  expect(fall?.boxShadow).toBe(rise?.boxShadow);
});

it('swaps the face immediately with squash disabled', () => {
  const { play, context } = setup({ id: 'flip', actors: [actor], steps: [
    { actor: 'a', do: 'flip', t: 0, dur: 500, ...settings.flip, label: 'on' },
  ] });
  play()?.();
  expect(animate).not.toHaveBeenCalled();
  expect(context.el.firstElementChild?.hasAttribute('data-fx-flipped')).toBe(true);
  expect(context.el.firstElementChild?.getAttribute('data-fx-label')).toBe('on');
});

it.each(['selector', 'actors'])('shakes the selected group by %s and cancels on finish', (mode) => {
  document.body.innerHTML = '<div class="demo-grid"><div class="demo-tile"></div><div class="demo-tile"></div></div>';
  const { selector, ...look } = settings.shakeGroup;
  const { play, context } = setup({ id: 'shake', actors: [actor, b], steps: [
    { actor: 'a', do: 'shake-group', t: 0, dur: 500, ...look, ...(mode === 'selector' ? { selector } : { actors: ['a', 'b'] }) },
  ] });
  const finish = play();
  expect(animate.mock.contexts).toEqual(mode === 'selector'
    ? Array.from(document.querySelectorAll('.demo-tile')) : Array.from(context.el.children));
  expect(animate.mock.calls[0]?.[0]).toHaveLength(settings.shakeGroup.frames);
  expect((animate.mock.calls[1]?.[0] as Keyframe[])[1]?.transform).toBe('translate(6px,1px)');
  finish?.();
  expect(cancel).toHaveBeenCalledTimes(2);
});

it.each([settings.unroll, { axis: 'x', origin: 'right' }])('unrolls along $axis from $origin', (settings) => {
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

it('preserves the token keyframes, clip and full duration after a scaled stagger', () => {
  const token = glideSettings.token;
  const clipPath = 'polygon(0% 0%, 100% 0%, 50% 100%)';
  const spec: MotionSpec = { id: 'tokens', actors: [actor, b], steps: ['a', 'b'].map((id, i) => ({
    t: 0, actor: id, do: 'arc-move', dur: token.flightMs + i * token.stagger, to: [100, 0], ...token, clipPath,
  })) };
  const { run, play, context } = setup(spec);
  run.timeline = buildTimeline(spec, stage, 2);
  const finish = play(1);
  expect(animate).toHaveBeenCalledWith([
    { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
    { transform: 'translate(50px, -15px) scale(1.15)', opacity: 1, offset: 0.5 },
    { transform: 'translate(100px, 0px) scale(1)', opacity: 1 },
  ], expect.objectContaining({ duration: 1400, delay: 220, easing: token.ease }));
  const clone = context.el.querySelector<HTMLElement>('.fx-actor')!;
  expect(clone.style.clipPath).toBe(clipPath);
  finish?.();
  expect(clone.style.clipPath).toBe('');
});

it('keeps plainEnds on the destination-anchored marker keyframes', () => {
  const { play } = setup({ id: 'glides', actors: [actor, b], steps: [
    { t: 0, actor: 'a', do: 'arc-move', dur: 420, to: [100, 0], landingWidth: 40, ...glideSettings.card },
    { t: 0, actor: 'b', do: 'arc-move', dur: 650, to: [100, 0], ...glideSettings.marker, glide: { ...glideSettings.marker.glide, baseTransform: 'rotate(10deg)' } },
  ] });
  play()?.();
  expect(animate.mock.calls[0]?.[0]).toEqual([
    { transform: 'translate(-100px, 0px) scale(0.5)', opacity: 1 },
    { transform: 'translate(-45px, -12px) scale(0.81)', opacity: 1, offset: 0.55 },
    { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
  ]);
  play(1)?.();
  expect(animate.mock.calls[1]?.[0]).toEqual([
    { transform: 'translate(-100px, 0px) rotate(10deg)' },
    { transform: 'translate(-50px, -14px) scale(1.15) rotate(10deg)', offset: 0.5 },
    { transform: 'translate(0px, 0px) rotate(10deg)' },
  ]);
});

it('holds the card at the via point with easing on each segment and a fixed stagger', () => {
  const flightMs = 1980;
  const spec: MotionSpec = { id: 'via', actors: [actor, b], steps: ['a', 'b'].map((id) => ({
    t: 0, actor: id, do: 'arc-move', dur: flightMs + 2 * waypointSettings.stagger, to: [100, 0],
    ...waypointSettings, flightMs, via: { point: [45, 20], rest: waypointSettings.rest, width: 30 },
  })) };
  const { play, run } = setup(spec);
  run.timeline = buildTimeline(spec, stage, 0.5);
  play(1)?.();
  const easing = waypointSettings.ease;
  expect(animate).toHaveBeenCalledWith([
    { transform: 'translate(-100px, 0px) scale(1)', easing },
    { transform: 'translate(-55px, 20px) scale(1.5)', offset: 0.4, easing },
    { transform: 'translate(-55px, 20px) scale(1.5)', offset: 0.6, easing },
    { transform: 'none' },
  ], expect.objectContaining({ duration: 990, delay: 70, easing: 'linear' }));
});

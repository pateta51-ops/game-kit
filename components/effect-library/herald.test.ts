// @vitest-environment jsdom
// K449: unroll collapse, count, banner, glow to off, cracked stamp.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildTimeline, createMotionPlayer, createVerbs, type Step } from '../motion-frame/index.ts';
import { registerEffects, type EffectCtx } from './index.ts';

const cancel = vi.fn();
const animate = vi.fn<HTMLElement['animate']>().mockReturnValue({ cancel, currentTime: 0 } as unknown as Animation);
const actors = [{ id: 'a', at: [100, 50], w: 80, h: 40 }] as const;

function play(step: Step) {
  const verbs = createVerbs<EffectCtx>();
  const layer = registerEffects(verbs);
  const player = createMotionPlayer({
    specs: {}, stages: { default: () => undefined }, verbs, context: layer, speed: () => 1,
    onBeatStart: (run) => layer.start(run, actors), onBeatEnd: (run) => { layer.end(run); },
  });
  player.play({ id: 'k449', actors, steps: [step, { actor: 'a', t: 900, dur: 100, do: 'move', to: [0, 0] }] });
  vi.advanceTimersByTime(0);
  return { layer, player, actor: layer.el.firstElementChild as HTMLElement };
}
/** runs one verb by hand: `end()` is the call's finish (a skip) */
function direct(step: Partial<Step> & Pick<Step, 'do'>) {
  const verbs = createVerbs<EffectCtx>();
  const context = registerEffects(verbs);
  const timeline = buildTimeline({ id: 'k449', actors: [...actors], steps: [{ t: 0, actor: 'a', dur: 500, ...step }, { t: 500, actor: 'a', dur: 100, do: 'show' }] }, () => undefined);
  const call = timeline.calls[0]!;
  const run = { id: 1, context, timeline };
  const end = verbs.get(call.verb)?.(call, run);
  return { end, el: context.el.firstElementChild as HTMLElement };
}
const frames = (i = 0): Keyframe[] => animate.mock.calls[i]?.[0] as Keyframe[];

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

it('K449 unroll reverse collapses to a lit line and ends invisible', () => {
  const { actor, player } = play({ actor: 'a', t: 0, dur: 500, do: 'unroll', reverse: true, axis: 'y', colour: '#f00', lineMs: 100, gutter: 2 });
  const f = frames();
  expect(f[0]?.transform).toBe('scaleY(1)');
  expect(f[1]?.transform).toBe('scaleY(.012)');
  expect(String(f[1]?.filter)).toContain('#f00');
  expect(f.at(-1)?.opacity).toBe(0);
  player.skipAll();
  expect(cancel).toHaveBeenCalled();
  expect(actor.isConnected).toBe(false);
});

it('K449 unroll reverse: a skip leaves the actor at opacity 0', () => {
  const { end, el } = direct({ do: 'unroll', reverse: true, axis: 'x' });
  end?.();
  expect(el.style.opacity).toBe('0');
});

it('K449 unroll without reverse still unrolls from zero', () => {
  play({ actor: 'a', t: 0, dur: 500, do: 'unroll', axis: 'x' });
  expect(frames()[0]?.transform).toBe('scaleX(0)');
});

it('K449 count starts at `from`', () => {
  const { el } = direct({ do: 'count', from: 10, to: 42, prefix: '+', suffix: ' VP' });
  expect(el.textContent).toBe('+10 VP');
});

it('K449 count: a skip shows the final number', () => {
  const { end, el } = direct({ do: 'count', to: 42, suffix: ' VP' });
  expect(el.textContent).toBe('0 VP');
  end?.();
  expect(el.textContent).toBe('42 VP');
});

it('K449 count with no time (speed 0) ends on the final number', () => {
  const { el } = direct({ do: 'count', to: 9, dur: 0 });
  expect(el.textContent).toBe('9');
});

it('K449 banner unrolls, shows its text and fades out', () => {
  const { actor } = play({ actor: 'a', t: 0, dur: 1000, do: 'banner', text: 'ACT II', unrollMs: 200, fadeMs: 300 });
  const f = frames();
  expect(f[0]?.transform).toBe('scaleX(0)');
  expect(f[1]?.offset).toBeCloseTo(0.2);
  expect(f[2]?.offset).toBeCloseTo(0.7);
  expect(f.at(-1)?.opacity).toBe(0);
  expect(actor.querySelector('[data-fx-part="banner-text"]')?.textContent).toBe('ACT II');
});

it('K449 banner textFrames drive the text opacity and scale', () => {
  play({ actor: 'a', t: 0, dur: 1000, do: 'banner', text: 'X', textFrames: [{ at: 0, opacity: 0, scale: 0.8 }, { at: 500, opacity: 1, scale: 1 }] });
  expect(frames(1)[1]).toMatchObject({ offset: 0.5, opacity: 1, transform: 'scale(1)' });
});

it('K449 banner: a skip ends invisible with its text removed', () => {
  const { end, el } = direct({ do: 'banner', text: 'ACT II', dur: 1000 });
  end?.();
  expect(el.style.opacity).toBe('0');
  expect(el.querySelector('[data-fx-part="banner-text"]')).toBeNull();
});

it('K449 glow to off starts lit and ends dark', () => {
  play({ actor: 'a', t: 0, dur: 500, do: 'glow', end: 'dark', colour: '#9ff' });
  expect(frames()).toHaveLength(2);
  expect(frames()[0]?.boxShadow).toBe('0 0 24px 6px #9ff');
  expect(frames()[1]?.boxShadow).toBe('0 0 0 0 transparent');
});

it('K449 glow to off: a skip leaves it dark', () => {
  const { end, el } = direct({ do: 'glow', end: 'dark', colour: '#9ff' });
  end?.();
  expect(el.style.boxShadow).toContain('transparent');
});

it('K449 glow without `to` is unchanged: dark, lit, dark', () => {
  play({ actor: 'a', t: 0, dur: 500, do: 'glow', colour: '#9ff' });
  expect(frames()).toHaveLength(3);
});

it('K694 glow end dark without start keeps its two frames (as on main)', () => {
  play({ actor: 'a', t: 0, dur: 500, do: 'glow', end: 'dark', colour: '#9ff', hold: 0 });
  expect(frames().map((f) => [f.boxShadow, f.offset])).toEqual([['0 0 24px 6px #9ff', undefined], ['0 0 0 0 transparent', undefined]]);
});

it('K694 glow start dark: dark at 0, peak at the rise point, dark at the end', () => {
  play({ actor: 'a', t: 0, dur: 500, do: 'glow', end: 'dark', start: 'dark', hold: 0, rise: 0.3, colour: '#9ff' });
  expect(frames().map((f) => [f.boxShadow, f.offset])).toEqual([['0 0 0 0 transparent', 0], ['0 0 24px 6px #9ff', 0.3], ['0 0 0 0 transparent', 1]]);
});

it('K694 glow start dark: default peak in the middle, hold is a plateau around it', () => {
  play({ actor: 'a', t: 0, dur: 500, do: 'glow', end: 'dark', start: 'dark', hold: 0.2, colour: '#9ff' });
  expect(frames().map((f) => f.offset)).toEqual([0, 0.4, 0.6, 1]);
});

it('K694 glow start dark: a skip leaves it dark', () => {
  const { end, el } = direct({ do: 'glow', end: 'dark', start: 'dark', colour: '#9ff' });
  end?.();
  expect(el.style.boxShadow).toContain('transparent');
});

it('K694 glow start dark: rise and hold clamp to 0..1 at both ends', () => {
  const offs = (o: Partial<Step>) => { animate.mockClear(); play({ actor: 'a', t: 0, dur: 500, do: 'glow', end: 'dark', start: 'dark', colour: '#9ff', ...o }); return frames().map((f) => f.offset); };
  expect(offs({ rise: 0, hold: 0 })).toEqual([0, 0, 1]);
  expect(offs({ rise: 1, hold: 0 })).toEqual([0, 1, 1]);
  expect(offs({ rise: 0, hold: 0.4 })).toEqual([0, 0, 0.2, 1]);
  expect(offs({ rise: 1, hold: 0.4 })).toEqual([0, 0.8, 1, 1]);
  expect(offs({ rise: 0.5, hold: 1 })).toEqual([0, 0, 1, 1]);
});

it('K449 stamp cracked adds a crack overlay that appears at the press and stays', () => {
  const { end, el } = direct({ do: 'stamp', text: 'LOST', cracked: true });
  const crack = el.querySelector<HTMLElement>('[data-fx-part="crack"]');
  expect(crack?.querySelector('path')).not.toBeNull();
  expect(animate.mock.calls.some((c) => (c[0] as Keyframe[]).some((k) => k.offset === 0.8 && k.opacity === 0))).toBe(true);
  end?.();
  expect(crack?.style.opacity).toBe('1');
});

it('K449 stamp without cracked has no crack', () => {
  const { el } = direct({ do: 'stamp', text: 'OK' });
  expect(el.querySelector('[data-fx-part="crack"]')).toBeNull();
});

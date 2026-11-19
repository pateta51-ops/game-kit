// @vitest-environment jsdom
// K435: verb options so games drop their own copies (STCC batches 9-23, Warp batches 13 and 31).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTimeline, createVerbs, type Step } from '../motion-frame/index.ts';
import { playOn, registerEffects, type EffectCtx } from './index.ts';

const animate = vi.fn<HTMLElement['animate']>();
const fakeAnim = (running: boolean) => {
  let resolve = (): void => undefined;
  const finished = new Promise<void>((r) => (resolve = r));
  const a = { cancel: vi.fn(), playState: running ? 'running' : 'finished', finished, effect: { getComputedTiming: () => ({ endTime: 100, localTime: 90 }) } };
  return { a, resolve };
};
function setup(step: Partial<Step> & Pick<Step, 'do'>) {
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  const verbs = createVerbs<EffectCtx>();
  const context = registerEffects(verbs);
  const timeline = buildTimeline({
    id: 'k435', actors: [{ id: 'piece', at: [50, 50], w: 20, h: 40 }],
    steps: [{ t: 0, actor: 'piece', dur: 100, to: [150, 80], ...step }, { t: 100, actor: 'piece', dur: 100, do: 'show' }],
  }, () => undefined);
  const call = timeline.calls[0]!;
  const run = { id: 1, context, timeline };
  const end = verbs.get(call.verb)?.(call, run);
  return { context, end, run };
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  Reflect.deleteProperty(Element.prototype, 'animate');
  document.body.replaceChildren();
});

describe('K435 effect verb options', () => {
  it('K435-0 a step ends on its animations finished, not on the timer while they still run', async () => {
    const f = fakeAnim(true);
    animate.mockReturnValue(f.a as unknown as Animation);
    const { end } = setup({ do: 'fade-in' });
    end?.();
    expect(f.a.cancel).not.toHaveBeenCalled();
    f.resolve();
    await f.a.finished;
    await Promise.resolve();
    expect(f.a.cancel).toHaveBeenCalledTimes(1);
  });
  it('K435-0 the layer ending the run (a skip, the beat end) ends a waiting step at once', () => {
    const f = fakeAnim(true);
    animate.mockReturnValue(f.a as unknown as Animation);
    const { end, context, run } = setup({ do: 'fade-in' });
    end?.();
    context.end(run);
    expect(f.a.cancel).toHaveBeenCalledTimes(1);
  });
  it('K435-1 playOn animates the real element and cancel stops it mid-play', async () => {
    vi.useFakeTimers();
    const f = fakeAnim(true);
    animate.mockReturnValue(f.a as unknown as Animation);
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
    const el = document.createElement('div');
    document.body.append(el);
    const h = playOn(el, [{ t: 0, dur: 400, actor: 'el', do: 'stamp', text: 'Done' }, { t: 0, dur: 400, actor: 'el', do: 'fade-out' }], { kind: 'won' });
    vi.advanceTimersByTime(100);
    expect(animate.mock.contexts).toContain(el);
    expect(el.querySelector('[data-motion-fx="won"]')?.textContent).toBe('Done');
    expect(f.a.cancel).not.toHaveBeenCalled();
    h.cancel();
    expect(f.a.cancel).toHaveBeenCalled();
    expect(el.style.opacity).toBe('0');
    expect(await h.done).toBe('skipped');
  });
  it('K435-2 stamp hands over its label and ring, holds the ring past its end, and gives the ring its own z', () => {
    animate.mockReturnValue(fakeAnim(false).a as unknown as Animation);
    const onParts = vi.fn();
    const { end } = setup({ do: 'stamp', text: 'Hit', style: { zIndex: '5' }, ringZ: 2, holdRing: true, onParts, ring: { ms: 50, delay: 0, style: {}, frames: [{ opacity: 0 }, { opacity: 0.8 }] } });
    const parts = onParts.mock.calls[0]![0] as { label: HTMLElement; ring: HTMLElement };
    expect([parts.label.dataset['fxPart'], parts.ring.dataset['fxPart'], parts.label.style.zIndex, parts.ring.style.zIndex]).toEqual(['label', 'ring', '5', '2']);
    end?.();
    expect(parts.ring.isConnected).toBe(true);
    expect(parts.ring.style.opacity).toBe('0.8');
  });
  it('K435-3 motes take per-keyframe easing, a held start, a seed and a direction with gravity', () => {
    animate.mockReturnValue(fakeAnim(false).a as unknown as Animation);
    const kf = (): Keyframe[][] => animate.mock.calls.map((c) => c[0] as Keyframe[]);
    setup({ do: 'motes', count: 1, box: [0, 0, 10, 10], rise: 100, startTransform: 'scale(2)', holdStart: 0.5, easings: ['ease-in', 'linear'], direction: 90, gravity: 40 });
    const [m] = kf();
    expect(m!.map((k) => k.easing)).toEqual(['ease-in', 'linear', 'linear', undefined]);
    expect(m![2]).toMatchObject({ transform: 'scale(2)', offset: 0.5 });
    expect(Number(/, (-?[\d.]+)px\)/.exec(String(m!.at(-1)!.transform))![1])).toBeGreaterThan(40);
    animate.mockClear();
    setup({ do: 'motes', count: 1, box: [0, 0, 10, 10], seed: 3 });
    const a = String(kf()[0]!.at(-1)!.transform);
    animate.mockClear();
    setup({ do: 'motes', count: 1, box: [0, 0, 10, 10] });
    expect(String(kf()[0]!.at(-1)!.transform)).not.toBe(a);
  });
});

// @vitest-environment jsdom
// K435: verb options so games drop their own copies (STCC batches 9-23, Warp batches 13 and 31).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTimeline, createVerbs, type Step } from '../motion-frame/index.ts';
import { pileLift, playOn, shakeAt, registerEffects, type EffectCtx } from './index.ts';

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
  it('K435-4 settle takes caller frames, or curve parameters', () => {
    animate.mockReturnValue(fakeAnim(false).a as unknown as Animation);
    const kf = (): Keyframe[] => animate.mock.calls.at(-1)![0] as Keyframe[];
    const { end, context } = setup({ do: 'settle', frames: [{ transform: 'translateY(-9px)' }, { transform: 'none', opacity: 0.5, offset: 1 }] });
    expect(kf()).toHaveLength(2);
    end?.();
    expect((context.el.querySelector('.fx-actor') as HTMLElement).style.opacity).toBe('0.5');
    setup({ do: 'settle', rise: -12, fromScale: 1.2, dip: 0.9, dipAt: 0.6 });
    expect([kf()[0]!.transform, kf()[1]!.transform, kf()[1]!.offset]).toEqual(['translateY(-12px) scale(1.2)', 'scale(0.9)', 0.6]);
  });
  it('K435-5 lift and pileLift make scale and shadow optional; pileLift animates transform by a share of the height', () => {
    animate.mockReturnValue(fakeAnim(false).a as unknown as Animation);
    setup({ do: 'lift', scale: false, shadow: false });
    expect(animate.mock.calls.at(-1)![0]).toEqual([{ transform: 'none' }, { transform: 'translateY(var(--fx-lift-rise,-6px))' }]);
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({ height: 200 }) as DOMRect;
    pileLift(el, { transform: true, liftShare: 0.06, scale: null, shadow: null, liftMs: 160 });
    expect(animate.mock.calls.at(-1)![0]).toEqual([{ transform: 'none' }, { transform: 'translate(0, -12px)' }]);
    pileLift(el, { speed: 'instant', shadow: null });
    expect(el.style.filter).toBe('');
  });
  it('K435-6 ring-pulse shockwaves take caller alpha, radius and width curves (breach)', () => {
    animate.mockReturnValue(fakeAnim(false).a as unknown as Animation);
    const outExpo = (k: number): number => (k >= 1 ? 1 : 1 - 2 ** (-10 * k));
    setup({ do: 'ring-pulse', unit: 1, shockwaves: [{ delay: 0, ms: 100, radius: 1, width: 1, alpha: 1, alphaAt: (k: number) => 1 - k, radiusAt: (k: number) => 30 + 330 * outExpo(k), widthAt: () => 24 }] });
    const kf = animate.mock.calls.at(-1)![0] as Keyframe[];
    expect(kf[0]!.transform).toBe(`scale(${String(30 / 360)},${String(30 / 360)})`);
    expect(String(kf[30]!.outline)).toContain('/ 0.5)');
    expect(String(kf[60]!.boxShadow)).toMatch(/^inset 0 0 24px 8px/);
  });
  it('K435-7 debris in DOM mode makes one element per piece in the layer, with its z, and no canvas', () => {
    animate.mockReturnValue(fakeAnim(false).a as unknown as Animation);
    const { context, end } = setup({ do: 'debris', dom: true, count: 3, z: 4, ms: 300 });
    const kids = [...context.el.children] as HTMLElement[];
    expect(context.el.querySelector('canvas')).toBeNull();
    expect(kids.filter((k) => k.style.zIndex === '4')).toHaveLength(3);
    expect((animate.mock.calls.at(-1)![0] as Keyframe[])).toHaveLength(31);
    end?.();
    expect([...context.el.children].map((k) => k.className)).toEqual(['fx-actor']);
  });
  it('K435-8 shakeAt takes a sine shake: amplitude, frequency, decay', () => {
    const o = { decayMs: 1000, sine: { amplitude: 10, frequency: 5, decay: 1 } };
    expect(shakeAt(50, 1, o).x).toBeCloseTo(9.5);
    expect(shakeAt(150, 1, o).x).toBeCloseTo(-8.5);
    expect(Math.abs(shakeAt(1000, 1, o).x)).toBe(0);
  });
});

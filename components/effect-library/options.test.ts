// @vitest-environment jsdom
// K436: more opt-in effect options (Warp batches 9, 11, 17, 20; STCC batches 9, 10, 14, 20-24).
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTimeline, createVerbs, type Rect, type Step } from '../motion-frame/index.ts';
import { cameraPull, createAmbience, createEffectLayer, missionSparks, MISSION_SHINE, registerEffects, startIdle, type EffectCtx, type LayerOptions } from './index.ts';
import { fakeDom } from './fake/dom.ts';

const animate = vi.fn<HTMLElement['animate']>();
const anim = () => ({ cancel: vi.fn(), pause: vi.fn(), play: vi.fn(), playState: 'finished', finished: Promise.resolve(), effect: { getComputedTiming: () => ({ endTime: 100, localTime: 100 }) } });
function setup(step: Partial<Step> & Pick<Step, 'do'> & Record<string, unknown>, o: LayerOptions = {}, stage: (id: string) => Rect | undefined = () => undefined) {
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  animate.mockImplementation(() => anim() as unknown as Animation);
  const verbs = createVerbs<EffectCtx>();
  const context = registerEffects(verbs, o);
  const timeline = buildTimeline({
    id: 'k436', actors: [{ id: 'piece', at: [50, 50], w: 20, h: 40 }],
    steps: [{ t: 0, actor: 'piece', dur: 100, to: [150, 80], ...step }, { t: 100, actor: 'piece', dur: 100, do: 'show' }],
  }, stage);
  const call = timeline.calls[0]!;
  const run = { id: 1, context, timeline };
  const end = verbs.get(call.verb)?.(call, run);
  const el = context.el.querySelector<HTMLElement>('.fx-actor')!;
  return { context, end, run, call, el };
}
const frames = (i = -1): Keyframe[] => animate.mock.calls.at(i)![0] as Keyframe[];
const opts = (i = -1): KeyframeAnimationOptions => animate.mock.calls.at(i)![1] as KeyframeAnimationOptions;

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, 'animate');
  document.body.replaceChildren();
});

describe('K436 effect options', () => {
  it('K436 bar-fill pin: glow under the number, ring centred on its stroke, the caller clock, an end hook', () => {
    let draw: (t: number) => void = () => undefined;
    const stop = vi.fn();
    const onEnd = vi.fn();
    const { el, end } = setup({ do: 'bar-fill', from: 2, to: 3, pin: {
      delta: [10, 0], window: [0, 100], glow: { radius: 5, alpha: 1, tail: 0, peak: 0.5 }, ring: { start: 0, end: 50, from: 5, to: 10, colour: 'red', width: 4 },
      glowUnder: true, ringCentred: true, clock: (d: (t: number) => void) => ((draw = d), stop), onEnd,
    } });
    const [, ring, over] = [...el.children] as HTMLElement[];
    expect([over?.tagName, over?.style.zIndex, ring?.style.boxSizing]).toEqual(['SPAN', '1', 'border-box']);
    draw(10);
    expect(el.textContent).toBe('2');
    draw(100);
    expect([el.textContent, ring?.style.width]).toEqual(['3', '14px']);
    end?.();
    expect([stop.mock.calls.length, onEnd.mock.calls.length, el.textContent]).toEqual([1, 1, '3']);
  });
  it('K436 orbit twinkleMs shifts only the twinkle clock', () => {
    const fills: string[] = [];
    const ctx = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? undefined : () => undefined), set: (_t, k, v) => ((k === 'fillStyle' && fills.push(String(v))), true) });
    vi.stubGlobal('CanvasRenderingContext2D', function () {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
    animate.mockImplementation(() => ({ ...anim(), currentTime: 0 }) as unknown as Animation);
    const el = document.createElement('div');
    startIdle(el, { kind: 'orbit', orbit: { trackWidth: 0, count: 1 } })();
    startIdle(el, { kind: 'orbit', orbit: { trackWidth: 0, count: 1, twinkleMs: 50 * Math.PI } })();
    expect(fills).toEqual(['rgba(255,255,255,0.48)', 'rgba(255,255,255,0.6)']);
  });
  it('K436 layer: no isolation, per-part z-index and blend (actors at start, or per step)', () => {
    expect(createEffectLayer({ isolate: false }).el.style.display).toBe('contents');
    const { context, run, el } = setup({ do: 'show', zIndex: 4, blend: 'screen' });
    expect([el.style.zIndex, el.style.mixBlendMode]).toEqual(['4', 'screen']);
    context.start(run, [{ id: 'piece', at: [0, 0], zIndex: 2, blend: 'multiply' }]);
    expect([el.style.zIndex, el.style.mixBlendMode]).toEqual(['2', 'multiply']);
  });
  it('K436 projectile headEarly and shimmer rippleEarly show during the delay; ring-pulse boxSizing', () => {
    const fill = (pick: (k: Keyframe[]) => boolean) => opts(animate.mock.calls.findIndex((c) => pick(c[0] as Keyframe[]))).fill;
    const head = (k: Keyframe[]) => String(k[0]?.transform).includes('scale(0.6)');
    setup({ do: 'projectile', delay: 50 });
    expect(fill(head)).toBe('forwards');
    animate.mockClear();
    setup({ do: 'projectile', delay: 50, headEarly: true });
    expect(fill(head)).toBe('both');
    const ripple = (k: Keyframe[]) => k[0]?.transform === 'scale(.2)';
    animate.mockClear();
    setup({ do: 'shimmer', delay: 50 });
    expect(fill(ripple)).toBe('none');
    animate.mockClear();
    setup({ do: 'shimmer', delay: 50, rippleEarly: true });
    expect(fill(ripple)).toBe('backwards');
    const { context } = setup({ do: 'ring-pulse', boxSizing: 'content-box' });
    expect((context.el.lastElementChild as HTMLElement).style.boxSizing).toBe('content-box');
  });
  it('K436 fizzle shakes, greys and runs a clipped sputter, removed at the end', () => {
    const { el, end } = setup({ do: 'fizzle' });
    expect(frames(0)[1]).toMatchObject({ transform: 'translateX(-4%)', offset: 0.12 });
    expect(frames(1)[1]).toMatchObject({ filter: 'saturate(0.3) brightness(0.85)' });
    expect(frames(2).at(-1)).toMatchObject({ transform: 'translateX(95%)', opacity: 0 });
    const clip = el.lastElementChild as HTMLElement;
    expect([clip.style.overflow, (clip.firstElementChild as HTMLElement).style.mixBlendMode]).toEqual(['hidden', 'screen']);
    end?.();
    expect(clip.isConnected).toBe(false);
  });
  it('K436 ambience: a still frame at Instant, a frame-rate cap, no frame while covered', () => {
    const dom = fakeDom();
    const target = dom.el('div') as unknown as Element;
    const ts: number[] = [];
    const still = createAmbience({ target: () => target, speed: () => 'instant', still: true, draw: (_c, t) => void ts.push(t) });
    expect([dom.body.children[0]?.style['display'], ts, dom.waiting()]).toEqual(['block', [0], 0]);
    still.destroy();
    let n = 0;
    let covered = true;
    const t0 = performance.now();
    const a = createAmbience({ target: () => target, speed: () => 1, fps: 10, covered: () => covered, draw: () => void (n += 1) });
    dom.step(t0 + 200);
    expect(n).toBe(0);
    covered = false;
    dom.step(t0 + 216);
    expect(n).toBe(0);
    dom.step(t0 + 400);
    expect(n).toBe(1);
    a.destroy();
  });
  it('K436 flip: pivot, an ease per half, overshoot, glow, filter, turn timing, scale curves', () => {
    setup({ do: 'flip', direction: 1, pivot: '0 50%', eases: ['ease-in', 'ease-out'], overshoot: 5, glow: '0 0 9px red', filter: ['none', 'brightness(0.6)', 'none'], turnMs: 60, turnDelay: 20, scaleX: [1, 1.2, 1] });
    const turn = frames(0);
    expect([turn[0]!.easing, turn[0]!.transformOrigin, turn.at(-3)!.easing, turn.at(-2)!.transform]).toEqual(['ease-in', '0 50%', 'ease-out', 'perspective(800px) rotateY(5deg)']);
    expect(opts(0)).toMatchObject({ duration: 60, delay: 20 });
    expect(frames(1).map((k) => k.scale)).toEqual(['1 1', '1.2 1', '1 1']);
    expect(frames(2)[1]).toMatchObject({ boxShadow: '0 0 9px red', offset: 0.5 });
    expect(frames(3).map((k) => k.filter)).toEqual(['none', 'brightness(0.6)', 'none']);
    animate.mockClear();
    const { end, el } = setup({ do: 'flip', direction: -1, continuous: true });
    expect(frames(0).map((k) => k.transform)).toEqual(['perspective(800px) rotateY(0deg)', 'perspective(800px) rotateY(-180deg)']);
    end?.();
    expect(el.style.transform).toBe('perspective(800px) rotateY(-180deg)');
  });
  it('K436 flip with two faces shows the back from the swap, and takes caller frames', () => {
    vi.useFakeTimers();
    const src = document.createElement('div');
    src.id = 'piece';
    src.innerHTML = '<i class="front"></i><b class="back"></b>';
    document.body.append(src);
    const { el, end } = setup({ do: 'flip', faces: ['.front', '.back'], frames: [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(90deg)', opacity: 0.5 }] }, { resolve: (id) => document.getElementById(id) ?? undefined });
    const [front, back] = [el.querySelector<HTMLElement>('.front')!, el.querySelector<HTMLElement>('.back')!];
    expect([front.style.visibility, back.style.visibility, frames(0)]).toEqual(['visible', 'hidden', [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(90deg)', opacity: 0.5 }]]);
    vi.advanceTimersByTime(60);
    expect([front.style.visibility, back.style.visibility]).toEqual(['hidden', 'visible']);
    end?.();
    expect(el.style.opacity).toBe('0.5');
  });
  it('K436 move: % units, transform-only output, rotation and a resize onto a zone', () => {
    setup({ do: 'move', percent: true });
    expect(frames().at(-1)!.translate).toBe('500% 75%');
    animate.mockClear();
    const { el, end, call } = setup({ do: 'move', output: 'transform', rotate: 90 });
    expect(frames().at(-1)!.transform).toBe('translate(100px, 30px) rotate(90deg) scale(1, 1)');
    end?.();
    expect([el.style.left, el.style.transform]).toEqual([`${String(call.from[0])}px`, 'translate(100px, 30px) rotate(90deg) scale(1, 1)']);
    animate.mockClear();
    const r = setup({ do: 'move', to: 'deck', rotate: [30, 0], resize: true }, {}, (id) => (id === 'deck' ? [200, 0, 40, 80] : undefined));
    const f = frames();
    expect([f[0]!.rotate, f.at(-1)!.rotate, f.at(-1)!.scale]).toEqual(['30deg', '0deg', '2 2']);
    r.end?.();
    expect([r.el.style.width, r.el.style.scale, r.el.style.rotate]).toEqual(['40px', '', '']);
  });
  it('K436 move takes caller frames, the last is the end style', () => {
    const { el, end } = setup({ do: 'move', frames: [{ translate: '0 0' }, { translate: '9px 9px', opacity: 0.4 }], output: 'transform' });
    expect(frames()).toHaveLength(2);
    end?.();
    expect([el.style.translate, el.style.opacity]).toEqual(['9px 9px', '0.4']);
  });
  it('K436 glow latch keeps the ring on until a release step', () => {
    const { el, end } = setup({ do: 'glow', colour: 'gold', latch: true });
    expect(frames().map((k) => k.boxShadow)).toEqual(['0 0 0 0 transparent', '0 0 24px 6px gold']);
    end?.();
    expect(el.style.boxShadow).toBe('0 0 24px 6px gold');
  });
  it('K436 dissolve standInAt hides the stand-in until the break moment', () => {
    setup({ do: 'dissolve', heatMs: 100, cutAt: 0.5, standInAt: 30 });
    const k = frames(0);
    expect(k.slice(0, 3)).toEqual([{ opacity: 0 }, { offset: 0.3, opacity: 0 }, { offset: 0.3, opacity: '1' }]);
    animate.mockClear();
    setup({ do: 'dissolve', heatMs: 100, cutAt: 0.5 });
    expect(frames(0)[0]).toEqual({ opacity: '1' });
  });
  it('K436 cameraPull easeOnCut: a cut eases back over releaseMs instead of ending at once', () => {
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
    animate.mockImplementation(() => ({ ...anim(), finished: new Promise(() => undefined) }) as unknown as Animation);
    const root = document.createElement('div');
    const overlay = document.createElement('div');
    cameraPull(root, overlay, { releaseMs: 300 })();
    expect([animate.mock.calls.length, overlay.children.length]).toEqual([2, 0]);
    cameraPull(root, overlay, { releaseMs: 300, easeOnCut: true })();
    expect([animate.mock.calls.length, opts().duration, overlay.children.length]).toEqual([6, 300, 1]);
  });
  it('K436 dash-line loop stays past its step until the signal aborts', () => {
    const c = new AbortController();
    const { context, end } = setup({ do: 'dash-line', to: 'piece', loop: true, signal: c.signal });
    end?.();
    expect(context.el.querySelector('svg')).not.toBeNull();
    c.abort();
    expect(context.el.querySelector('svg')).toBeNull();
  });
  it('K436 sheen on a pseudo-element, playing only while hovered; MISSION_SHINE blends with screen', () => {
    const a = anim();
    const { el } = setup({ do: 'sheen', pseudo: '::before', hover: true });
    animate.mockImplementation(() => a as unknown as Animation);
    const { el: el2 } = setup({ do: 'sheen', pseudo: '::before', hover: true });
    expect(opts()).toMatchObject({ pseudoElement: '::before' });
    expect([a.pause.mock.calls.length, a.play.mock.calls.length]).toEqual([1, 0]);
    el2.dispatchEvent(new Event('pointerenter'));
    el2.dispatchEvent(new Event('pointerleave'));
    expect([a.pause.mock.calls.length, a.play.mock.calls.length, el.children.length]).toEqual([2, 1, 0]);
    const { el: el3 } = setup({ do: 'sheen', ...MISSION_SHINE });
    expect((el3.lastElementChild as HTMLElement).style.mixBlendMode).toBe('screen');
  });
  it('K436 spark-burst with the mission sparks preset', () => {
    const [gold] = missionSparks([0, 0, 200, 56]);
    const { context, end } = setup({ do: 'spark-burst', ...gold });
    expect(context.el.querySelectorAll('div[style*="border-radius: 50%"]')).toHaveLength(34);
    expect(missionSparks([0, 0, 100, 20])[0].count).toBe(22);
    end?.();
    expect(context.el.querySelectorAll('div[style*="border-radius: 50%"]')).toHaveLength(0);
  });
  it('K436 the energy tuner reads the exported defaults instead of retyping them', () => {
    const html = fs.readFileSync(path.join(path.dirname(path.dirname(import.meta.dirname)), 'tuners', 'src', 'energy.html'), 'utf8');
    for (const d of ['WARP_TRANSFER_DEFAULTS', 'SPIRAL_DEFAULTS', 'PROJECTILE_DEFAULTS', 'SHIELD_BUBBLE_DEFAULTS', 'CURVED_BEAM_DEFAULTS']) expect(html).toContain(`FX.${d}.`);
    expect(html).not.toContain("'Number of tokens sent.', 1)");
  });
});

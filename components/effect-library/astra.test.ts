// @vitest-environment jsdom
// K460: Astra Imperium's stamp / text / trail / shake-group gaps.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTimeline, createVerbs, type Rect, type Step } from '../motion-frame/index.ts';
import { registerEffects, type EffectCtx } from './index.ts';
import type { CanvasFx } from './canvas.ts';
import { trail } from './trail.ts';

const animate = vi.fn<HTMLElement['animate']>();
const anim = () => ({ cancel: vi.fn(), pause: vi.fn(), play: vi.fn(), playState: 'finished', finished: Promise.resolve(), effect: { getComputedTiming: () => ({ endTime: 100, localTime: 100 }) } });
function setup(step: Partial<Step> & Pick<Step, 'do'> & Record<string, unknown>, actors: { id: string; at: [number, number]; w: number; h: number }[] = [{ id: 'piece', at: [50, 50], w: 20, h: 40 }], stage: (id: string) => Rect | undefined = () => undefined) {
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  animate.mockImplementation(() => anim() as unknown as Animation);
  const verbs = createVerbs<EffectCtx>();
  const context = registerEffects(verbs);
  const timeline = buildTimeline({ id: 'k460', actors, steps: [{ t: 0, actor: 'piece', dur: 100, ...step }, { t: 100, actor: 'piece', dur: 100, do: 'show' }] }, stage);
  const call = timeline.calls[0]!;
  const end = verbs.get(call.verb)?.(call, { id: 1, context, timeline });
  return { context, end, call, el: context.el.querySelector<HTMLElement>('.fx-actor')! };
}
afterEach(() => {
  vi.clearAllMocks();
  Reflect.deleteProperty(Element.prototype, 'animate');
  document.body.replaceChildren();
});

describe('K460 effect-library defaults', () => {
  it('K460 stamp ring without frames or style gets a default ring', () => {
    const { el } = setup({ do: 'stamp', text: 'Hit', ring: { ms: 50, delay: 0 } });
    expect(el.querySelector('[data-fx-part="ring"]')).toBeTruthy();
    expect(animate.mock.calls.some((c) => (c[0] as Keyframe[]).some((x) => x.transform === 'scale(1.6)'))).toBe(true);
  });
  it('K460 stamp with an image has no label box', () => {
    const { el } = setup({ do: 'stamp', image: 'a.svg' });
    const img = el.querySelector<HTMLElement>('[data-fx-part="label"]')!;
    expect([img.style.left, img.style.width, img.style.height, img.style.background, img.style.objectFit]).toEqual(['0px', '100%', '100%', 'none', 'contain']);
  });
  it('K460 stamp with text keeps the boxed #222 label by default', () => {
    const { el } = setup({ do: 'stamp', text: 'Victory' });
    const t = el.querySelector<HTMLElement>('[data-fx-part="label"]')!;
    expect([t.style.left, t.style.width, t.style.background]).toEqual(['8%', '84%', 'rgb(34, 34, 34)']);
  });
  it('K460 stamp look bare: lettering over the actor with font parts set separately', () => {
    const { el } = setup({ do: 'stamp', text: 'Victory', look: 'bare' });
    const t = el.querySelector<HTMLElement>('[data-fx-part="label"]')!;
    expect([t.style.background, t.style.borderWidth, t.style.width, t.style.fontWeight, t.style.fontSize, t.style.lineHeight]).toEqual(['none', '0px', '100%', '700', '4em', '1']);
  });
  it('K460 stamp ring with its own style gains no border', () => {
    const { el } = setup({ do: 'stamp', text: 'x', ring: { ms: 50, delay: 0, style: { background: 'red' }, frames: [{ opacity: 0 }, { opacity: 1 }] } });
    expect(el.querySelector<HTMLElement>('[data-fx-part="ring"]')!.style.borderWidth).toBe('');
  });
  it('K460 stamp ring with no style gets a currentColor border', () => {
    const { el } = setup({ do: 'stamp', text: 'x', ring: { ms: 50, delay: 0 } });
    expect(el.querySelector<HTMLElement>('[data-fx-part="ring"]')!.style.borderWidth).toBe('3px');
  });
  it('K460 stamp style still overrides the default look', () => {
    const { el } = setup({ do: 'stamp', text: 'x', style: { background: '#222' } });
    expect(el.querySelector<HTMLElement>('[data-fx-part="label"]')!.style.background).toContain('34, 34, 34');
  });
  it('K460 text honours colour and rise: false', () => {
    const { el } = setup({ do: 'text', text: 'Hi', colour: '#9ccd88', rise: false });
    expect(el.style.color).toBe('rgb(156, 205, 136)');
    expect(JSON.stringify(animate.mock.calls.at(-1)![0])).not.toContain('translateY');
  });
  it('K460 text rises and takes the themed colour by default', () => {
    const { el } = setup({ do: 'text', text: 'Hi' });
    expect(el.style.color).toBe('var(--fx-text,inherit)');
    expect(JSON.stringify(animate.mock.calls.at(-1)![0])).toContain('translateY');
  });
  it('K460 trail with only width, tipWidth, colour and fade draws', () => {
    const calls: string[] = [];
    const ctx = new Proxy({}, { get: (_t, k) => () => { calls.push(String(k)); }, set: () => true }) as unknown as CanvasRenderingContext2D;
    const r = (x: number, y: number): Rect => [x, y, 10, 10];
    const call = { dur: 400, from: r(0, 0), to: r(300, 100), step: { dur: 400, ribbon: { width: 6, tipWidth: 1, colour: '255,255,255', fade: 0.8 } } };
    expect(() => trail(ctx, 200, { call } as unknown as CanvasFx)).not.toThrow();
    expect(calls).toContain('stroke');
  });
  it('K460 trail derives its flight from the paired arc-move (control point 2 x arcHeight above the midpoint)', () => {
    const ys: number[] = [];
    const ctx = new Proxy({}, { get: (_t, k) => (k === 'moveTo' ? (_x: number, y: number) => { ys.push(y); } : () => undefined), set: () => true }) as unknown as CanvasRenderingContext2D;
    const to: Rect = [300, 100, 10, 10];
    const call = { t: 0, verb: 'trail', dur: 400, from: [0, 0, 10, 10] as Rect, to, step: { dur: 400, ribbon: { width: 6, tipWidth: 1, colour: '255,255,255', fade: 0.8 } } };
    const run = { timeline: { calls: [call, { t: 0, verb: 'arc-move', to, step: { arcHeight: 50 } }] } };
    trail(ctx, 200, { call, run } as unknown as CanvasFx);
    expect(ys[0]).toBeCloseTo(5, 5);
    ys.length = 0;
    trail(ctx, 200, { call, run: { timeline: { calls: [call] } } } as unknown as CanvasFx);
    expect(ys[0]).toBeCloseTo(55, 5);
  });
  it('K460 shake-group moves the actors its step names though the spec did not declare them', () => {
    const { context } = setup({ do: 'shake-group', actors: ['map', 'invader'] });
    expect(context.el.querySelectorAll('.fx-actor').length).toBe(2);
    expect(animate.mock.calls.length).toBe(2);
  });
});

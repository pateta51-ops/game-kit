// @vitest-environment jsdom
// K504: an object option given as {} or true takes its defaults.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTimeline, createVerbs, type Step } from '../motion-frame/index.ts';
import { registerEffects, type EffectCtx } from './index.ts';
import { curvedBeam } from './beam-canvas.ts';
import { dissolveSmoke } from './break-effects.ts';
import { shieldBubble } from './shield-bubble.ts';
import { spiralTransfer } from './spiral.ts';

const animate = vi.fn<HTMLElement['animate']>();
const anim = () => ({ cancel: vi.fn(), pause: vi.fn(), play: vi.fn(), playState: 'finished', finished: Promise.resolve(), effect: { getComputedTiming: () => ({ endTime: 100, localTime: 100 }) } });
function setup(step: Partial<Step> & Pick<Step, 'do'>) {
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  animate.mockImplementation(() => anim() as unknown as Animation);
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  const verbs = createVerbs<EffectCtx>();
  const context = registerEffects(verbs);
  const timeline = buildTimeline({
    id: 'k504', actors: [{ id: 'piece', at: [50, 50], w: 20, h: 40 }],
    steps: [{ t: 0, actor: 'piece', dur: 1600, to: [150, 80], ...step }],
  }, () => undefined);
  const call = timeline.calls[0]!;
  const run = { id: 1, context, timeline };
  const end = verbs.get(call.verb)?.(call, run);
  return { call, run, context, end };
}
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, 'animate');
  document.body.replaceChildren();
});

const bad = (v: unknown): boolean => typeof v === 'number' ? !Number.isFinite(v) : typeof v === 'string' ? /NaN|undefined|Infinity/.test(v) : false;
function framesFinite(): void {
  expect(animate).toHaveBeenCalled();
  for (const [kf] of animate.mock.calls) for (const f of kf as Keyframe[]) for (const [k, v] of Object.entries(f)) expect([k, bad(v)]).toEqual([k, false]);
}
function canvas(draw: (ctx: CanvasRenderingContext2D) => void): void {
  const nums: number[] = [];
  const ctx = new Proxy({}, {
    get: (_t, k) => k === 'canvas' ? { width: 720, height: 420 } : (...a: unknown[]) => {
      for (const v of a) if (typeof v === 'number') nums.push(v);
      return { addColorStop: () => undefined };
    },
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  draw(ctx);
  expect(nums.filter((n) => !Number.isFinite(n))).toEqual([]);
}

describe('K504 option defaults', () => {
  it.each([
    ['flicker buzz {}', { do: 'flicker', buzz: {} }],
    ['flicker buzz true', { do: 'flicker', buzz: true }],
    ['ring-pulse shockwaves [{}]', { do: 'ring-pulse', shockwaves: [{}] }],
    ['dissolve lift {}', { do: 'dissolve', lift: {} }],
    ['dissolve lift true', { do: 'dissolve', lift: true }],
    ['warp-transfer portal {}', { do: 'warp-transfer', mode: 'portal', portal: {} }],
    ['warp-transfer portal vortex {}', { do: 'warp-transfer', mode: 'portal', portal: { vortex: {} } }],
    ['projectile plain', { do: 'projectile' }],
  ] as [string, Step][])('%s plays with finite keyframes', (_n, step) => {
    const { end } = setup(step);
    framesFinite();
    end?.();
  });
  it('projectile plain writes no clipPath, a miss does', () => {
    setup({ do: 'projectile' });
    expect(animate.mock.calls.some(([kf]) => (kf as Keyframe[]).some((f) => 'clipPath' in f))).toBe(false);
    animate.mockClear();
    setup({ do: 'projectile', miss: {} });
    expect(animate.mock.calls.some(([kf]) => (kf as Keyframe[]).some((f) => f['clipPath'] === 'inset(0)'))).toBe(true);
  });
  it('bar-fill pin {} and true', () => {
    for (const pin of [{}, true]) {
      const { end } = setup({ do: 'bar-fill', pin });
      end?.();
    }
  });
  for (const [name, step, fn] of [
    ['shield-bubble recharge {}', { do: 'shield-bubble', recharge: {} }, shieldBubble],
    ['column-beam curve {}', { do: 'column-beam', curve: {} }, curvedBeam],
    ['column-beam curve true', { do: 'column-beam', curve: true }, curvedBeam],
    ['dissolve lift {} smoke', { do: 'dissolve', lift: {} }, dissolveSmoke],
    ['warp-transfer spiral true', { do: 'warp-transfer', spiral: true }, spiralTransfer],
    ['warp-transfer spiral {}', { do: 'warp-transfer', spiral: {} }, spiralTransfer],
  ] as const) {
    it(`${name} draws finite numbers`, () => {
      const { call, run, context } = setup({ ...step, do: 'unused' } as Step);
      const fx = { call, run, layer: context, x: 100, y: 100 };
      for (const t of [100, 300, 600, 1000, 1400]) canvas((ctx) => { (fn as typeof shieldBubble)(ctx, t, fx as never); });
    });
  }
});

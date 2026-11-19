// @vitest-environment jsdom
// K412: the hooks games need to drop their own copies of effects, on the fake game.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTimeline, createVerbs, type Run, type Step, type VerbCall } from '../motion-frame/index.ts';
import { registerEffects, createEffectLayer, registerCanvasEffect, GLITCH_DEFAULTS, COLUMN_BEAM_DEFAULTS, ROTATING_BEAM_DEFAULTS, RETICLE_DEFAULTS, PLASMA_ORB_DEFAULTS, DRIFT_CLOUD_DEFAULTS, COLLAPSE_DEFAULTS, SHEEN_DEFAULTS, plasmaOrbScale, type EffectCtx, type EffectLayer } from './index.ts';
import { fakeDom } from './fake/dom.ts';

const animate = vi.fn<HTMLElement['animate']>();
function setup(step: Partial<Step> & Pick<Step, 'do'>) {
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  animate.mockReturnValue({ cancel: vi.fn() } as unknown as Animation);
  const verbs = createVerbs<EffectCtx>();
  const context = registerEffects(verbs);
  const timeline = buildTimeline({
    id: 'hooks', actors: [{ id: 'piece', at: [50, 50], w: 20, h: 40 }],
    steps: [{ t: 0, actor: 'piece', dur: 1600, to: [150, 80], ...step }],
  }, () => undefined);
  const call = timeline.calls[0]!;
  const end = verbs.get(call.verb)?.(call, { id: 1, context, timeline });
  return { context, end, call };
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, 'animate');
  document.body.replaceChildren();
});

describe('K412 hooks', () => {
  it('collapse-jump holdBetween fires once when the collapse ends, with the two rects', () => {
    vi.useFakeTimers();
    const hold = vi.fn();
    const { end } = setup({ do: 'collapse-jump', n: 2, holdBetween: hold });
    expect(hold).not.toHaveBeenCalled();
    vi.advanceTimersByTime(639);
    expect(hold).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(hold).toHaveBeenCalledTimes(1);
    expect(hold.mock.calls[0]![0]).toMatchObject({ from: [50, 50, 20, 40], to: [150, 80, 20, 40] });
    end?.();
    expect(hold).toHaveBeenCalledTimes(1);
  });
  it('collapse-jump holdBetween still runs when the call is skipped before the hold', () => {
    vi.useFakeTimers();
    const hold = vi.fn();
    const { end } = setup({ do: 'collapse-jump', n: 2, holdBetween: hold });
    end?.();
    expect(hold).toHaveBeenCalledTimes(1);
  });
  it('column-beam actorZ puts the actor above the core (default 2)', () => {
    setup({ do: 'column-beam', core: true });
    const z = (): unknown => (animate.mock.calls.at(-1)![0] as Keyframe[])[0]!['zIndex'];
    expect(z()).toBe('2');
    animate.mockClear();
    setup({ do: 'column-beam', core: true, actorZ: 3 });
    expect(z()).toBe('3');
  });
  it('the layer takes a z-index and a position, and holds inside its parent', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const layer = createEffectLayer({ parent, zIndex: 60, position: 'absolute' });
    expect([layer.el.style.zIndex, layer.el.style.position, layer.el.parentElement]).toEqual(['60', 'absolute', parent]);
    const plain = createEffectLayer();
    expect([plain.el.style.position, plain.el.style.zIndex]).toEqual(['fixed', 'var(--fx-z,1000)']);
  });
  it('a canvas effect draws in its host element, with a z-index, not in the layer', () => {
    const dom = fakeDom();
    const layerEl = dom.el('div');
    const hostEl = dom.el('div');
    const verbs = createVerbs<EffectLayer>();
    registerCanvasEffect(verbs, 'ring', () => {}, { host: hostEl as unknown as HTMLElement, zIndex: 60 });
    const layer = { el: layerEl } as unknown as EffectLayer;
    const run = { id: 1, context: layer } as unknown as Run<EffectLayer>;
    const end = verbs.get('ring')?.({ actor: 'a', dur: 100, from: [0, 0, 10, 10], step: { dur: 100 } } as unknown as VerbCall, run);
    expect([hostEl.children.length, layerEl.children.length, hostEl.children[0]?.style['zIndex']]).toEqual([1, 0, '60']);
    end?.();
    expect(hostEl.children.length).toBe(0);
  });
  it('sheen takes a caller-supplied background', () => {
    const band = (extra: object): HTMLElement => setup({ do: 'sheen', ...extra }).context.el.querySelector('div > div > div > div > div') as HTMLElement;
    expect(band({}).style.width).toBe('50%');
    document.body.replaceChildren();
    const custom = band({ background: 'red' });
    expect([custom.style.width, custom.style.background]).toEqual(['50%', 'red']);
  });
  it('exports the defaults the effects use', () => {
    expect(GLITCH_DEFAULTS).toMatchObject({ slices: 3, idleMs: [3500, 7000], burstMs: 200, tearMs: 600, repeat: 0.25, repeatGapMs: [100, 140] });
    expect(COLUMN_BEAM_DEFAULTS).toMatchObject({ glitter: 56, actorZ: 2 });
    expect(ROTATING_BEAM_DEFAULTS).toMatchObject({ turns: 2, beamDeg: 46, fadeMs: 160 });
    expect(RETICLE_DEFAULTS).toMatchObject({ padding: [18, 6], fade: [520, 660] });
    expect(DRIFT_CLOUD_DEFAULTS.cohortDim).toBe(0.1);
    expect(COLLAPSE_DEFAULTS).toMatchObject({ outMs: 640, gapMs: 140, inMs: 640 });
    expect(SHEEN_DEFAULTS).toMatchObject({ angle: 100, bandWidth: 50 });
    expect(plasmaOrbScale(0, 1)).toBeCloseTo(1 + PLASMA_ORB_DEFAULTS.swell);
  });
});

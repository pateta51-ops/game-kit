// The canvas board's bookkeeping on a faked page (no pixels): when it is made, kept and removed.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVerbs, type Run, type VerbCall } from '../motion-frame';
import { registerCanvasEffect } from './canvas';
import { fakeDom, type FakeEl } from './fake/dom';
import type { EffectLayer } from './layer';

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup(layerEl: FakeEl | undefined) {
  const verbs = createVerbs<EffectLayer>();
  const drawn: string[] = [];
  registerCanvasEffect(verbs, 'burst', (_ctx, _t, fx) => void drawn.push(fx.call.actor));
  const layer = { el: layerEl } as unknown as EffectLayer;
  const run = { id: 1, context: layer } as unknown as Run<EffectLayer>;
  const start = (actor: string): undefined | (() => void) => verbs.get('burst')?.({ actor, dur: 100, from: [0, 0, 10, 10], step: { dur: 100 } } as unknown as VerbCall, run);
  return { start, drawn };
}

describe('canvas effects on a faked page', () => {
  it('a page that cannot draw: the verb does nothing', () => {
    const s = setup(undefined);
    expect(s.start('a')).toBeUndefined();
  });
  it('no 2D context: the verb does nothing, no canvas and no frame are left', () => {
    const dom = fakeDom({ context: false });
    const layerEl = dom.el('div');
    const s = setup(layerEl);
    expect(s.start('a')).toBeUndefined();
    expect([layerEl.children.length, dom.waiting()]).toEqual([0, 0]);
  });
  it('a layer of no size still draws, on a 0 x 0 canvas', () => {
    const dom = fakeDom({ w: 0, h: 0 });
    const layerEl = dom.el('div');
    const s = setup(layerEl);
    const end = s.start('a');
    dom.step();
    expect([s.drawn, layerEl.children[0]?.width, layerEl.children[0]?.height]).toEqual([['a'], 0, 0]);
    end?.();
    expect([layerEl.children.length, dom.waiting()]).toEqual([0, 0]);
  });
  it('two effects share one canvas; it goes with the last', () => {
    const dom = fakeDom();
    const layerEl = dom.el('div');
    const s = setup(layerEl);
    const a = s.start('a');
    const b = s.start('b');
    dom.step();
    expect([layerEl.children.length, s.drawn]).toEqual([1, ['a', 'b']]);
    a?.();
    dom.step();
    expect([layerEl.children.length, s.drawn, dom.waiting()]).toEqual([1, ['a', 'b', 'b'], 1]);
    b?.();
    expect([layerEl.children.length, dom.waiting()]).toEqual([0, 0]);
  });
  it('an effect whose canvas was cleared away ends without touching the canvas made after it', () => {
    const dom = fakeDom();
    const layerEl = dom.el('div');
    const s = setup(layerEl);
    const a = s.start('a');
    layerEl.children[0]?.remove();
    const b = s.start('b');
    const second = layerEl.children[0];
    a?.();
    dom.step();
    expect([layerEl.children.length, layerEl.children[0] === second, s.drawn, dom.waiting()]).toEqual([1, true, ['b'], 1]);
    const c = s.start('c');
    expect(layerEl.children.length).toBe(1);
    b?.();
    c?.();
    expect([layerEl.children.length, dom.waiting()]).toEqual([0, 0]);
  });
});

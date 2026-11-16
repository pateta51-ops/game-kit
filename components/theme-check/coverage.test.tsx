import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coverageFindings, coverageProblems } from './coverage';
import type { LayoutPage } from './layout';

const B = (l: number, t: number, r: number, b: number) => ({ l, t, r, b });
const alone = <A, R>(fn: (arg: A) => R): ((arg: A) => R) => globalThis.eval(`(${fn.toString()})`) as (arg: A) => R;
const fake: LayoutPage = { evaluate: (fn, arg) => Promise.resolve(alone(fn)(arg)) };

describe('coverageProblems', () => {
  const area = B(0, 0, 400, 400);
  it('is clean when content spans the area with no big hole', () => {
    expect(coverageProblems({ area, boxes: [B(0, 0, 400, 100), B(0, 100, 200, 400), B(200, 100, 400, 400)] })).toEqual([]);
  });
  it('reports a narrow span', () => {
    expect(coverageProblems({ area, boxes: [B(0, 0, 100, 400)] }, { maxEmpty: 1 })).toEqual(['content spans 25% of the width (min 70%)']);
  });
  it('reports the largest empty block', () => {
    expect(coverageProblems({ area, boxes: [B(0, 0, 400, 48), B(0, 352, 400, 400)] })).toEqual([
      'empty block 400x304px at 0,48 is 76% of the area (max 25%)',
    ]);
  });
  it('reports no content', () => {
    expect(coverageProblems({ area, boxes: [] })).toEqual(['no content in the area']);
  });
});

describe('coverageFindings', () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const [l = 0, t = 0, r = 0, b = 0] = (this.getAttribute('data-box') ?? '').split(',').map(Number);
      return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t, x: l, y: t } as DOMRect;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });
  it('measures visible leaf content in the page', async () => {
    document.body.innerHTML =
      '<div data-box="0,0,1024,768"><p data-box="0,0,1024,300">Hi</p><p data-box="0,0,10,10" style="display:none">x</p><img data-box="0,300,1024,768"></div>';
    expect(await coverageFindings(fake, { area: 'div' })).toEqual({ items: 2, problems: [] });
    const r = await coverageFindings(fake, { area: 'div', items: 'p' });
    expect(r.items).toBe(1);
    expect(r.problems.length).toBeGreaterThan(0);
  });
  it('fails when the area selector matches nothing', async () => {
    document.body.innerHTML = '<p data-box="0,0,10,10">Hi</p>';
    expect((await coverageFindings(fake, { area: '.nope' })).problems).toEqual(['the area has no size']);
  });
});

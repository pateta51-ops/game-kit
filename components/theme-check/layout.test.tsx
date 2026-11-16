import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { layoutFindings, layoutProblems, measure, onTop, outside, overlap, type LayoutPage, type Measured } from './layout';

const B = (l: number, t: number, r: number, b: number) => ({ l, t, r, b });
// as Playwright does: each function is rebuilt from its source and run with only its argument
const alone = <A, R>(fn: (arg: A) => R): ((arg: A) => R) => globalThis.eval(`(${fn.toString()})`) as (arg: A) => R;
const fake: LayoutPage = { evaluate: (fn, arg) => Promise.resolve(alone(fn)(arg)) };
const spec = { zones: '.zone', pieces: '.pile', parts: '.edge', rows: '.row', rowBox: '.sheet' };

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

describe('layout rectangles', () => {
  it('says how far a box leaves its zone, within the tolerance', () => {
    expect(outside(B(10, 10, 20, 20), B(0, 0, 100, 100))).toBe('');
    expect(outside(B(-0.4, 0, 100.4, 100), B(0, 0, 100, 100))).toBe('');
    expect(outside(B(-3, 0, 20, 104.25), B(0, 0, 100, 100))).toBe('left by 3.0px, bottom by 4.3px');
    expect(outside(B(-3, 0, 20, 20), B(0, 0, 100, 100), 5)).toBe('');
    expect(outside(B(0, -2, 102, 20), B(0, 0, 100, 100))).toBe('top by 2.0px, right by 2.0px');
  });
  it('says how much two boxes overlap; touching edges do not', () => {
    expect(overlap(B(0, 0, 10, 10), B(10, 0, 20, 10))).toBe('');
    expect(overlap(B(0, 0, 10, 10), B(9.6, 0, 20, 10))).toBe('');
    expect(overlap(B(0, 0, 10, 10), B(8, 4, 20, 30))).toBe('2.0x6.0px');
    expect(overlap(B(0, 0, 10, 10), B(8, 4, 20, 30), 3)).toBe('');
    expect(overlap(B(0, 0, 10, 10), B(50, 50, 60, 60))).toBe('');
  });
  it('lists pieces outside their zone, overlapping pieces and cut rows', () => {
    const row = { scrollW: 50, scrollH: 20, clientW: 50, clientH: 20, within: B(0, 0, 100, 100) };
    const m: Measured = {
      zones: [
        { name: 'north', box: B(0, 0, 100, 100), pieces: [{ name: 'p1', box: B(10, 10, 60, 60) }, { name: 'p2', box: B(50, 50, 110, 90) }] },
        { name: 'south', box: B(0, 100, 100, 200), pieces: [{ name: 'p3', box: B(40, 80, 70, 150) }] },
      ],
      rows: [
        { name: 'r1', box: B(0, 0, 50, 20), ...row },
        { name: 'r2', box: B(0, 90, 50, 110), ...row, scrollH: 31 },
        { name: 'r3', box: B(0, 0, 50, 20), ...row, scrollW: 51, within: null },
      ],
    };
    expect(layoutProblems(m)).toEqual([
      "north: p2 crosses the zone's border: right by 10.0px",
      "south: p3 crosses the zone's border: top by 20.0px",
      'north: p1 overlaps p2 (north) by 10.0x10.0px',
      'north: p2 overlaps p3 (south) by 20.0x10.0px',
      'r2: is cut by 11px',
      'r2: runs past its box: bottom by 10.0px',
    ]);
    expect(layoutProblems(m, 100)).toEqual([]);
    const fan = (overlapOk: boolean): Measured => ({
      zones: [
        { name: 'hand', box: B(0, 0, 100, 100), overlapOk, pieces: [{ name: 'c1', box: B(0, 0, 40, 50) }, { name: 'c2', box: B(20, 0, 60, 50) }] },
        { name: 'hand', box: B(0, 0, 100, 100), overlapOk, pieces: [{ name: 'c3', box: B(50, 0, 90, 120) }] },
      ],
      rows: [],
    });
    expect(layoutProblems(fan(false))).toHaveLength(3);
    expect(layoutProblems(fan(true))).toEqual(["hand: c3 crosses the zone's border: bottom by 20.0px", 'hand: c2 overlaps c3 (hand) by 10.0x50.0px']);
    expect(layoutProblems({ zones: [], rows: [] })).toEqual([]);
  });
});

describe('layout browser steps', () => {
  it('reads zones, top-level pieces with their parts, and rows from the page', async () => {
    document.body.innerHTML = `
      <div class="zone" data-testid="north" data-box="0,0,100,100">
        <div class="pile" aria-label="deck" data-box="10,10,40,40">
          <i class="edge" data-box="8,12,38,44"></i><i class="edge"></i>
          <div class="pile" data-box="500,500,600,600"></div>
        </div>
        <div class="pile" data-box="60,10,104,40"></div>
        <div class="pile"></div>
      </div>
      <div class="sheet" data-box="0,200,100,300"><p class="row" data-box="0,280,100,306"></p><p class="row" id="cut" data-box="0,200,100,220"></p></div>`;
    Object.defineProperty(document.getElementById('cut') as HTMLElement, 'scrollHeight', { value: 9 });
    expect(measure(spec).zones).toEqual([
      { name: 'north', box: B(0, 0, 100, 100), overlapOk: false, pieces: [{ name: 'deck', box: B(8, 10, 40, 44) }, { name: 'pile', box: B(60, 10, 104, 40) }] },
    ]);
    expect(await layoutFindings(fake, spec)).toEqual({
      pieces: 2,
      rows: 2,
      problems: ["north: pile crosses the zone's border: right by 4.0px", 'row #1: runs past its box: bottom by 6.0px', 'row #2: is cut by 9px'],
    });
    expect((await layoutFindings(fake, { ...spec, tolerance: 10 })).problems).toEqual([]);
  });
  it('lets the pieces of an overlapOk zone overlap each other, and skips what is not shown', async () => {
    document.body.innerHTML = `
      <div class="zone fan" data-testid="hand" data-box="0,0,100,100">
        <div class="pile" aria-label="c1" data-box="0,0,40,50"></div><div class="pile" aria-label="c2" data-box="20,0,60,50"></div>
        <div class="pile" style="display:none" data-box="900,0,990,50"></div><div class="pile" style="visibility:hidden" data-box="900,0,990,50"></div>
        <div class="pile" aria-label="c3" data-box="70,0,90,50"><i class="edge" style="display:none" data-box="0,0,999,999"></i></div>
      </div>
      <div class="zone" style="display:none" data-box="0,0,10,10"><div class="pile" data-box="50,50,60,60"></div></div>
      <div class="sheet" data-box="0,200,100,300"><p class="row" style="visibility:hidden" data-box="0,280,100,400"></p><p class="row" style="display:none" data-box="0,280,100,400"></p><p class="row"></p></div>`;
    expect((await layoutFindings(fake, spec)).problems).toEqual(['hand: c1 overlaps c2 (hand) by 20.0x50.0px']);
    expect(await layoutFindings(fake, { ...spec, overlapOk: '.fan' })).toEqual({ pieces: 3, rows: 0, problems: [] });
  });
  it('finds nothing on an empty page or without row selectors', async () => {
    expect(await layoutFindings(fake, spec)).toEqual({ pieces: 0, rows: 0, problems: [] });
    document.body.innerHTML = '<p class="row" data-box="0,0,9,9"></p>';
    expect(await layoutFindings(fake, { zones: '.zone', pieces: '.pile' })).toEqual({ pieces: 0, rows: 0, problems: [] });
  });
  it('says which of two overlapping elements is on top', async () => {
    document.body.innerHTML =
      '<div id="a" data-box="0,0,50,50"><b id="in-a"></b></div><div class="b" data-box="200,0,250,50"></div><div class="b" id="b2" data-box="40,40,90,90"><b id="in-b"></b></div><u id="x" class="veil"></u>';
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const at = vi.fn((x: number, y: number) => (x === 45 && y === 45 ? document.getElementById('in-b') : null));
    document.elementFromPoint = at;
    expect(await onTop(fake, '#a', '.b')).toBe('b');
    expect(scroll).toHaveBeenCalledTimes(1);
    at.mockReturnValue(document.getElementById('in-a'));
    expect(await onTop(fake, '#a', '.b')).toBe('a');
    at.mockReturnValue(document.getElementById('x'));
    expect(await onTop(fake, '#a', '.b')).toBe('other:u.veil');
    at.mockReturnValue(null);
    expect(await onTop(fake, '#a', '.b')).toBe('other:');
    expect(await onTop(fake, '#a', '#x')).toBe('none');
    document.getElementById('b2')?.setAttribute('data-box', '40,5000,90,5050');
    document.getElementById('a')?.setAttribute('data-box', '0,4990,50,5040');
    at.mockClear();
    expect(await onTop(fake, '#a', '.b')).toBe('offscreen');
    document.getElementById('b2')?.setAttribute('data-box', '-90,-90,-40,-40');
    document.getElementById('a')?.setAttribute('data-box', '-80,-80,-30,-30');
    expect(await onTop(fake, '#a', '.b')).toBe('offscreen');
    expect(at).not.toHaveBeenCalled();
    expect(await onTop(fake, '#missing', '.b')).toBe('none');
    expect(await onTop(fake, '#a', '.missing')).toBe('none');
  });
});

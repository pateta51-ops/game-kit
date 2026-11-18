import { describe, expect, it } from 'vitest';
import { faceFitCheck, wrapMeasure } from './face-fit.ts';
import { judgeFace, lineBreakFailures, patternValue, wordFailures, type DiffResult, type FacePolicy } from './face-judge.ts';

const el = (dx: number, dy: number, ncc: number, extra = {}) => ({ dx, dy, ncc, box: [0, 0, 10, 10], ...extra });
const policy: FacePolicy = { minNcc: [['^icon', 0.3], ['.*', 0.5]], minNccSmall: [['.*', 0.4]], textElement: '^line' };
const diff = (elements: DiffResult['elements'], more: Partial<DiffResult> = {}): DiffResult => ({ radius: 12, elements, unmatched: [], ...more });

describe('judgeFace', () => {
  it('passes elements within the tolerance and the least match', () => {
    expect(judgeFace({ diff: diff({ line1: el(6, -6, 0.5), icon: el(0, 0, 0.3) }), policy })).toEqual({ failures: [], warnings: [] });
  });
  it('warns over the tolerance, at the search edge (not trusted) and under the least match', () => {
    const w = judgeFace({ diff: diff({ a: el(7, 0, 0.9), b: el(12, 0, 0.9), c: el(0, 0, 0.49), d: el(1, 1, 0.9, { edge: true }) }), policy }).warnings;
    expect(w).toEqual([expect.stringContaining('a: off by'), expect.stringContaining('b: at the search edge'), expect.stringContaining('c: matches the reference too weakly'), expect.stringContaining('d: at the search edge')]);
  });
  it('uses the small-reference table when the diff is scaled', () => {
    expect(judgeFace({ diff: diff({ a: el(0, 0, 0.45) }, { scaled: true }), policy }).warnings).toEqual([]);
  });
  it('fails an unmatched text element, a missing one, data, fonts and breaking layout; warns for the rest', () => {
    const r = judgeFace({ diff: diff({}, { unmatched: ['line2', 'icon'] }), policy, expected: ['line1'], drawn: [], layoutWarnings: ['line runs past the box', 'icon file missing'], textOut: 'runs past', dataIssues: ['wrong name'], fontError: 'no font' });
    expect(r.failures).toEqual(['fonts: no font', 'data: wrong name', 'layout: line runs past the box', 'line1: not drawn', 'line2: could not be matched (box outside the picture or too small)']);
    expect(r.warnings).toEqual(['layout: icon file missing', 'icon: could not be matched (box outside the picture or too small)']);
  });
  it('fails a line that breaks elsewhere than the reference, by end and length together', () => {
    const d = diff({}, { lineSpans: { l0: [0, 300, 0, 310], l1: [0, 100, 0, 300], l2: [0, 100, null, null], l3: [0, 300, 0, 100] } });
    expect(lineBreakFailures(d).map((s) => s.split(':')[0])).toEqual(['l1', 'l2', 'l3']);
  });
  it('judges words in hundredths against their strip median', () => {
    const word = (ncc: number) => [0, 0, ncc, 0, 0, 50, 10];
    const e = { line1: el(0, 0, 0.8, { words: [word(0.88), word(0.88), word(0.68)] }) };
    expect(wordFailures(diff(e), {})).toEqual([]); // 0.88 - 0.68 is 0.19999..., under the 0.20 deficit but only by rounding
    const e2 = { line1: el(0, 0, 0.8, { words: [word(0.88), word(0.88), word(0.6)] }) };
    expect(wordFailures(diff(e2), {})).toHaveLength(1);
  });
  it('patternValue takes the first matching row', () => {
    expect(patternValue([['^a', 1], ['.*', 2]], 'ab', 0)).toBe(1);
    expect(patternValue(undefined, 'x', 7)).toBe(7);
  });
});

describe('faceFitCheck tolerance', () => {
  it('lets a box be overrun by up to the tolerance in px', () => {
    const measure = wrapMeasure((t, s) => t.length * s * 0.5);
    const f = [{ id: 'c', fields: [{ name: 'n', text: 'abcd', box: { w: 19, h: 20 }, size: 10 }] }];
    expect(faceFitCheck({ faces: f, floor: 0, measure })).toHaveLength(1);
    expect(faceFitCheck({ faces: f, floor: 0, measure, tolerance: 1 })).toHaveLength(0);
  });
});

import { describe, expect, it } from 'vitest';
import { faceFitCheck, wrapMeasure } from './face-fit.ts';

// a fake game: every character is 0.5 em wide
const measure = wrapMeasure((t, s) => t.length * s * 0.5, 1.2);
const box = { w: 100, h: 30 };
const faces = [
  { id: 'fits', fields: [{ name: 'text', text: 'two words', box, size: 12 }] },
  { id: 'overflows', fields: [{ name: 'text', text: 'far too many words to fit in this little box', box, size: 12 }] },
  { id: 'tiny', fields: [{ name: 'text', text: 'ok', box, size: 6 }] },
];

describe('faceFitCheck', () => {
  it('passes the fitting card, reports the overflowing one and the one under the floor', () => {
    const issues = faceFitCheck({ faces, floor: 8, measure });
    expect(issues.map((i) => `${i.id}:${i.field}:${i.kind}`)).toEqual(['overflows:text:overflow', 'tiny:text:below-floor']);
  });
  it('takes a floor per field name and a field override', () => {
    const f = [{ id: 'c', fields: [{ name: 'title', text: 'a', box, size: 10 }, { name: 'body', text: 'a', box, size: 10, floor: 11 }] }];
    expect(faceFitCheck({ faces: f, floor: { title: 12 }, measure }).map((i) => i.field)).toEqual(['title', 'body']);
  });
  it('wraps words and flags a single word wider than the box', () => {
    expect(measure('aaaa bbbb', 10, undefined, 30).h).toBeCloseTo(24);
    expect(faceFitCheck({ faces: [{ id: 'w', fields: [{ name: 'n', text: 'abcdefghijklmnop', box: { w: 20, h: 99 }, size: 10 }] }], floor: 0, measure })[0]?.kind).toBe('overflow');
  });
});

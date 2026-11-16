import { describe, expect, it } from 'vitest';
import { boundaryFile, catalogueCheck, violationList } from './index';

describe('boundary-check', () => {
  it('writes one expect-error import per path', () => {
    const t = boundaryFile(['a/internal', 'b/x']);
    expect(t.match(/@ts-expect-error/g)?.length).toBe(2);
    expect(t).toContain('import "a/internal";');
  });
  it('lists errors first and drops repeats', () => {
    const l = violationList([{ rule: 'r', text: 'a' }, { rule: 'r', text: 'a' }, { rule: 's', text: 'b', severity: 'error' }]);
    expect(l.map((v) => v.text)).toEqual(['b', 'a']);
  });
  it('checks face against behaviour', () => {
    const cards = [{ id: 'c1', vp: 2, shows: true }, { id: 'c2', vp: 1, shows: false }];
    const r = catalogueCheck(cards, (c) => c.id, [{ name: 'vp shown', fails: (c) => (c.vp > 0 && !c.shows ? 'victory points not on the face' : null) }]);
    expect(r).toEqual(['c2: vp shown: victory points not on the face']);
  });
});

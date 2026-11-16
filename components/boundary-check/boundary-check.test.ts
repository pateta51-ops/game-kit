import { describe, expect, it } from 'vitest';
import { boundaryFile, catalogueCheck, releaseCheck, violationList } from './index.ts';

describe('K238 release', () => {  it('a 1.0 game importing motion code or sound is listed; a 1.1 game may use motion but not sound; an unknown release throws', () => {    const files = { 'a.ts': "import { x } from 'kit/motion-frame/index'", 'b.ts': "import('kit/sound-player/index')", 'c.ts': "import { y } from 'kit/theme/index'" };    expect(releaseCheck('1.0', files)).toEqual(['a.ts: imports kit/motion-frame (not before release 1.1)', 'b.ts: imports kit/sound-player (not before release 1.2)']);    expect(releaseCheck('1.1', files)).toEqual(['b.ts: imports kit/sound-player (not before release 1.2)']);    expect(releaseCheck('1.3', files)).toEqual([]);    expect(() => releaseCheck('2', files)).toThrow(/unknown release/);  });});
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

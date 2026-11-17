import { describe, expect, it } from 'vitest';
import { glideFrames, glideMs, hopPlan, spaceLabel, stateOf, stepsOf, type Space, type TrackWords } from './track.ts';

const words: TrackWords = { space: (n) => `Space ${String(n)}`, value: (v) => `value ${String(v)}`, max: 'last space', skipped: 'skipped', here: 'marker here' };
const spaces: Space[] = [{ value: 1 }, { value: 2, marks: [{ id: 'g', letter: 'G', name: 'green' }], effect: { id: 'e', text: 'optional: cycle' } }, { value: 3, skipped: true }, { value: 4, max: true }];

describe('track', () => {
  it('states: past, current, future, skipped', () => {
    expect([0, 1, 2, 3].map((i) => stateOf(spaces, 1, i))).toEqual(['past', 'current', 'skipped', 'future']);
  });
  it('labels come from the game words, with marks, effect, skipped and here', () => {
    expect(spaceLabel(spaces[1]!, 1, 'current', words)).toBe('Space 2, value 2, green, optional: cycle, marker here');
    expect(spaceLabel(spaces[3]!, 3, 'future', words)).toBe('Space 4, last space');
    expect(spaceLabel(spaces[2]!, 2, 'skipped', words)).toContain('skipped');
  });
  it('glide is forward only by default; undo, back, speed 0 jump', () => {
    expect(glideMs(1, 3)).toBe(650);
    expect(glideMs(1, 3, { speed: 2 })).toBe(1300);
    expect(glideMs(3, 1)).toBe(0);
    expect(glideMs(3, 1, { backward: true })).toBe(650);
    expect(glideMs(1, 3, { undone: true })).toBe(0);
    expect(glideMs(1, 3, { speed: 0 })).toBe(0);
    expect(glideMs(1, 3, { speed: 'instant' })).toBe(0);
    expect(glideMs(2, 2)).toBe(0);
  });
  it('glide frames start at the offset, rise half way, end at rest', () => {
    const f = glideFrames(40, 0, 'rotate(5deg)');
    expect(f[0]!.transform).toBe('translate(40px, 0px) rotate(5deg)');
    expect(f[1]!.transform).toContain('scale(1.15)');
    expect(f[2]!.transform).toBe('translate(0, 0) rotate(5deg)');
  });
  it('hop: 360 ms plus 120 per further step; badge only at a new multiplier above 1', () => {
    expect(hopPlan(2, 3).ms).toBe(360);
    expect(hopPlan(2, 5, 1, 2)).toMatchObject({ ms: 600, badge: true, bump: true, mult: 2 });
    expect(hopPlan(2, 5, 2, 2).badge).toBe(false);
    expect(hopPlan(2, 3, 1, 1).badge).toBe(false);
    expect(hopPlan(5, 2, 2, 1).ms).toBe(0);
    expect(hopPlan(2, 5, 1, 2, { undone: true })).toMatchObject({ ms: 0, badge: false, bump: false });
    expect(hopPlan(2, 5, 1, 2, { speed: 0 }).ms).toBe(0);
  });
  it('step list lights one', () => {
    expect(stepsOf([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 'b').map((s) => s.lit)).toEqual([false, true]);
  });
});

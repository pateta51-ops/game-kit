import { describe, expect, it } from 'vitest';
import { CONTENT, COUNTER, playGame, randomAnswer, RULES, type Counter } from '../engine-core/fake/counter';
import { driverLine, placePanel, scriptLine, searchSeeds, seedRange, type TutorialGame, type TutorialScript } from './index';

const GAME: TutorialGame<Counter> = { rules: COUNTER, content: CONTENT, gameRules: RULES, options: (seed) => ({ seed }) };
const SCRIPT: TutorialScript = {
  seed: 'unused',
  steps: [
    { id: 'add', narration: 'Add.', targets: [], do: { kind: 'move', choose: ['add'] } },
    { id: 'draw', narration: 'Draw.', targets: [], do: { kind: 'move', choose: ['draw'] }, expect: [{ type: 'drawn', card: 6 }] },
  ],
};

describe('placePanel', () => {
  const area = { x: 0, y: 0, w: 1000, h: 800 };
  const size = { w: 300, h: 200 };
  it('goes above the target, else below, right, left', () => {
    expect(placePanel([{ x: 400, y: 500, w: 100, h: 50 }], size, area)).toEqual({ x: 300, y: 260 });
    expect(placePanel([{ x: 400, y: 100, w: 100, h: 50 }], size, area)).toEqual({ x: 300, y: 190 });
    expect(placePanel([{ x: 100, y: 0, w: 100, h: 800 }], size, area)).toEqual({ x: 240, y: 300 });
    expect(placePanel([{ x: 800, y: 0, w: 100, h: 800 }], size, area)).toEqual({ x: 460, y: 300 });
  });
  it('rests in the middle with no target, and never on a target', () => {
    expect(placePanel([], size, area)).toEqual({ x: 350, y: 300 });
    const big = [{ x: 320, y: 220, w: 360, h: 360 }];
    const at = placePanel(big, size, area);
    expect(at).toEqual({ x: 0, y: 0 });
  });
});

describe('seed search', () => {
  it('finds the seed whose script line shows the wanted events', () => {
    const play = scriptLine(GAME, SCRIPT);
    expect(play('nope').stopped).toMatch(/MISSING_EVENT/);
    const r = searchSeeds({ seeds: ['nope', 'tut', 'later'], play, accept: (_e, line) => line.stopped === undefined, score: (e) => e.length });
    expect(r).toEqual({ found: ['tut'], tried: 2, best: [{ seed: 'nope', score: 2, stopped: expect.stringMatching(/^step 2 \(draw\) MISSING_EVENT/) as unknown }] });
  });

  it('plays a driver line to the end and tries a range', () => {
    const line = driverLine(GAME, (s, seed) => randomAnswer(s, seed))('s1');
    expect(line.actions).toEqual(playGame('s1').actions);
    expect(line.state.result).not.toBeNull();
    expect(driverLine(GAME, (s, seed) => randomAnswer(s, seed), 1)('s1').stopped).toBe('the cap of 1 actions');
    expect([...seedRange('t-', 3, 2)]).toEqual(['t-3', 't-4']);
    const all = searchSeeds({ seeds: seedRange('t-', 0, 4), play: driverLine(GAME, (s, seed) => randomAnswer(s, seed)), accept: () => true, want: 0 });
    expect(all.found).toEqual(['t-0', 't-1', 't-2', 't-3']);
  });
});

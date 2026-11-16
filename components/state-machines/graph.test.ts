import { describe, expect, it } from 'vitest';
import { defineMachine, recordingViolations, stepViolations, type Track } from './index.ts';

type Stage = 'deal' | 'play' | 'tidy' | 'tally' | 'done';
const STAGE = defineMachine<Stage, 'dealt' | 'played' | 'next' | 'last' | 'counted'>({
  id: 'graphtest.stage',
  initial: 'deal',
  states: {
    deal: { on: { dealt: 'play' } },
    play: { on: { played: 'tidy', last: 'tally' } },
    tidy: { on: { next: 'play' } },
    tally: { on: { counted: 'done' } },
    done: { on: {} },
  },
  describe: { purpose: 'The stages of a made-up game.', source: 'components/state-machines/graph.test.ts' },
});

type Ask = 'start' | 'pick' | 'pay' | 'over';
const ASK = defineMachine<Ask, 'open:pick' | 'open:pay' | 'end'>({
  id: 'graphtest.ask',
  initial: 'start',
  states: {
    start: { on: { 'open:pick': 'pick' } },
    pick: { on: { 'open:pay': 'pay', 'open:pick': 'pick', end: 'over' } },
    pay: { on: { 'open:pick': 'pick' } },
    over: { on: {} },
  },
  describe: { purpose: 'Which question may follow which.', source: 'components/state-machines/graph.test.ts' },
});

interface Pos {
  stage: string;
  ask: string | null;
  seen?: string[];
}
const stage: Track<Pos> = {
  machine: STAGE,
  of: (s) => s.stage,
  stay: true,
  transient: ['tidy', 'tally'],
  between: (_p, n) => n.seen ?? [],
  start: 'deal',
};
const ask: Track<Pos> = { machine: ASK, of: (s) => s.ask, start: 'start' };
const tracks = [stage, ask];
const p = (stage: string, ask: string | null, seen?: string[]): Pos => (seen === undefined ? { stage, ask } : { stage, ask, seen });

describe('transition-graph invariants', () => {
  it('a legal recording has no violations: stays, loops with an edge, transient stages, stamped stages', () => {
    expect(
      recordingViolations(tracks, [
        p('deal', 'pick'),
        p('play', 'pick'),
        p('play', 'pay'),
        p('play', 'pick'),
        p('play', 'pick', ['play', 'tidy', 'tidy', 'play']),
        p('play', 'pick', ['tidy']),
        p('done', 'over'),
      ]),
    ).toEqual([]);
    expect(recordingViolations(tracks, [])).toEqual([]);
    expect(recordingViolations([], [p('nowhere', 'nothing')])).toEqual([]);
  });

  it('an illegal step names the machine, the index, both states, the legal set and the table', () => {
    const v = recordingViolations(tracks, [p('deal', 'pick'), p('play', 'pay'), p('play', 'pay'), p('deal', 'pick')]);
    expect(v.map((x) => [x.machine, x.index, x.from, x.to])).toEqual([
      ['graphtest.ask', 2, 'pay', 'pay'],
      ['graphtest.stage', 3, 'play', 'deal'],
    ]);
    expect(v[0]?.message).toContain('the step went from "pay" to "pay"');
    expect(v[0]?.message).toContain('Legal after "pay": open:pick -> pick');
    expect(v[0]?.message).toContain('Table: components/state-machines/graph.test.ts');
    expect(stepViolations(tracks, p('done', 'over'), p('done', 'pick'))[0]?.message).toContain('nothing (terminal)');
  });

  it('a stage stamped inside the step is checked, and the walk is printed', () => {
    const v = stepViolations(tracks, p('play', 'pick'), p('play', 'pick', ['deal']), 7);
    expect(v.map((x) => [x.index, x.from, x.to])).toEqual([
      [7, 'play', 'deal'],
    ]);
    expect(v[0]?.message).toContain('(walk play > deal > play)');
  });

  it('the first position must follow the start state', () => {
    expect(recordingViolations(tracks, [p('deal', 'pay')]).map((x) => [x.machine, x.from, x.to])).toEqual([
      ['graphtest.ask', 'start', 'pay'],
    ]);
    expect(recordingViolations(tracks, [p('tally', 'pick')]).map((x) => [x.from, x.to])).toEqual([['deal', 'tally']]);
    expect(recordingViolations([{ machine: ASK, of: (s: Pos) => s.ask }], [p('deal', 'pay')])).toEqual([]);
  });

  it('an unknown state is reported once, by the step that arrived at it', () => {
    const v = recordingViolations(tracks, [p('deal', 'pick'), p('lunch', 'pick'), p('lunch', 'pick'), p('done', 'pick')]);
    expect(v.map((x) => [x.index, x.from, x.to])).toEqual([[1, 'deal', 'lunch']]);
    expect(
      recordingViolations(tracks, [p('deal', 'pick'), p('lunch', 'pick'), p('nap', 'pick'), p('play', 'pick'), p('deal', 'pick')]).map((x) => [x.index, x.from, x.to]),
    ).toEqual([
      [1, 'deal', 'lunch'],
      [2, 'lunch', 'nap'],
      [4, 'play', 'deal'],
    ]);
    expect(v[0]?.message).toContain('"lunch" is not a state');
    expect(recordingViolations(tracks, [p('lunch', 'pick')]).map((x) => [x.from, x.to])).toEqual([[null, 'lunch']]);
  });

  it('a position that is not on a machine is skipped, and a step with no previous position only checks the state', () => {
    expect(recordingViolations(tracks, [p('deal', 'pick'), p('play', null), p('play', 'pay')])).toEqual([]);
    expect(stepViolations(tracks, undefined, p('tidy', 'pay'))).toEqual([]);
    expect(stepViolations(tracks, undefined, p('tidy', 'nap')).map((x) => x.to)).toEqual(['nap']);
  });
});

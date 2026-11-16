import { describe, expect, it } from 'vitest';
import { addCount, begin, count, detour, emptyLog, end, endsAfterOne, has, linear, newCampaign, played, readSave, record, retry, standalone, type NextStep, type Step } from './index.ts';

const pro: Step = { kind: 'prologue', id: 'p' }, s1: Step = { kind: 'scenario', id: 's1' }, i1: Step = { kind: 'interlude', id: '1' }, ep: Step = { kind: 'epilogue', id: 'e' };
const flow = linear([pro, s1, i1, ep]);

describe('steps', () => {
  it('a linear campaign walks its list and ends', () => {
    let c = newCampaign('c', '1', pro, 7);
    for (const want of [s1, i1, ep]) {
      const { save, log } = begin(c);
      c = end(save, { log: record(log, want.id) }, flow);
      expect(c.position.step).toEqual(want);
    }
    c = end(begin(c).save, { log: c.log }, flow);
    expect([c.position.step, c.status, c.history.length]).toEqual([null, 'over', 4]);
  });
  it('a branching flow reads resolutions', () => {
    const next: NextStep = (c) => (c.position.resolutions['scenario:s1'] === 'R2' ? ep : played(c, i1) ? ep : i1);
    const c = newCampaign('c', '1', s1, 1);
    expect(end(begin(c).save, { log: c.log, resolution: 'R2' }, next).position.step).toEqual(ep);
    expect(end(begin(c).save, { log: c.log, resolution: 'R1' }, next).position.step).toEqual(i1);
  });
  it('a detour carries its return step', () => {
    let c = detour(newCampaign('c', '1', s1, 1), 'upgrade', 'xp');
    expect(c.position.step).toEqual({ kind: 'upgrade', id: 'xp', then: s1 });
    c = end(begin(c).save, { log: c.log }, () => ep);
    expect(c.position.step).toEqual(s1);
  });
  it('a scenario alone is a campaign that ends after one step', () => {
    const { save, log } = begin(standalone(s1, 3));
    const done = end(save, { log: record(log, 'won'), outcome: 'win' }, endsAfterOne);
    expect([done.status, has(done.log, 'won')]).toEqual(['over', true]);
  });
});
describe('frozen input and retry', () => {
  it('the game gets a frozen copy of the log', () => {
    const c = newCampaign('c', '1', s1, 1, record(emptyLog(), 'a'));
    const { log } = begin(c);
    expect(() => log.recorded.push('b')).toThrow();
    expect(c.log.recorded).toEqual(['a']);
  });
  it('retry restores the snapshot taken when the step began, history keeps the attempt', () => {
    let c = newCampaign('c', '1', s1, 5);
    const b = begin(c);
    c = end(b.save, { log: addCount(b.log, 'doom', 3, 's1'), outcome: 'loss', resolution: 'R1' }, flow);
    expect(count(c.log, 'doom')).toBe(3);
    c = retry(c);
    expect([count(c.log, 'doom'), c.position.step, c.position.done, c.position.resolutions, c.history.length]).toEqual([0, s1, [], {}, 1]);
    expect(c.history[0]?.seed).toBe(5);
    expect(begin(c).save.attempt?.seed).toBe(6);
  });
  it('the snapshot shares no object with the live log', () => {
    const c = newCampaign('c', '1', s1, 1, record(emptyLog(), 'a'));
    const { save } = begin(c);
    expect(save.attempt?.logBefore).toEqual(c.log);
    expect(save.attempt?.logBefore.recorded).not.toBe(c.log.recorded);
  });
  it('end refuses an incompatible save', () => {
    const { save, log } = begin(newCampaign('c', '1', s1, 1));
    expect(() => end({ ...save, status: 'incompatible' }, { log }, flow)).toThrow();
  });
  it('retry during a step drops the attempt', () => {
    expect(retry(begin(newCampaign('c', '1', s1, 1)).save).attempt).toBeUndefined();
  });
});
describe('save', () => {
  it('survives JSON; another version is incompatible', () => {
    const c = begin(newCampaign('c', '2', s1, 1)).save;
    const back = readSave(JSON.parse(JSON.stringify(c)), '2');
    expect(back).toEqual(c);
    expect(readSave(back, '3')?.status).toBe('incompatible');
    expect(readSave({ v: 1 }, '2')).toBeUndefined();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMotionPlayer, createVerbs, type MotionSpec, type Rect } from './index.ts';

const stage = (z: string): Rect | undefined => ({ tray: [0, 0, 100, 100] as const })[z];
const two: MotionSpec = { id: 'two', maxMs: 1000, steps: [{ t: 0, dur: 1000, actor: 'tray', do: 'text' }], sound: [{ t: 800, cue: 'late' }, { t: 100, cue: 'early' }] };
const kept: MotionSpec = { id: 'kept', maxMs: 1000, hurry: 'keep', steps: [{ t: 0, dur: 1000, actor: 'tray', do: 'text' }], sound: [{ t: 900, cue: 'k' }] };
const placed: MotionSpec = { ...two, id: 'placed', places: { last: { steps: two.steps, sound: [{ t: 10, cue: 'lastcue' }] } } };
const cutter: MotionSpec = { ...two, id: 'cutter', sound: [{ t: 500, cue: 'in' }, { t: 1500, cue: 'beyond' }] };
const waits: MotionSpec = { ...two, id: 'waits', awaitRects: ['tray'] };
const lost: MotionSpec = { ...two, id: 'lost', stage: 'nowhere' };

describe('K476 onDroppedCue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const setup = (dropped: boolean, o: { speed?: 'instant'; boom?: boolean } = {}) => {
    const frames: FrameRequestCallback[] = [];
    const log: string[] = [];
    const verbs = createVerbs();
    verbs.register('text', () => undefined);
    const player = createMotionPlayer({
      specs: { two, kept, lost, placed, cutter, waits },
      stages: { default: o.boom ? () => { throw new Error('boom'); } : stage },
      frame: (f) => { frames.push(f); },
      verbs,
      speed: () => o.speed ?? 1,
      context: undefined,
      onCue: (c, b) => log.push(`cue ${b}/${c}`),
      ...(dropped && { onDroppedCue: (c: string, b: string, w: string) => log.push(`dropped ${b}/${c} ${w}`) }),
      onProblem: () => undefined,
    });
    return { log, player, frames };
  };

  it('K476 skipAll mid-beat reports only the unfired cues', () => {
    const { log, player } = setup(true);
    player.play('two');
    vi.advanceTimersByTime(300);
    player.skipAll();
    expect(log).toEqual(['cue two/early', 'dropped two/late skipped']);
  });

  it('K476 the fail path reports all the cues of the beat, in timeline order', () => {
    const { log, player } = setup(true);
    player.play('lost');
    expect(log).toEqual(['dropped lost/early failed', 'dropped lost/late failed']);
  });

  it('K476 a hurry keep beat reports none', () => {
    const { log, player } = setup(true);
    player.play('kept', { parallel: true });
    vi.advanceTimersByTime(100);
    player.hurry();
    vi.advanceTimersByTime(1000);
    expect(log).toEqual(['cue kept/k']);
  });

  it('K476 a snapped queued beat reports its cues', () => {
    const { log, player } = setup(true);
    player.play('two');
    player.play('two');
    vi.advanceTimersByTime(300);
    player.skipAll();
    expect(log).toEqual(['cue two/early', 'dropped two/late skipped', 'dropped two/early skipped', 'dropped two/late skipped']);
  });

  it('K476 without the option nothing changes', () => {
    const { log, player } = setup(false);
    player.play('two');
    vi.advanceTimersByTime(300);
    player.skipAll();
    player.play('lost');
    expect(log).toEqual(['cue two/early']);
  });

  it('K476 a snapped place variant reports the variant cues, not the base ones', () => {
    const { log, player } = setup(true);
    player.playRun(['two', 'placed']);
    vi.advanceTimersByTime(300);
    player.skipAll();
    expect(log).toEqual(['cue two/early', 'dropped two/late skipped', 'dropped placed/lastcue skipped']);
  });

  it('K476 a cue after the end of a beat that ends normally is reported as cut', () => {
    const { log, player } = setup(true);
    player.play('cutter');
    vi.advanceTimersByTime(1000);
    expect(log).toEqual(['cue cutter/in', 'dropped cutter/beyond cut']);
  });

  it('K476 skipAll with finishStep reports the cues not yet due', () => {
    const { log, player } = setup(true);
    player.play('two');
    vi.advanceTimersByTime(300);
    player.skipAll({ finishStep: true });
    vi.advanceTimersByTime(2000);
    expect(log).toEqual(['cue two/early', 'dropped two/late skipped']);
  });

  it('K476 a failed redraw reports all the cues as failed', () => {
    const { log, player, frames } = setup(true, { boom: true });
    player.play('waits', { commit: () => undefined });
    frames.shift()?.(16);
    expect(log).toEqual(['dropped waits/early failed', 'dropped waits/late failed']);
  });

  it('K476 a parallel beat played during skipAll reports all its cues', () => {
    const { log, player } = setup(true);
    player.play('two', { onEnded: () => player.play('kept', { parallel: true }) });
    player.skipAll();
    expect(log).toEqual(['dropped two/early skipped', 'dropped two/late skipped', 'dropped kept/k skipped']);
  });

  it('K476 hurry without keep reports the unfired cues', () => {
    const { log, player } = setup(true);
    player.play('two');
    vi.advanceTimersByTime(300);
    player.hurry();
    expect(log).toEqual(['cue two/early', 'dropped two/late skipped']);
  });

  it('K476 fail then skip reports once', () => {
    const { log, player } = setup(true);
    player.play('lost');
    player.skipAll();
    vi.advanceTimersByTime(2000);
    expect(log).toEqual(['dropped lost/early failed', 'dropped lost/late failed']);
  });

  it('K476 instant speed fires every cue and reports none', () => {
    const { log, player } = setup(true, { speed: 'instant' });
    player.play('two');
    expect(log).toEqual(['cue two/early', 'cue two/late']);
  });
});

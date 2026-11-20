import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMotionPlayer, createVerbs, type MotionSpec, type Rect } from './index.ts';

const stage = (z: string): Rect | undefined => ({ tray: [0, 0, 100, 100] as const })[z];
const two: MotionSpec = { id: 'two', maxMs: 1000, steps: [{ t: 0, dur: 1000, actor: 'tray', do: 'text' }], sound: [{ t: 800, cue: 'late' }, { t: 100, cue: 'early' }] };
const kept: MotionSpec = { id: 'kept', maxMs: 1000, hurry: 'keep', steps: [{ t: 0, dur: 1000, actor: 'tray', do: 'text' }], sound: [{ t: 900, cue: 'k' }] };
const lost: MotionSpec = { ...two, id: 'lost', stage: 'nowhere' };

describe('K476 onDroppedCue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const setup = (dropped: boolean) => {
    const log: string[] = [];
    const verbs = createVerbs();
    verbs.register('text', () => undefined);
    const player = createMotionPlayer({
      specs: { two, kept, lost },
      stages: { default: stage },
      verbs,
      speed: () => 1,
      context: undefined,
      onCue: (c, b) => log.push(`cue ${b}/${c}`),
      ...(dropped && { onDroppedCue: (c: string, b: string, w: string) => log.push(`dropped ${b}/${c} ${w}`) }),
      onProblem: () => undefined,
    });
    return { log, player };
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
});

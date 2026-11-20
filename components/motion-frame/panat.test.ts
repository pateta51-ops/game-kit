import { describe, expect, it, vi } from 'vitest';
import { createMotionPlayer, createVerbs } from './player.ts';
import type { MotionSpec } from './timeline.ts';

const spec = (panAt?: 'commit'): MotionSpec => ({ id: 'b', maxMs: 100, steps: [], pan: '.x', ...(panAt && { panAt }) });

const run = async (panAt?: 'commit') => {
  const log: string[] = [];
  const player = createMotionPlayer({
    specs: { b: spec(panAt) }, stages: { default: () => undefined }, verbs: createVerbs(), speed: () => 1, context: undefined,
    onBeatStart: () => log.push('start'),
    onBeatEnd: () => log.push('end'),
    pan: () => ({
      ensure: () => { log.push('pan'); return new Promise<void>((r) => setTimeout(() => { log.push('pan settled'); r(); }, 400)); },
      back: () => { log.push('back'); return Promise.resolve(); },
    }),
  });
  player.play('b', { commit: () => log.push('commit') });
  await vi.advanceTimersByTimeAsync(1000);
  return log;
};

describe('K452 panAt', () => {
  it('default: pan before commit', async () => {
    vi.useFakeTimers();
    const log = await run();
    expect(log.indexOf('pan')).toBeLessThan(log.indexOf('commit'));
    vi.useRealTimers();
  });
  it("panAt 'commit': pan right after commit, the beat ends and back runs only after it settles", async () => {
    vi.useFakeTimers();
    expect(await run('commit')).toEqual(['start', 'commit', 'pan', 'pan settled', 'end', 'back']);
    vi.useRealTimers();
  });
});

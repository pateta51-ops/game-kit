import { describe, expect, it, vi } from 'vitest';
import { createMotionPlayer, createVerbs } from './player.ts';
import type { MotionSpec } from './timeline.ts';

const spec = (panAt?: 'commit'): MotionSpec => ({ id: 'b', maxMs: 100, steps: [], pan: '.x', ...(panAt && { panAt }) }) as unknown as MotionSpec;

const run = async (panAt?: 'commit') => {
  const log: string[] = [];
  const player = createMotionPlayer({
    specs: { b: spec(panAt) }, stages: { default: () => undefined }, verbs: createVerbs(), speed: () => 1,
    pan: () => ({ ensure: () => { log.push('pan'); return Promise.resolve(); }, back: () => Promise.resolve() }),
  });
  player.play('b', { commit: () => log.push('commit') });
  await vi.advanceTimersByTimeAsync(300);
  return log;
};

describe('K452 panAt', () => {
  it('default: pan before commit', async () => {
    vi.useFakeTimers();
    expect(await run()).toEqual(['pan', 'commit']);
    vi.useRealTimers();
  });
  it("panAt 'commit': pan right after commit", async () => {
    vi.useFakeTimers();
    expect(await run('commit')).toEqual(['commit', 'pan']);
    vi.useRealTimers();
  });
});

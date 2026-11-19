import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTimeline, createMotionPlayer, createVerbs, type MotionSpec, type Rect } from './index.ts';

const stage = (z: string): Rect | undefined => (z === 'tray' ? [0, 0, 100, 100] as const : undefined);
const spec: MotionSpec = {
  id: 'F', maxMs: 300, steps: [
    { t: 0, dur: 100, actor: 'tray', do: 'a' },
    { t: 100, dur: 200, actor: 'tray', do: 'b' },
  ],
};

describe('K448 timing', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('K448 keeps fractional ms in step times and lengths', () => {
    const s: MotionSpec = { id: 'X', maxMs: 10, steps: [{ t: 5, dur: 5, actor: 'tray', do: 'a' }] };
    const c = buildTimeline(s, stage, 0.3).calls[0];
    expect([c?.t, c?.dur]).toEqual([1.5, 1.5]);
  });

  const setup = () => {
    const log: string[] = [];
    const gates: Record<string, () => void> = {};
    const verbs = createVerbs();
    for (const v of ['a', 'b'])
      verbs.register(v, () => {
        const f = (() => { log.push(`finish ${v}`); }) as (() => void) & { finished?: Promise<unknown> };
        f.finished = new Promise<void>((r) => { gates[v] = r; });
        return f;
      });
    const player = createMotionPlayer({
      specs: { F: spec }, stages: { default: stage }, verbs, speed: () => 1, context: undefined,
      onBeatEnd: () => log.push('beatEnd'),
    });
    return { log, gates, player };
  };

  it('K448 a step ends on its verb finished promise, not at its timer', async () => {
    const { log, gates, player } = setup();
    player.play('F');
    vi.advanceTimersByTime(100);
    expect(log).toEqual([]);
    gates.a?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(log).toEqual(['finish a']);
  });

  it('K448 the beat end waits for the last step animations', async () => {
    const { log, gates, player } = setup();
    player.play('F');
    vi.advanceTimersByTime(300);
    gates.a?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(log).toEqual(['finish a']);
    expect(player.pending()).toBe(1);
    gates.b?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(log).toEqual(['finish a', 'finish b', 'beatEnd']);
    expect(player.pending()).toBe(0);
  });

  it('K448 poor: a promise that never settles falls back 100 ms after the step end', async () => {
    const { log, player } = setup();
    player.play('F');
    await vi.advanceTimersByTimeAsync(399);
    expect(log).not.toContain('beatEnd');
    await vi.advanceTimersByTimeAsync(1);
    expect(log).toEqual(['finish a', 'finish b', 'beatEnd']);
  });

  it('K448 a skip ends a waiting beat at once', () => {
    const { log, player } = setup();
    player.play('F');
    vi.advanceTimersByTime(300);
    player.skipAll();
    expect(log).toContain('beatEnd');
    expect(player.pending()).toBe(0);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTimeline, createMotionPlayer, createVerbs, hurryOnInput, placeOf, validateSpec, type MotionSpec, type Rect, type Speed } from './index.ts';

const stage = (z: string): Rect | undefined => ({ tray: [0, 0, 100, 100] as const, lamp: [500, 0, 100, 100] as const })[z];
const VERBS = ['move', 'text', 'pop'];
const banner: MotionSpec = {
  id: 'B',
  frequency: 'rare',
  maxMs: 1400,
  steps: [
    { t: 0, dur: 200, actor: 'tray', do: 'move', to: 'lamp' },
    { t: 200, dur: 1000, actor: 'tray', do: 'text', read: true },
    { t: 1200, dur: 200, actor: 'tray', do: 'move', to: 'tray', leave: true },
  ],
  sound: [{ t: 1200, cue: 'out' }],
  reduced: { steps: [{ t: 0, dur: 1000, actor: 'tray', do: 'text', read: true }], maxMs: 1000 },
  places: {
    first: { steps: [{ t: 0, dur: 300, actor: 'tray', do: 'move', to: 'lamp' }] },
    middle: { steps: [{ t: 0, dur: 100, actor: 'tray', do: 'text' }] },
    last: { steps: [{ t: 0, dur: 100, actor: 'tray', do: 'text' }, { t: 100, dur: 200, actor: 'tray', do: 'move', to: 'tray', leave: true }] },
  },
};
const pop: MotionSpec = { id: 'P', frequency: 'constant', maxMs: 500, hurry: 'keep', steps: [{ t: 0, dur: 500, actor: 'tray', do: 'pop' }] };
const band: MotionSpec = { id: 'W', maxMs: 300, whenVisible: true, steps: [{ t: 0, dur: 300, actor: 'tray', do: 'text', read: true }] };

describe('K142 reading time', () => {
  it('Quick shortens motion, not the read hold; Slow lengthens both', () => {
    const quick = buildTimeline(banner, stage, 0.5);
    expect(quick.calls.map((c) => [c.t, c.dur])).toEqual([[0, 100], [100, 1000], [1100, 100]]);
    expect(quick.cues).toEqual([{ t: 1100, cue: 'out' }]);
    expect(buildTimeline(banner, stage, 1.5).calls.map((c) => [c.t, c.dur])).toEqual([[0, 300], [300, 1500], [1800, 300]]);
    expect(buildTimeline(banner, stage, 0.5, 2).ms).toBe(2200);
  });

  it('validates the reduced and place variants and the hurry class', () => {
    expect(validateSpec(banner, stage, VERBS)).toEqual([]);
    const bad = { ...banner, hurry: 'x', reduced: { steps: [{ t: 0, dur: 1, actor: 'nowhere', do: 'text' }] }, places: { fifth: { steps: [] } } };
    expect(validateSpec(bad, stage, VERBS)).toEqual([
      'hurry x is not snap or keep',
      'place fifth is not lone, first, middle or last',
      'reduced: step 1: nowhere is neither an actor nor a zone',
    ]);
  });
});

describe('K142 K143 player', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const setup = (o: { speed?: Speed; reduced?: boolean; visible?: boolean; readFollowsSpeed?: boolean; finishes?: boolean } = {}) => {
    const log: string[] = [];
    const verbs = createVerbs();
    for (const v of VERBS)
      verbs.register(v, (c, run) => {
        log.push(`${run.timeline.id}${run.place ? ` ${String(run.place.k)}/${String(run.place.of)} ${run.place.at}` : ''} ${v} ${String(c.t)}+${String(c.dur)}`);
        return o.finishes ? () => log.push(`end ${v} ${String(c.t)}`) : undefined;
      });
    let visible = o.visible ?? true;
    const player = createMotionPlayer({
      specs: { banner, pop, band },
      stages: { default: stage },
      verbs,
      speed: () => o.speed ?? 1,
      context: undefined,
      reduced: () => o.reduced === true,
      visible: () => visible,
      onCue: (c) => log.push(`cue ${c}`),
      ...(o.readFollowsSpeed && { readFollowsSpeed: true }),
    });
    return {
      log,
      player,
      show: () => {
        visible = true;
        player.visibilityChanged();
      },
    };
  };

  it('reduced motion plays the reduced variant held still; a beat without one is instant', () => {
    const { log, player } = setup({ reduced: true, speed: 0.5 });
    const ends: string[] = [];
    player.play('banner', { onEnded: (h) => ends.push(`banner ${h}`) });
    player.play('pop', { onEnded: (h) => ends.push(`pop ${h}`) });
    vi.advanceTimersByTime(999);
    expect(log).toEqual(['B text 0+1000']);
    vi.advanceTimersByTime(1);
    expect(ends).toEqual(['banner done', 'pop done']);
  });

  it('a whenVisible beat waits for visible and its clock starts then; beats behind it wait too', () => {
    const { log, player, show } = setup({ visible: false });
    player.play('band');
    player.play('pop');
    vi.advanceTimersByTime(5000);
    expect(log).toEqual([]);
    expect(player.pending()).toBe(2);
    show();
    vi.advanceTimersByTime(0);
    expect(log).toEqual(['W text 0+300']);
    vi.advanceTimersByTime(301);
    expect(log).toEqual(['W text 0+300', 'P pop 0+500']);
  });

  it('a gate holds before/after while open, turns leaving, and afterGate waits for it; input is never held', () => {
    const { player } = setup();
    const seen: string[] = [];
    player.afterGate(() => seen.push('free at once'));
    player.play('banner', { gate: { before: 1, after: 2 }, onEnded: (h) => seen.push(`end ${h}`) });
    player.afterGate(() => seen.push('after gate'));
    expect(player.gate()).toEqual({ before: 1, after: 2, beat: 'B', leaving: false });
    vi.advanceTimersByTime(1200);
    expect(player.gate()?.leaving).toBe(true);
    vi.advanceTimersByTime(200);
    expect(player.gate()).toBeNull();
    expect(seen).toEqual(['free at once', 'end done', 'after gate']);
  });

  it('hurry snaps the big beat and drops its cues; a keep beat plays on; onEnd says skipped', () => {
    const { log, player } = setup();
    const ends: string[] = [];
    player.play('pop', { parallel: true, onEnded: (h) => ends.push(`pop ${h}`) });
    player.play('banner', { gate: {}, onEnded: (h) => ends.push(`banner ${h}`) });
    vi.advanceTimersByTime(100);
    const target = new EventTarget();
    hurryOnInput(player, target);
    target.dispatchEvent(new Event('pointerdown'));
    expect(ends).toEqual(['banner skipped']);
    expect(player.gate()).toBeNull();
    vi.advanceTimersByTime(2000);
    expect(log).not.toContain('cue out');
    expect(ends).toEqual(['banner skipped', 'pop done']);
  });

  it('a run enters once, swaps, leaves once; each beat knows k of n; one gate across the run', () => {
    const { log, player } = setup();
    const ends: string[] = [];
    player.playRun(['banner', 'banner', 'banner'], { gate: { before: 'a' }, onEnded: (h) => ends.push(h) });
    expect(player.gate()?.place).toEqual({ at: 'first', k: 1, of: 3 });
    vi.advanceTimersByTime(300 + 100 + 300);
    expect(log).toEqual(['B 1/3 first move 0+300', 'B 2/3 middle text 0+100', 'B 3/3 last text 0+100', 'B 3/3 last move 100+200']);
    expect(ends).toEqual(['done']);
    expect(player.gate()).toBeNull();
    expect([placeOf(1, 1), placeOf(2, 2)]).toEqual(['lone', 'last']);
  });

  it('a run whose last beat has no spec ends once; an empty run ends once', () => {
    const { player } = setup();
    const ends: string[] = [];
    player.playRun(['banner', 'nope'], { onEnded: (h) => ends.push(`a ${h}`) });
    player.playRun([], { onEnd: () => ends.push('empty') });
    expect(ends).toEqual(['empty']);
    vi.advanceTimersByTime(2000);
    expect(ends).toEqual(['empty', 'a done']);
  });

  it('K437 keepUntilReleased: the steps lasting to the end finish when the hold is released, not at the beat end', () => {
    const { log, player } = setup({ finishes: true });
    player.play({ ...banner, holdUntil: 'press' }, { keepUntilReleased: true });
    vi.advanceTimersByTime(1400);
    expect(log).toContain('end text 200');
    expect(log).not.toContain('end move 1200');
    expect(player.held()).toBe(true);
    player.release();
    expect(log.at(-1)).toBe('end move 1200');
  });

  it('K437 keepUntilReleased poor: without the option the verbs finish at the beat end', () => {
    const { log, player } = setup({ finishes: true });
    player.play({ ...banner, holdUntil: 'press' });
    vi.advanceTimersByTime(1400);
    expect(log).toContain('end move 1200');
    expect(player.held()).toBe(true);
  });

  it('K437 finishStep: the step in progress plays to its end, later steps and cues never start, queued beats snap', () => {
    const { log, player } = setup({ finishes: true });
    const ends: string[] = [];
    player.play('banner', { onEnded: (h) => ends.push(`a ${h}`) });
    player.play('banner', { onEnded: (h) => ends.push(`b ${h}`) });
    vi.advanceTimersByTime(300);
    player.skipAll({ finishStep: true });
    expect(ends).toEqual(['b skipped']);
    expect(log).not.toContain('end text 200');
    vi.advanceTimersByTime(899);
    expect(ends).toEqual(['b skipped']);
    vi.advanceTimersByTime(1);
    expect(ends).toEqual(['b skipped', 'a skipped']);
    expect(log.at(-1)).toBe('end text 200');
    vi.advanceTimersByTime(2000);
    expect(log.filter((l) => l.includes('move 1200') || l === 'cue out')).toEqual([]);
    expect(player.pending()).toBe(0);
  });

  it('K437 hurry finishStep through hurryOnInput, pointer only: a key does nothing, a press lets the step finish', () => {
    const { log, player } = setup({ finishes: true });
    const ends: string[] = [];
    player.play('banner', { onEnded: (h) => ends.push(h) });
    vi.advanceTimersByTime(100);
    const target = new EventTarget();
    hurryOnInput(player, target, { pointerOnly: true, finishStep: true });
    target.dispatchEvent(new Event('keydown'));
    vi.advanceTimersByTime(100);
    expect(log).toContain('B text 200+1000');
    target.dispatchEvent(new Event('pointerdown'));
    expect(ends).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(ends).toEqual(['skipped']);
    expect(log).not.toContain('B move 1200+200');
  });

  it('K437 readFollowsSpeed: read holds are halved at Fast', () => {
    const { log, player } = setup({ speed: 0.5, readFollowsSpeed: true });
    player.play('banner');
    vi.advanceTimersByTime(700);
    expect(log).toEqual(['B move 0+100', 'B text 100+500', 'B move 600+100', 'cue out']);
  });

  it('K437 readFollowsSpeed poor: by default the read hold keeps its length at Fast', () => {
    const { log, player } = setup({ speed: 0.5 });
    player.play('banner');
    vi.advanceTimersByTime(1200);
    expect(log).toEqual(['B move 0+100', 'B text 100+1000', 'B move 1100+100', 'cue out']);
  });

  it('K437 keepUntilReleased: kept stand-ins finish on skipAll, on hurry, on autoContinueMs and when the named beat ends', () => {
    for (const end of ['skipAll', 'hurry'] as const) {
      const { log, player } = setup({ finishes: true });
      player.play({ ...banner, holdUntil: 'press' }, { keepUntilReleased: true });
      vi.advanceTimersByTime(1400);
      expect(log).not.toContain('end move 1200');
      player[end]();
      expect(log.at(-1)).toBe('end move 1200');
      expect(player.held()).toBe(false);
    }
    const a = setup({ finishes: true });
    a.player.play({ ...banner, autoContinueMs: 500 }, { keepUntilReleased: true });
    vi.advanceTimersByTime(1899);
    expect(a.log).not.toContain('end move 1200');
    vi.advanceTimersByTime(1);
    expect(a.log.at(-1)).toBe('end move 1200');
    const b = setup({ finishes: true });
    b.player.play({ ...banner, holdUntil: 'P' }, { keepUntilReleased: true });
    vi.advanceTimersByTime(1400);
    b.player.play('pop');
    vi.advanceTimersByTime(499);
    expect(b.log).not.toContain('end move 1200');
    vi.advanceTimersByTime(1);
    expect(b.log.slice(-2)).toEqual(['end pop 0', 'end move 1200']);
  });

  it('K437 finishStep with keepUntilReleased: a kept step in progress plays to its end, then finishes', () => {
    const { log, player } = setup({ finishes: true });
    const ends: string[] = [];
    player.play('banner', { keepUntilReleased: true, onEnded: (h) => ends.push(h) });
    vi.advanceTimersByTime(1300);
    player.skipAll({ finishStep: true });
    expect(ends).toEqual([]);
    expect(log).not.toContain('end move 1200');
    vi.advanceTimersByTime(100);
    expect(ends).toEqual(['skipped']);
    expect(log.at(-1)).toBe('end move 1200');
  });

  it('K437 finishStep poor: a second plain skip during a cut snaps it once; a cut with no step running snaps at once', () => {
    const { log, player } = setup({ finishes: true });
    const ends: string[] = [];
    player.play('banner', { onEnded: (h) => ends.push(h) });
    vi.advanceTimersByTime(300);
    player.skipAll({ finishStep: true });
    player.skipAll();
    expect(ends).toEqual(['skipped']);
    expect(log.at(-1)).toBe('end text 200');
    vi.advanceTimersByTime(2000);
    expect(ends).toEqual(['skipped']);
    expect(player.pending()).toBe(0);
    const gap: MotionSpec = { id: 'G', maxMs: 400, steps: [{ t: 0, dur: 100, actor: 'tray', do: 'text' }, { t: 300, dur: 100, actor: 'tray', do: 'text' }] };
    player.play(gap, { onEnded: (h) => ends.push(`gap ${h}`) });
    vi.advanceTimersByTime(200);
    player.skipAll({ finishStep: true });
    expect(ends).toEqual(['skipped', 'gap skipped']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('K437 onCut run: a cut finishes the grow, drops the read hold, plays the full shrink, then the beat ends', () => {
    const { log, player } = setup({ finishes: true });
    const ends: string[] = [];
    const reveal: MotionSpec = { ...banner, steps: banner.steps.map((s, i) => (i === 2 ? { ...s, onCut: 'run' } : s)) };
    player.play(reveal, { onEnded: (h) => ends.push(h) });
    vi.advanceTimersByTime(100);
    player.skipAll({ finishStep: true });
    vi.advanceTimersByTime(100);
    expect(log).toEqual(['B move 0+200', 'end move 0', 'B move 1200+200']);
    vi.advanceTimersByTime(199);
    expect(ends).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(log.slice(3)).toEqual(['end move 1200']);
    expect(ends).toEqual(['skipped']);
    vi.advanceTimersByTime(2000);
    expect(log).toHaveLength(4);
    expect(log).not.toContain('B text 200+1000');
  });
});

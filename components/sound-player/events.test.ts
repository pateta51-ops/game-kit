import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext } from './fakeContext';
import { createEventSounds, createSoundPlayer, cuesFor, type CueHit, type CuePlan, type EventSoundsOptions, type SoundTable } from './index';

interface Ev {
  kind: string;
}
const evs = (...kinds: string[]): Ev[] => kinds.map((kind) => ({ kind }));
const plan: CuePlan<Ev> = {
  cueOf: (e) => (e.kind === 'note' ? null : e.kind),
  rank: ['fanfare', 'crash', 'bell', 'knock', 'tick'],
  hides: { crash: ['knock'] },
  alone: ['fanfare'],
};
afterEach(() => vi.restoreAllMocks());

function sounds(o: Partial<EventSoundsOptions<Ev>> = {}) {
  const played: [string, number, number][] = [];
  const clock = { t: 1000 };
  const s = createEventSounds<Ev>({ plan, play: (h, d) => void played.push([h.cue, h.count, d]), now: () => clock.t, ...o });
  return { s, played, clock };
}

describe('sound-player: the cues of one action', () => {
  it('like events are one cue with a count, in the order they first happened; silent events and no events give nothing', () => {
    expect(cuesFor(evs('tick', 'note', 'bell', 'tick', 'tick'), plan)).toEqual<CueHit[]>([
      { cue: 'tick', count: 3 },
      { cue: 'bell', count: 1 },
    ]);
    expect(cuesFor([], plan)).toEqual([]);
    expect(cuesFor(evs('note', 'note'), plan)).toEqual([]);
    expect(cuesFor([{ kind: 'x' }], { cueOf: () => undefined })).toEqual([]);
  });

  it('only the best ranked stay (3, or max), in the order they happened; a cue not ranked is last', () => {
    expect(cuesFor(evs('tick', 'odd', 'knock', 'bell', 'crash2', 'tick'), plan).map((h) => h.cue)).toEqual(['tick', 'knock', 'bell']);
    expect(cuesFor(evs('tick', 'odd', 'knock', 'bell'), { ...plan, max: 1 })).toEqual([{ cue: 'bell', count: 1 }]);
    expect(cuesFor(evs('tick', 'bell'), { ...plan, max: 0 })).toEqual([]);
    expect(cuesFor(evs('b', 'a', 'c', 'd'), { cueOf: (e) => e.kind }).map((h) => h.cue)).toEqual(['b', 'a', 'c']);
  });

  it('a cue hides the cues listed for it, and an alone cue leaves only itself', () => {
    expect(cuesFor(evs('knock', 'knock', 'crash'), plan)).toEqual([{ cue: 'crash', count: 1 }]);
    expect(cuesFor(evs('knock', 'bell'), plan).map((h) => h.cue)).toEqual(['knock', 'bell']);
    expect(cuesFor(evs('tick', 'fanfare', 'crash', 'fanfare'), plan)).toEqual([{ cue: 'fanfare', count: 2 }]);
  });
});

describe('sound-player: events to sounds', () => {
  it('the cues of an action are a gap apart, and the spacing runs on into the next action', () => {
    const { s, played, clock } = sounds();
    s.playEvents(evs('tick', 'bell', 'tick', 'knock'));
    expect(played).toEqual([
      ['tick', 2, 0],
      ['bell', 1, 130],
      ['knock', 1, 260],
    ]);
    clock.t = 1050;
    s.playEvents(evs('crash'));
    expect(played[3]).toEqual(['crash', 1, 340]);
    clock.t = 5000;
    s.playEvents(evs('bell'));
    expect(played[4]).toEqual(['bell', 1, 0]);
    s.playEvents([]);
    expect(played).toHaveLength(5);
  });

  it('the gap may follow a setting', () => {
    let gap = 50;
    const { s, played, clock } = sounds({ gapMs: () => gap });
    s.playEvents(evs('tick', 'bell'));
    gap = 300;
    clock.t = 2000;
    s.playEvents(evs('tick', 'bell'));
    expect(played.map((p) => p[2])).toEqual([0, 50, 0, 300]);
  });

  it('the same cue asked for again within repeatMs is dropped', () => {
    const { s, played, clock } = sounds();
    s.playCue('tick');
    clock.t = 1100;
    s.playCue('tick', 2);
    s.playCue('bell');
    clock.t = 1300;
    s.playCue('tick', 2);
    expect(played).toEqual([
      ['tick', 1, 0],
      ['bell', 1, 30],
      ['tick', 2, 0],
    ]);
  });

  it('no more than maxPerWindow starts in a window, and a start too late is dropped', () => {
    const a = sounds({ maxPerWindow: 2, gapMs: 10, plan: { ...plan, max: 5 } });
    a.s.playEvents(evs('tick', 'bell', 'knock'));
    expect(a.played.map((p) => p[0])).toEqual(['tick', 'bell']);
    a.clock.t = 3000;
    a.s.playEvents(evs('knock'));
    expect(a.played[2]).toEqual(['knock', 1, 0]);

    const b = sounds({ maxLagMs: 200 });
    b.s.playEvents(evs('tick', 'bell', 'knock'));
    expect(b.played.map((p) => p[2])).toEqual([0, 130]);
  });

  it('an alone cue is never dropped', () => {
    const { s, played } = sounds({ maxPerWindow: 1, maxLagMs: 0 });
    s.playEvents(evs('tick'));
    s.playEvents(evs('fanfare'));
    s.playEvents(evs('bell', 'fanfare'));
    expect(played).toEqual([
      ['tick', 1, 0],
      ['fanfare', 1, 130],
      ['fanfare', 1, 260],
    ]);
  });

  it('not ready: nothing plays and no spacing is used; a play that throws stops nothing', () => {
    let ready = false;
    const { s, played } = sounds({ ready: () => ready });
    s.playEvents(evs('tick', 'bell'));
    expect(played).toEqual([]);
    ready = true;
    s.playEvents(evs('tick'));
    expect(played).toEqual([['tick', 1, 0]]);

    const bad = createEventSounds<Ev>({
      plan,
      play: () => {
        throw new Error('no sound');
      },
      now: () => 0,
    });
    expect(() => bad.playEvents(evs('tick', 'bell'))).not.toThrow();
    expect(() => createEventSounds<Ev>({ plan, play: () => undefined }).playCue('tick')).not.toThrow();
  });

  it('with the player: counted and spaced cues reach the audio clock', async () => {
    const table: SoundTable = {
      cues: {
        tick: { files: [], tier: 'quiet', synth: [{ kind: 'tone', from: 600, dur: 0.1, gain: 0.2 }] },
        bell: { files: [], tier: 'normal', synth: [{ kind: 'tone', from: 900, dur: 0.2, gain: 0.2 }] },
      },
    };
    const ctx = new FakeAudioContext();
    const player = createSoundPlayer({ table, context: () => ctx as unknown as AudioContext });
    await player.unlock();
    ctx.currentTime = 1;
    const s = createEventSounds<Ev>({ plan, play: (h, delayMs) => player.play(h.cue, { times: Math.min(h.count, 3), delayMs }), now: () => 0 });
    s.playEvents(evs('tick', 'tick', 'bell'));
    expect(ctx.oscillators.map((o) => o.frequency.valueAt(2))).toEqual([600, 600, 900]);
    expect(ctx.oscillators[0]!.startedAt).toBeCloseTo(1);
    expect(ctx.oscillators[1]!.startedAt).toBeCloseTo(1.1);
    expect(ctx.oscillators[2]!.startedAt).toBeCloseTo(1.13);
    expect(player.count()).toBe(2);
  });
});

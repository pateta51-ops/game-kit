import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, fakeFetch } from './fakeContext.ts';
import { createSoundPlayer, musicTracks, pickTrack, seamLoop, untitledTracks, type SoundTable } from './index.ts';

const files = {
  'scenarios/s1/battle.mp3': 'a',
  'scenarios/s1/battle-2.mp3': 'b',
  'campaigns/c/battle.mp3': 'c',
  'gameplay/battle.mp3': 'd',
  'gameplay/win.mp3': 'e',
  '_pending/scenarios/s2/battle.mp3': 'f',
  'scenarios/s2/_pending/battle.mp3': 'g',
};
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
afterEach(() => vi.restoreAllMocks());

describe('K148 music chain', () => {
  it('the most specific folder with the slot wins; suffixes make the playlist', () => {
    expect(musicTracks(files, 'battle', ['scenarios/s1', 'campaigns/c', 'gameplay'])).toEqual(['a', 'b']);
    expect(musicTracks(files, 'battle', ['scenarios/s9', 'campaigns/c', 'gameplay'])).toEqual(['c']);
    expect(musicTracks(files, 'win', ['scenarios/s1', 'campaigns/c', 'gameplay'])).toEqual(['e']);
    expect(musicTracks(files, 'battle', ['scenarios/s2'])).toEqual([]);
    expect(musicTracks(files, 'bat', ['gameplay'])).toEqual([]);
  });
  it('shuffle never repeats the last track; untitled slotted tracks are listed', () => {
    expect(pickTrack(['a', 'b'], 'a', () => 0)).toBe('b');
    expect(pickTrack(['a'], 'a', () => 0.9)).toBe('a');
    expect(untitledTracks(files, { 'gameplay/battle.mp3': 'x' })).toHaveLength(4);
  });
});

const table: SoundTable = {
  cues: {},
  music: {
    bpm: 96,
    layers: { lead: 'long-lead.ogg' },
    states: { calm: { lead: 1 } },
    once: { theme: 'long-theme.ogg', sting: 'long-sting.ogg', other: 'long-other.ogg' },
    interludes: ['sting'],
  },
  ambience: { bed: 'long-bed.ogg' },
  ambienceSeamMs: 250,
};
class Ctx extends FakeAudioContext {
  override createBuffer(_c: number, length: number, rate: number) {
    return { id: 'seam', duration: length / rate, length, sampleRate: rate, numberOfChannels: 1, getChannelData: () => new Float32Array(length) };
  }
  override decodeAudioData(d: ArrayBuffer) {
    return super.decodeAudioData(d).then((b) => ({ ...b, length: 400, sampleRate: 10, numberOfChannels: 1, getChannelData: () => new Float32Array(400).fill(1) }));
  }
}
async function start() {
  const ctx = new Ctx();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const player = createSoundPlayer({ table, base: 'a/', context: () => ctx as unknown as AudioContext, fetch: fakeFetch().fetch });
  await player.unlock();
  await tick();
  const of = (f: string) => ctx.sources.filter((s) => (s.buffer as { id: string } | null)?.id === `a/${f}`);
  return { ctx, player, of };
}

describe('K148 shelf and seam', () => {
  it('an interlude shelves the track playing; it resumes where it stopped; a third state drops the shelf', async () => {
    const { ctx, player, of } = await start();
    player.setState('theme');
    await tick();
    const first = of('long-theme.ogg')[0]!;
    ctx.currentTime = first.startedAt! + 10;
    player.setState('sting');
    const sting = of('long-sting.ogg')[0]!;
    expect(first.stoppedAt).toBeGreaterThan(ctx.currentTime);
    const wasAt = sting.startedAt!;
    ctx.currentTime = wasAt + 5;
    player.setState('theme');
    const back = of('long-theme.ogg')[1]!;
    expect(back.offset).toBeCloseTo(wasAt - first.startedAt!);
    // theme -> sting -> other -> theme: the shelf is gone, theme restarts
    ctx.currentTime = back.startedAt! + 3;
    player.setState('sting');
    ctx.currentTime += 5;
    player.setState('other');
    ctx.currentTime += 5;
    player.setState('theme');
    expect(of('long-theme.ogg').at(-1)!.offset).toBe(0);
  });
  it('seamLoop shortens the buffer by the seam and joins tail to head', () => {
    const ctx = new Ctx();
    const b = { length: 100, sampleRate: 100, numberOfChannels: 1, duration: 1, getChannelData: () => Float32Array.from({ length: 100 }, (_, i) => i) } as unknown as AudioBuffer;
    const o = seamLoop(ctx as unknown as AudioContext, b, 200);
    expect(o.length).toBe(80);
    expect(seamLoop(ctx as unknown as AudioContext, b, 0)).toBe(b);
  });
  it('the ambience loop is the seamed copy', async () => {
    const { ctx, player } = await start();
    player.setAmbience('bed');
    await tick();
    const s = ctx.sources.filter((x) => x.loop).at(-1)!;
    expect((s.buffer as { id: string }).id).toBe('seam');
    expect((s.buffer as unknown as { length: number }).length).toBe(400 - 3);
  });
});

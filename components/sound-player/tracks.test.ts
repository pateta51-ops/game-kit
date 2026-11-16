import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, fakeFetch } from './fakeContext.ts';
import { createSoundPlayer, type SoundTable } from './index.ts';

const table: SoundTable = {
  cues: {
    menu: { files: ['menu.ogg'], tier: 'loud', bus: 'music' },
    game: { files: ['game.ogg'], tier: 'loud', bus: 'music' },
    tap: { files: ['tap.ogg'], tier: 'quiet' },
  },
};
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
afterEach(() => vi.restoreAllMocks());
async function start() {
  const ctx = new FakeAudioContext();
  const net = fakeFetch();
  const player = createSoundPlayer({ table, base: 'a/', context: () => ctx as unknown as AudioContext, fetch: net.fetch });
  await player.unlock();
  await tick();
  return { ctx, net, player };
}

describe('K212 playTrack picks among files', () => {
  it('plays a random file of the cue, not always the first', async () => {
    const ctx = new FakeAudioContext();
    const net = fakeFetch();
    const t: SoundTable = { cues: { m: { files: ['a.ogg', 'b.ogg', 'c.ogg'], tier: 'loud', bus: 'music' } } };
    const player = createSoundPlayer({ table: t, base: 'a/', context: () => ctx as unknown as AudioContext, fetch: net.fetch, random: () => 0.9 });
    await player.unlock();
    await tick();
    player.playTrack('m');
    await tick();
    expect(ctx.sources.map((x) => x.buffer?.id)).toEqual(['a/c.ogg']);
  });
  const twice = async (files: string[]) => {
    const ctx = new FakeAudioContext();
    const t: SoundTable = { cues: { m: { files, tier: 'loud', bus: 'music' } } };
    const player = createSoundPlayer({ table: t, base: 'a/', context: () => ctx as unknown as AudioContext, fetch: fakeFetch().fetch, random: () => 0.9 });
    await player.unlock();
    await tick();
    for (let i = 0; i < 2; i += 1) {
      player.playTrack('m');
      await tick();
      ctx.end(ctx.sources[i]!);
    }
    return ctx.sources.map((x) => x.buffer?.id);
  };
  it('3+ files: never the same file twice in a row', async () => {
    const ids = await twice(['a.ogg', 'b.ogg', 'c.ogg']);
    expect(ids).toHaveLength(2);
    expect(ids[1]).not.toBe(ids[0]);
  });
  it('2 files: no repeat guard (same rule as the cue pick), a repeat is allowed', async () => {
    expect(await twice(['a.ogg', 'b.ogg'])).toEqual(['a/b.ogg', 'a/b.ogg']);
  });
});

describe('K173 music tracks', () => {
  it('music cues are not decoded at the first tap, other cues are', async () => {
    const { net } = await start();
    expect(net.urls).toEqual(['a/tap.ogg']);
  });
  it('playTrack loads on first play and fades in', async () => {
    const { ctx, net, player } = await start();
    ctx.currentTime = 1;
    player.playTrack('menu', { fadeInMs: 2000 });
    await tick();
    expect(net.urls).toContain('a/menu.ogg');
    const s = ctx.sources.find((x) => x.buffer?.id === 'a/menu.ogg')!;
    expect(ctx.heard(s, 1)).toBe(0);
    expect(ctx.heard(s, 2)).toBeCloseTo(ctx.heard(s, 3) / 2);
    expect(ctx.heard(s, 3)).toBeGreaterThan(0.9);
    expect(player.count()).toBe(1);
  });
  it('crossfade: stopCues fades the old track, onEnd once', async () => {
    const { ctx, player } = await start();
    const ends: string[] = [];
    player.playTrack('menu', { onEnd: (h) => ends.push(h) });
    await tick();
    ctx.currentTime = 5;
    player.stopCues(2000, 'menu');
    player.playTrack('game', { fadeInMs: 2000 });
    await tick();
    const m = ctx.sources.find((x) => x.buffer?.id === 'a/menu.ogg')!;
    const g = ctx.sources.find((x) => x.buffer?.id === 'a/game.ogg')!;
    expect(ends).toEqual(['faded']);
    expect(ctx.heard(m, 7)).toBe(0);
    expect(ctx.heard(g, 5)).toBe(0);
    expect(ctx.heard(g, 7)).toBeGreaterThan(0.9);
  });
  it('onEnd ended when it plays out; dropped before unlock or unknown cue', async () => {
    const { ctx, player } = await start();
    const ends: string[] = [];
    player.playTrack('menu', { onEnd: (h) => ends.push(h) });
    await tick();
    ctx.end(ctx.sources.find((x) => x.buffer?.id === 'a/menu.ogg')!);
    player.playTrack('nope', { onEnd: (h) => ends.push(h) });
    expect(ends).toEqual(['ended', 'dropped']);
    const p2 = createSoundPlayer({ table, silent: true });
    p2.playTrack('menu', { onEnd: (h) => ends.push(h) });
    expect(ends.at(-1)).toBe('dropped');
  });
  it('play of a music cue waits for the decode instead of dropping', async () => {
    const { ctx, player } = await start();
    const ends: string[] = [];
    player.play('menu', { onEnd: (h) => ends.push(h) });
    await tick();
    const m = ctx.sources.filter((x) => x.buffer?.id === 'a/menu.ogg');
    expect(m).toHaveLength(1);
    ctx.end(m[0]!);
    expect(ends).toEqual(['ended']);
  });
  it('a second playTrack of the same cue starts no second copy', async () => {
    const { ctx, player } = await start();
    const ends: string[] = [];
    player.playTrack('menu');
    player.playTrack('menu', { onEnd: (h) => ends.push(h) });
    await tick();
    player.playTrack('menu', { onEnd: (h) => ends.push(h) });
    expect(ctx.sources.filter((x) => x.buffer?.id === 'a/menu.ogg')).toHaveLength(1);
    expect(ends).toEqual(['dropped', 'dropped']);
  });
  it('stopCues during decode cancels the start', async () => {
    const { ctx, player } = await start();
    const ends: string[] = [];
    player.playTrack('menu', { onEnd: (h) => ends.push(h) });
    player.stopCues(500, 'menu');
    await tick();
    expect(ends).toEqual(['faded']);
    expect(ctx.sources.some((x) => x.buffer?.id === 'a/menu.ogg')).toBe(false);
    expect(player.count()).toBe(0);
  });
  it('the voice limit never steals a track', async () => {
    const ctx = new FakeAudioContext();
    const player = createSoundPlayer({ table: { ...table, maxVoices: 1 }, base: 'a/', context: () => ctx as unknown as AudioContext, fetch: fakeFetch().fetch });
    await player.unlock();
    await tick();
    const ends: string[] = [];
    player.playTrack('menu', { onEnd: (h) => ends.push(h) });
    await tick();
    player.play('tap');
    expect(ends).toEqual([]);
    expect(player.count()).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import { FakeAudioContext, fakeFetch } from './fakeContext.ts';
import { createSoundPlayer, type SoundTable } from './index.ts';

const table: SoundTable = {
  cues: {
    tap: { files: ['tap.ogg'], tier: 'quiet' },
    hi: { files: ['hi.ogg'], tier: 'normal', bus: 'voice' },
    bye: { files: ['bye.ogg'], tier: 'normal', bus: 'voice' },
    song: { files: ['a.ogg', 'b.ogg', 'c.ogg'], tier: 'loud', bus: 'music' },
  },
};
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
async function start(extra: Partial<Parameters<typeof createSoundPlayer>[0]> = {}) {
  const ctx = new FakeAudioContext();
  const net = fakeFetch();
  const player = createSoundPlayer({ table, base: 'a/', context: () => ctx as unknown as AudioContext, fetch: net.fetch, ...extra });
  await player.unlock();
  await tick();
  await tick();
  return { ctx, net, player };
}

describe('K213 preload a subset', () => {
  it('default still decodes every non-music cue', async () => {
    const { net } = await start();
    expect([...net.urls].sort()).toEqual(['a/bye.ogg', 'a/hi.ogg', 'a/tap.ogg']);
  });
  it('autoPreload by bus skips the voice bus', async () => {
    const { net, player } = await start({ autoPreload: { buses: ['sounds'] } });
    expect(net.urls).toEqual(['a/tap.ogg']);
    player.play('hi');
    await tick();
    expect(net.urls).toContain('a/hi.ogg');
  });
  it('autoPreload by cue list and by function', async () => {
    expect((await start({ autoPreload: { buses: ['voice'], cues: ['hi'] } })).net.urls).toEqual(['a/hi.ogg']);
    expect((await start({ autoPreload: (k) => k === 'bye' })).net.urls).toEqual(['a/bye.ogg']);
  });
  it('preloadAll(filter) decodes a subset later', async () => {
    const { net, player } = await start({ autoPreload: () => false });
    expect(net.urls).toEqual([]);
    await player.preloadAll({ cues: ['bye', 'song'] });
    expect([...net.urls].sort()).toEqual(['a/a.ogg', 'a/b.ogg', 'a/bye.ogg', 'a/c.ogg']);
  });
});

describe('K213 release buffers', () => {
  it('frees matching cues, returns the count, and reloads on play', async () => {
    const { net, player } = await start();
    expect(player.release({ buses: ['voice'] })).toBe(2);
    expect(player.release({ buses: ['voice'] })).toBe(0);
    const n = net.urls.length;
    player.play('hi');
    await tick();
    expect(net.urls.length).toBe(n + 1);
    expect(net.urls[n]).toBe('a/hi.ogg');
  });
  it('a cue still playing is not cut', async () => {
    const { player } = await start();
    player.play('tap');
    await tick();
    expect(player.release({ cues: ['tap'] })).toBe(1);
    expect(player.count()).toBe(1);
  });
  it('a load in flight when released does not refill the buffers', async () => {
    const ctx = new FakeAudioContext();
    const net = fakeFetch();
    const player = createSoundPlayer({ table, base: 'a/', context: () => ctx as unknown as AudioContext, fetch: net.fetch, autoPreload: () => false });
    await player.unlock();
    const p = player.preloadAll({ cues: ['hi'] });
    expect(player.release({ cues: ['hi'] })).toBe(1);
    await p;
    expect(player.release({ cues: ['hi'] })).toBe(0);
  });
  it('is 0 before the first tap and with silent', () => {
    expect(createSoundPlayer({ table, silent: true }).release(() => true)).toBe(0);
  });
});

describe('K213 playTrack take', () => {
  const heard = async (opts: { take?: number }) => {
    const { ctx, player } = await start({ random: () => 0.9 });
    player.playTrack('song', opts);
    await tick();
    return ctx.sources.map((x) => x.buffer?.id);
  };
  it('plays the given file', async () => {
    expect(await heard({ take: 0 })).toEqual(['a/a.ogg']);
    expect(await heard({ take: 1 })).toEqual(['a/b.ogg']);
  });
  it('default and bad takes keep the random pick', async () => {
    expect(await heard({})).toEqual(['a/c.ogg']);
    expect(await heard({ take: 7 })).toEqual(['a/c.ogg']);
    expect(await heard({ take: 0.5 })).toEqual(['a/c.ogg']);
  });
});

describe('K213 release and playTrack', () => {
  it('playTrack after a release plays again', async () => {
    const { ctx, player } = await start();
    player.playTrack('song', { take: 0 });
    await tick();
    expect(player.release({ cues: ['song'] })).toBe(1);
    player.stopCues(0);
    ctx.currentTime = 10;
    player.playTrack('song', { take: 1 });
    await tick();
    await tick();
    expect(ctx.sources.map((x) => x.buffer?.id)).toEqual(['a/a.ogg', 'a/b.ogg']);
  });
  it('release during a playTrack load still plays', async () => {
    const { ctx, player } = await start();
    player.playTrack('song', { take: 2 });
    expect(player.release({ cues: ['song'] })).toBe(1);
    await tick();
    await tick();
    await tick();
    expect(ctx.sources.map((x) => x.buffer?.id)).toEqual(['a/c.ogg']);
  });
  it('take is remembered as the last pick', async () => {
    const ctx = new FakeAudioContext();
    const t: SoundTable = { cues: { m: { files: ['a.ogg', 'b.ogg', 'c.ogg'], tier: 'loud', bus: 'music' } } };
    const player = createSoundPlayer({ table: t, base: 'a/', context: () => ctx as unknown as AudioContext, fetch: fakeFetch().fetch, random: () => 0.99 });
    await player.unlock();
    await tick();
    player.playTrack('m', { take: 2 });
    await tick();
    player.stopCues(0);
    ctx.currentTime = 10;
    player.playTrack('m');
    await tick();
    expect(ctx.sources.map((x) => x.buffer?.id)).toEqual(['a/c.ogg', 'a/b.ogg']);
  });
});

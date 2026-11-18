import { expect, it } from 'vitest';
import { FakeAudioContext, fakeFetch } from './fakeContext.ts';
import { createSoundPlayer, pickPlaylistTrack, type SoundTable } from './index.ts';

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function start(table: SoundTable) {
  const ctx = new FakeAudioContext();
  const player = createSoundPlayer({ table, context: () => ctx as unknown as AudioContext, fetch: fakeFetch().fetch });
  await player.unlock();
  await tick();
  return { ctx, player };
}

it('steals by priority, then scheduled start, and drops priority 3 at capacity', async () => {
  const { ctx, player } = await start({
    voicePolicy: 'priority', maxVoices: 2, maxPerCue: 3,
    cues: {
      extra: { tier: 'loud', priority: 3, files: ['extra.ogg'] },
      alert: { tier: 'quiet', priority: 1, files: ['alert.ogg'] },
    },
  });
  player.play('extra', { delayMs: 500 });
  player.play('extra', { delayMs: 100 });
  const ends: string[] = [];
  player.play('extra', { delayMs: 200, onEnd: (how) => ends.push(how) });
  expect(ends).toEqual(['dropped']);
  player.play('alert');
  expect(ctx.sources.map((s) => s.stoppedAt !== null)).toEqual([false, true, false]);
  expect(ctx.sources[1]?.stoppedAt).toBeGreaterThanOrEqual(0.15);
  player.play('alert', { delayMs: 50 });
  player.play('alert', { delayMs: 100 });
  expect(ctx.sources.map((s) => s.stoppedAt !== null)).toEqual([true, true, true, false, false]);
});

it('can disable the default duplicate-cue guard', async () => {
  const { ctx, player } = await start({
    dedupeMs: 0,
    cues: { hit: { tier: 'normal', files: ['hit.ogg'] } },
  });
  player.play('hit');
  player.play('hit');
  expect(ctx.sources).toHaveLength(2);
});

it('ducks tracks from the scheduled start and removes a stolen future dip', async () => {
  const { ctx, player } = await start({
    duck: { timing: 'scheduled' },
    cues: {
      music: { tier: 'loud', bus: 'music', files: ['music.ogg'] },
      hit: { tier: 'normal', duckDb: 6, files: ['hit.ogg'] },
      heavy: { tier: 'normal', duckDb: 12, files: ['heavy.ogg'] },
    },
  });
  player.playTrack('music', { loop: true });
  await tick();
  const track = ctx.sources[0]!;
  player.play('heavy', { delayMs: 1200 });
  player.play('hit', { delayMs: 1000, pitch: 12, times: 2 });
  expect(ctx.heard(track, 0.99)).toBeCloseTo(1);
  expect(ctx.heard(track, 1.05)).toBeCloseTo(10 ** (-6 / 20));
  expect(ctx.heard(track, 1.25)).toBeCloseTo(10 ** (-12 / 20));
  player.stopCues(undefined, 'heavy');
  expect(ctx.heard(track, 1.25)).toBeCloseTo(10 ** (-6 / 20));
  expect(ctx.heard(track, 1.95)).toBeCloseTo(1);
});

it.each(['playTrack', 'play'] as const)('applies music volume and mute to %s with scheduled ducking', async (play) => {
  const { ctx, player } = await start({
    duck: { timing: 'scheduled' },
    cues: { music: { tier: 'loud', bus: 'music', files: ['long-music.ogg'] } },
  });
  await player.preload(['music']);
  player[play]('music');
  await tick();
  const source = ctx.sources[0]!;
  player.duck(6);
  player.setVolumes({ music: 0.25 });
  expect(source.out?.out?.gain.valueAt(0.2)).toBeCloseTo(0.25);
  expect(ctx.heard(source, 0.2)).toBeCloseTo(0.25 * 10 ** (-6 / 20));
  ctx.currentTime = 0.2;
  player.setVolumes({ muted: true });
  expect(ctx.heard(source, 0.4)).toBe(0);
  ctx.currentTime = 0.4;
  player.setVolumes({ muted: false });
  expect(ctx.heard(source, 0.6)).toBeCloseTo(0.25 * 10 ** (-6 / 20));
});

it('rotates tracks from a stable seed and position', () => {
  const tracks = ['a', 'b', 'c', 'd'];
  const list = tracks.map((_, i) => pickPlaylistTrack(tracks, 'seed', i));
  expect(new Set(list)).toEqual(new Set(tracks));
  expect(pickPlaylistTrack(tracks, 'seed', tracks.length)).toBe(list[0]);
  expect(pickPlaylistTrack(tracks, 'seed', 2)).toBe(list[2]);
  expect(pickPlaylistTrack([], 'seed', 0)).toBeUndefined();
});

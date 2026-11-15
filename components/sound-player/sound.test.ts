import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkSoundFiles } from './check';
import { FakeAudioContext, fakeFetch } from './fakeContext';
import { createSoundPlayer, MIN_FADE_MS, type SoundPlayerOptions, type SoundTable } from './index';

const table: SoundTable = {
  cues: {
    tap: { files: ['tap-1.ogg', 'tap-2.ogg', 'tap-3.ogg'], tier: 'quiet' },
    step: { files: ['step-1.ogg', 'step-2.ogg'], tier: 'quiet', max: 2 },
    thud: { files: ['thud-1.ogg'], tier: 'normal', gainDb: -6 },
    roar: { files: ['roar-1.ogg'], tier: 'loud' },
    line: { files: ['line-1.ogg'], tier: 'normal', bus: 'voice' },
    later: { files: [], tier: 'quiet' },
    gone: { files: ['gone-1.ogg'], tier: 'quiet' },
  },
  maxVoices: 4,
  duck: { loudDb: 6, voiceDb: 9 },
  music: {
    bpm: 96,
    holdMs: 4000,
    layers: { lead: 'long-lead.ogg', pad: 'long-pad.ogg', drums: 'long-drums.ogg' },
    states: { calm: { lead: 1 }, tense: { lead: 0.8, drums: 1 }, quiet: { pad: 0.5 } },
    once: { won: 'long-won.ogg' },
  },
  ambience: { bed: 'long-bed.ogg', rain: 'long-rain.ogg' },
};
const BAR = 2.5;
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
async function start(o: Partial<SoundPlayerOptions> = {}) {
  const ctx = new FakeAudioContext();
  const net = fakeFetch(['gone-1.ogg']);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const player = createSoundPlayer({ table, base: 'audio/', context: () => ctx as unknown as AudioContext, fetch: net.fetch, random: () => 0, ...o });
  await player.unlock();
  await tick();
  const cues = () => ctx.sources.filter((s) => !s.loop);
  const loop = (file: string) => ctx.sources.filter((s) => s.buffer?.id === `audio/${file}`).at(-1)!;
  return { ctx, net, warn, player, cues, loop };
}
afterEach(() => vi.restoreAllMocks());

describe('sound-player: cues', () => {
  it('a stopped cue is never cut: its gain reaches zero no sooner than 150 ms after the stop', async () => {
    const { ctx, player, cues } = await start();
    ctx.currentTime = 1;
    player.play('thud');
    const s = cues()[0]!;
    expect(ctx.heard(s, 1)).toBeCloseTo(10 ** (-12 / 20));
    ctx.currentTime = 1.2;
    player.stopCues();
    expect(MIN_FADE_MS).toBe(150);
    for (let t = 1.2; t < 1.349; t += 0.01) expect(ctx.heard(s, t)).toBeGreaterThan(0);
    expect(ctx.heard(s, 1.35)).toBe(0);
    expect(s.stoppedAt).toBeGreaterThanOrEqual(1.35);
    expect(player.count()).toBe(0);
  });

  it('a shorter fade than 150 ms is not given, a longer one is', async () => {
    const { ctx, player, cues } = await start();
    player.play('thud');
    player.stopCues(10);
    expect(ctx.heard(cues()[0]!, 0.14)).toBeGreaterThan(0);
    ctx.currentTime = 1;
    player.play('thud');
    player.stopCues(600);
    expect(ctx.heard(cues()[1]!, 1.5)).toBeGreaterThan(0);
    expect(cues()[1]!.stoppedAt).toBeGreaterThanOrEqual(1.6);
  });

  it('a cue left alone plays to the end of its file: no stop is scheduled', async () => {
    const { ctx, player, cues } = await start();
    player.play('tap');
    expect(cues()[0]!.stoppedAt).toBeNull();
    expect(player.count()).toBe(1);
    ctx.end(cues()[0]!);
    expect(player.count()).toBe(0);
  });

  it('never plays the variation it played last', async () => {
    let r = 0;
    const { ctx, player, cues } = await start({ random: () => (r = (r + 0.37) % 1) });
    for (let i = 0; i < 30; i += 1) {
      ctx.currentTime = i;
      player.play('tap');
      ctx.end(cues().at(-1)!);
    }
    const ids = cues().map((s) => s.buffer?.id);
    expect(new Set(ids).size).toBe(3);
    for (let i = 1; i < ids.length; i += 1) expect(ids[i]).not.toBe(ids[i - 1]);
  });

  it('a cue with no file, or whose file is not there, is silent and reported once', async () => {
    const { ctx, warn, player, cues } = await start();
    for (let i = 0; i < 3; i += 1) {
      ctx.currentTime = i;
      player.play('later');
      player.play('gone');
      player.play('nowhere');
    }
    expect(cues()).toHaveLength(0);
    const said = warn.mock.calls.map((c) => String(c[0]));
    expect(said.filter((x) => x === 'sound: cue later is silent')).toHaveLength(1);
    expect(said.filter((x) => x === 'sound: cue gone is silent')).toHaveLength(1);
    expect(said.filter((x) => x === 'sound: cue nowhere is silent')).toHaveLength(1);
  });

  it('caps a cue name: one more fades the oldest out, it is not cut', async () => {
    const { ctx, player, cues } = await start();
    for (let i = 0; i < 3; i += 1) {
      ctx.currentTime = i;
      player.play('step');
    }
    expect(player.count()).toBe(2);
    expect(cues()[0]!.stoppedAt).toBeCloseTo(2.16);
    expect(ctx.heard(cues()[0]!, 2.14)).toBeGreaterThan(0);
    expect(cues()[1]!.stoppedAt).toBeNull();
  });

  it('caps all cues: a louder tier takes the place of the oldest quieter one, a quiet one over the cap is dropped', async () => {
    const { ctx, player, cues } = await start();
    player.play('thud');
    ctx.currentTime = 0.1;
    player.play('roar');
    ctx.currentTime = 0.2;
    player.play('thud');
    ctx.currentTime = 0.3;
    player.play('roar');
    ctx.currentTime = 1;
    player.play('tap');
    expect(cues()).toHaveLength(4);
    player.play('line');
    expect(cues()).toHaveLength(5);
    expect(cues()[0]!.stoppedAt).toBeCloseTo(1.16);
    expect(player.count()).toBe(4);
  });

  it('a cue asked for before it is decoded plays when decoded within the window, else is dropped', async () => {
    const run = async (lateMs: number, takes: number) => {
      const ctx = new FakeAudioContext();
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const player = createSoundPlayer({ table: { ...table, lateMs }, context: () => ctx as unknown as AudioContext, fetch: fakeFetch().fetch });
      await player.unlock();
      player.play('thud', { delayMs: 100 });
      expect(ctx.sources).toHaveLength(0);
      ctx.currentTime = takes;
      await tick();
      return ctx.sources.map((s) => s.startedAt);
    };
    expect(await run(200, 0.05)).toEqual([0.1]);
    expect((await run(200, 0.25))[0]).toBeCloseTo(0.25);
    expect(await run(200, 0.4)).toEqual([]);
    expect(await run(1000, 0.4)).toEqual([0.4]);
  });

  it('preload decodes a list first, also when asked before the first tap', async () => {
    const ctx = new FakeAudioContext();
    const net = fakeFetch();
    const player = createSoundPlayer({ table, context: () => ctx as unknown as AudioContext, fetch: net.fetch });
    await player.preload(['roar', 'thud']);
    expect(net.urls).toEqual([]);
    await player.unlock();
    expect(net.urls.slice(0, 2)).toEqual(['roar-1.ogg', 'thud-1.ogg']);
    await tick();
    net.urls.length = 0;
    await player.preload(['roar']);
    player.play('roar');
    expect(ctx.sources).toHaveLength(1);
    expect(net.urls).toEqual([]);
  });

  it('the same cue twice within 40 ms plays once', async () => {
    const { player, cues } = await start();
    player.play('tap');
    player.play('tap');
    player.play('tap', { delayMs: 100 });
    expect(cues()).toHaveLength(2);
    expect(cues()[1]!.startedAt).toBeCloseTo(0.1);
  });

  it('plays a cue a number of times, one after the other, as one voice', async () => {
    const { ctx, player, cues } = await start();
    ctx.currentTime = 2;
    player.play('step', { times: 3 });
    expect(cues().map((s) => s.startedAt)).toEqual([2, 2.5, 3]);
    expect(cues()[1]!.buffer?.id).not.toBe(cues()[0]!.buffer?.id);
    expect(player.count()).toBe(1);
    ctx.end(cues()[0]!);
    ctx.end(cues()[1]!);
    expect(player.count()).toBe(1);
    ctx.end(cues()[2]!);
    expect(player.count()).toBe(0);
  });
});

describe('sound-player: music', () => {
  it('starts every layer together and fades the first state in', async () => {
    const { ctx, player, loop } = await start();
    player.setState('calm');
    await tick();
    const loops = ctx.sources.filter((s) => s.loop);
    expect(loops).toHaveLength(3);
    expect(new Set(loops.map((s) => s.startedAt)).size).toBe(1);
    expect(ctx.heard(loop('long-lead.ogg'), 0)).toBe(0);
    expect(ctx.heard(loop('long-lead.ogg'), 2)).toBeCloseTo(1);
    expect(ctx.heard(loop('long-drums.ogg'), 5)).toBe(0);
  });

  it('changes state on the next bar, over 2 s, after the hold time', async () => {
    const { ctx, player, loop } = await start();
    player.setState('calm');
    await tick();
    const epoch = loop('long-lead.ogg').startedAt!;
    ctx.currentTime = 1;
    player.setState('tense');
    const at = epoch + 2 * BAR; // the first bar line after the 4 s hold
    expect(ctx.heard(loop('long-drums.ogg'), at)).toBeCloseTo(0);
    expect(ctx.heard(loop('long-drums.ogg'), at + 1)).toBeCloseTo(0.5);
    expect(ctx.heard(loop('long-drums.ogg'), at + 2)).toBeCloseTo(1);
    expect(ctx.heard(loop('long-lead.ogg'), at + 2)).toBeCloseTo(0.8);
    // a change of mind before the bar replaces the waiting state
    ctx.currentTime = 2;
    player.setState('quiet');
    expect(ctx.heard(loop('long-drums.ogg'), at + 2)).toBeCloseTo(0);
    expect(ctx.heard(loop('long-pad.ogg'), at + 2)).toBeCloseTo(0.5);
    expect(ctx.heard(loop('long-lead.ogg'), at + 2)).toBeCloseTo(0);
    // the next one waits for that state's hold
    ctx.currentTime = at + 0.5;
    player.setState(null);
    expect(ctx.heard(loop('long-pad.ogg'), at + 2 * BAR)).toBeCloseTo(0.5);
    expect(ctx.heard(loop('long-pad.ogg'), at + 2 * BAR + 2)).toBeCloseTo(0);
  });

  it('a state asked for before the first tap starts after it', async () => {
    const ctx = new FakeAudioContext();
    const player = createSoundPlayer({ table, context: () => ctx as unknown as AudioContext, fetch: fakeFetch().fetch });
    player.setState('calm');
    player.setAmbience('bed', 0.5);
    player.play('tap');
    await tick();
    expect(ctx.sources).toHaveLength(0);
    await player.unlock();
    await tick();
    expect(ctx.sources.filter((s) => s.loop)).toHaveLength(4);
  });

  it('crossfades the ambience loop and changes its gain', async () => {
    const { ctx, player, loop } = await start();
    player.setAmbience('bed');
    await tick();
    expect(ctx.heard(loop('long-bed.ogg'), 2)).toBeCloseTo(1);
    ctx.currentTime = 10;
    player.setAmbience('bed', 0.5);
    expect(ctx.heard(loop('long-bed.ogg'), 12)).toBeCloseTo(0.5);
    ctx.currentTime = 20;
    player.setAmbience('rain');
    await tick();
    expect(ctx.heard(loop('long-bed.ogg'), 21)).toBeCloseTo(0.25);
    expect(loop('long-bed.ogg').stoppedAt).toBeGreaterThanOrEqual(22);
    expect(ctx.heard(loop('long-rain.ogg'), 22)).toBeCloseTo(1);
  });

  it('ducks the music under a loud cue and under the voice bus, and brings it back', async () => {
    const { ctx, player, cues, loop } = await start();
    player.setState('calm');
    await tick();
    ctx.currentTime = 10;
    player.play('thud');
    expect(ctx.heard(loop('long-lead.ogg'), 11)).toBeCloseTo(1);
    player.play('roar');
    expect(ctx.heard(loop('long-lead.ogg'), 10.15)).toBeCloseTo(10 ** (-6 / 20));
    player.play('line');
    expect(ctx.heard(loop('long-lead.ogg'), 10.15)).toBeCloseTo(10 ** (-9 / 20));
    ctx.currentTime = 11;
    ctx.end(cues()[2]!);
    expect(ctx.heard(loop('long-lead.ogg'), 11.5)).toBeCloseTo(10 ** (-6 / 20));
    ctx.end(cues()[1]!);
    expect(ctx.heard(loop('long-lead.ogg'), 11.5)).toBeCloseTo(1);
    const release = player.duck();
    expect(ctx.heard(loop('long-lead.ogg'), 12)).toBeCloseTo(10 ** (-9 / 20));
    release();
    release();
    expect(ctx.heard(loop('long-lead.ogg'), 12)).toBeCloseTo(1);
    player.duck(3);
    expect(ctx.heard(loop('long-lead.ogg'), 12)).toBeCloseTo(10 ** (-3 / 20));
  });

  it('a cue sets its own duck depth, or none', async () => {
    const t = { ...table, cues: { roar: { ...table.cues.roar!, duckDb: 0 }, tap: { ...table.cues.tap!, duckDb: 12 } } };
    const { ctx, player, loop } = await start({ table: t });
    player.setState('calm');
    await tick();
    ctx.currentTime = 10;
    player.play('roar');
    expect(ctx.heard(loop('long-lead.ogg'), 10.15)).toBeCloseTo(1);
    player.play('tap');
    expect(ctx.heard(loop('long-lead.ogg'), 10.15)).toBeCloseTo(10 ** (-12 / 20));
  });

  it('what ducks is data: the music only, or the ambience too', async () => {
    for (const ambience of [false, true]) {
      const { ctx, player, loop } = await start({ table: { ...table, duck: { loudDb: 6, ambience } } });
      player.setState('calm');
      player.setAmbience('bed');
      await tick();
      ctx.currentTime = 10;
      player.play('roar');
      expect(ctx.heard(loop('long-lead.ogg'), 10.15)).toBeCloseTo(10 ** (-6 / 20));
      expect(ctx.heard(loop('long-bed.ogg'), 10.15)).toBeCloseTo(ambience ? 10 ** (-6 / 20) : 1);
    }
  });

  it('a state with a one-shot tune: it starts with the state, once, and fades when the state is left', async () => {
    const { ctx, player, loop } = await start();
    player.setState('calm');
    await tick();
    const epoch = loop('long-lead.ogg').startedAt!;
    ctx.currentTime = 5;
    player.setState('won');
    const at = epoch + 2 * BAR;
    const tune = loop('long-won.ogg');
    expect(tune.loop).toBe(false);
    expect(tune.startedAt).toBeCloseTo(at);
    expect(ctx.heard(tune, at)).toBeCloseTo(1);
    expect(ctx.heard(loop('long-lead.ogg'), at + 2)).toBeCloseTo(0);
    expect(tune.stoppedAt).toBeNull();
    ctx.currentTime = at + 1;
    player.setState('won');
    expect(ctx.sources.filter((s) => s.buffer?.id === 'audio/long-won.ogg')).toHaveLength(1);
    player.setState('calm');
    const next = at + 2 * BAR;
    expect(ctx.heard(tune, next + 1)).toBeCloseTo(0.5);
    expect(tune.stoppedAt).toBeGreaterThanOrEqual(next + 2);
  });
});

describe('sound-player: volumes, mute, hidden page, silent', () => {
  it('three volumes and a mute, handed to the callback; the mute fades over 150 ms', async () => {
    const stored = vi.fn();
    const { ctx, player, cues } = await start({ volumes: { sounds: 0.5 }, onVolumes: stored });
    expect(player.volumes()).toEqual({ music: 1, sounds: 0.5, voice: 1, muted: false });
    player.play('roar');
    player.play('line');
    expect(ctx.heard(cues()[0]!, 0)).toBeCloseTo(0.5);
    ctx.currentTime = 1;
    player.setVolumes({ voice: 0.25 });
    expect(ctx.heard(cues()[1]!, 1.15)).toBeCloseTo(0.25 * 10 ** (-6 / 20));
    expect(stored).toHaveBeenLastCalledWith({ music: 1, sounds: 0.5, voice: 0.25, muted: false });
    ctx.currentTime = 2;
    player.setVolumes({ muted: true });
    expect(ctx.heard(cues()[0]!, 2.14)).toBeGreaterThan(0);
    expect(ctx.heard(cues()[0]!, 2.15)).toBe(0);
    expect(cues()[0]!.stoppedAt).toBeNull();
    ctx.currentTime = 3;
    player.setVolumes({ muted: false });
    expect(ctx.heard(cues()[0]!, 3.15)).toBeCloseTo(0.5);
  });

  it('starts on the first tap only, and is silent while the page is hidden', async () => {
    const ctx = new FakeAudioContext();
    const made = vi.fn(() => ctx as unknown as AudioContext);
    const heard = new Map<string, () => void>();
    const listens = { addEventListener: (k: string, f: () => void) => void heard.set(k, f), removeEventListener: (k: string) => void heard.delete(k) };
    const doc = { ...listens, hidden: false };
    const player = createSoundPlayer({ table, context: made, fetch: fakeFetch().fetch, target: listens, document: doc });
    expect(made).not.toHaveBeenCalled();
    heard.get('pointerdown')?.();
    await tick();
    expect(made).toHaveBeenCalledTimes(1);
    // suspended later (a phone lock, a call): the next tap resumes it, and so does the page being seen again
    await ctx.suspend();
    heard.get('keydown')?.();
    expect(ctx.state).toBe('running');
    await ctx.suspend();
    heard.get('visibilitychange')?.();
    expect(ctx.state).toBe('running');
    expect(made).toHaveBeenCalledTimes(1);
    player.play('tap');
    const s = ctx.sources[0]!;
    ctx.currentTime = 1;
    doc.hidden = true;
    heard.get('visibilitychange')?.();
    expect(ctx.heard(s, 1.1)).toBeGreaterThan(0);
    expect(ctx.heard(s, 1.15)).toBe(0);
    player.play('thud');
    expect(ctx.sources).toHaveLength(1);
    ctx.currentTime = 2;
    doc.hidden = false;
    heard.get('visibilitychange')?.();
    expect(ctx.heard(s, 2.15)).toBeGreaterThan(0);
    player.dispose();
    expect(heard.size).toBe(0);
  });

  it('silent: no context is made and every call is safe', async () => {
    const made = vi.fn();
    const player = createSoundPlayer({ table, silent: true, context: made });
    await player.unlock();
    player.play('tap');
    player.setState('calm');
    player.setAmbience('bed');
    player.setVolumes({ muted: true });
    player.stopCues();
    player.duck()();
    expect(made).not.toHaveBeenCalled();
    expect(player.count()).toBe(0);
    expect(player.volumes().muted).toBe(true);
  });
});

describe('sound-player: the files check', () => {
  it('every cue and layer has its files or is listed as missing; formats and sizes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sound-check-'));
    try {
      const put = (f: string, bytes = 10) => fs.writeFileSync(path.join(dir, f), Buffer.alloc(bytes));
      for (const c of Object.values(table.cues)) for (const f of c.files) if (!f.startsWith('gone')) put(f);
      for (const f of ['long-lead.ogg', 'long-pad.ogg', 'long-bed.ogg', 'long-rain.ogg', 'long-won.ogg']) put(f);
      expect(checkSoundFiles(table, dir, { missing: ['later', 'gone', 'layer:drums'] })).toEqual([]);
      expect(checkSoundFiles(table, dir)).toEqual([
        'later: no file, and not listed as missing',
        'gone: file not found: gone-1.ogg',
        'layer:drums: file not found: long-drums.ogg',
      ]);
      put('long-drums.ogg', 50);
      put('big.wav', 30);
      const bad = checkSoundFiles({ ...table, cues: { big: { files: ['big.wav'], tier: 'loud' } }, music: { ...table.music!, states: { calm: { organ: 1 } } } }, dir, {
        missing: ['layer:drums', 'old'],
        maxCueBytes: 20,
        maxLoopBytes: 40,
      });
      expect(bad).toEqual([
        'big: big.wav is not one of .ogg .opus .webm .mp3 .m4a',
        'big: big.wav is 30 bytes, over 20',
        'layer:drums: listed as missing, but its files are there',
        'layer:drums: long-drums.ogg is 50 bytes, over 40',
        'old: listed as missing, but not in the table',
        'state calm: layer organ is not in the table',
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
});

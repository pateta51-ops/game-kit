import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkSoundFiles } from './check';
import { FakeAudioContext, fakeFetch } from './fakeContext';
import { createSoundPlayer, MIN_FADE_MS, synthLength, type EndHow, type SoundTable } from './index';

const table: SoundTable = {
  cues: {
    blip: { files: [], tier: 'normal', synth: [{ kind: 'tone', wave: 'triangle', from: 440, to: 880, dur: 0.3, gain: 0.5 }] },
    thump: { files: [], tier: 'loud', synth: [{ kind: 'noise', band: 300, q: 2, dur: 0.2, gain: 0.4 }] },
    chord: {
      files: [],
      tier: 'quiet',
      synth: [
        { kind: 'tone', from: 300, dur: 0.1, gain: 0.2 },
        { kind: 'noise', band: 900, at: 0.1, dur: 0.1, gain: 0.2 },
      ],
    },
    spare: { files: ['gone-1.ogg'], tier: 'normal', synth: [{ kind: 'tone', from: 200, dur: 0.1, gain: 0.3 }] },
    filed: { files: ['filed-1.ogg'], tier: 'normal', synth: [{ kind: 'tone', from: 200, dur: 0.1, gain: 0.3 }] },
    empty: { files: [], tier: 'quiet', synth: [] },
  },
};
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
async function start() {
  const ctx = new FakeAudioContext();
  const net = fakeFetch(['gone-1.ogg']);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const player = createSoundPlayer({ table, context: () => ctx as unknown as AudioContext, fetch: net.fetch, random: () => 0 });
  await player.unlock();
  await tick();
  ctx.currentTime = 1;
  return { ctx, net, warn, player };
}
const NORMAL = 10 ** (-6 / 20);
afterEach(() => vi.restoreAllMocks());

describe('sound-player: synthesised cues', () => {
  it('a cue with no file plays its tone: the pitch glides, the gain rises in 5 ms and fades by the end, and it ends once', async () => {
    const { ctx, net, warn, player } = await start();
    const ends: EndHow[] = [];
    expect(player.canPlay('blip')).toBe(true);
    player.play('blip', { onEnd: (h) => ends.push(h) });
    expect(ctx.oscillators).toHaveLength(1);
    const osc = ctx.oscillators[0]!;
    expect(osc.type).toBe('triangle');
    expect(osc.startedAt).toBe(1);
    expect(osc.stoppedAt).toBeCloseTo(1.32);
    expect(osc.frequency.valueAt(1)).toBe(440);
    expect(osc.frequency.valueAt(1.15)).toBeCloseTo(440 * Math.SQRT2);
    expect(osc.frequency.valueAt(1.3)).toBe(880);
    expect(ctx.heard(osc, 1)).toBeLessThan(0.001);
    expect(ctx.heard(osc, 1 + 0.005)).toBeCloseTo(0.5 * NORMAL);
    expect(ctx.heard(osc, 1.15)).toBeLessThan(ctx.heard(osc, 1.05));
    expect(ctx.heard(osc, 1.3)).toBeLessThan(0.001);
    expect(player.count()).toBe(1);
    ctx.end(osc);
    expect(ends).toEqual(['ended']);
    expect(player.count()).toBe(0);
    expect(net.urls).toEqual(['gone-1.ogg', 'filed-1.ogg']);
    expect(warn.mock.calls.map((c) => String(c[0])).filter((x) => x.includes('blip'))).toEqual([]);
  });

  it('a noise voice is the same looped noise through a band-pass filter', async () => {
    const { ctx, player } = await start();
    player.play('thump');
    ctx.currentTime = 2;
    player.play('thump');
    const [a, b] = ctx.sources.filter((s) => s.loop);
    expect(a!.buffer).toBe(b!.buffer);
    expect(a!.buffer!.duration).toBe(0.5);
    expect(ctx.filters).toHaveLength(2);
    const f = ctx.filters[0]!;
    expect(f.type).toBe('bandpass');
    expect(f.frequency.valueAt(1)).toBe(300);
    expect(f.Q.valueAt(1)).toBe(2);
    expect(a!.startedAt).toBe(1);
    expect(ctx.heard(a!, 1 + 0.005)).toBeCloseTo(0.4);
    expect(ctx.oscillators).toHaveLength(0);
  });

  it('the synth is the fallback of a file that does not load, and is not used when the file is there', async () => {
    const { ctx, player } = await start();
    expect(player.canPlay('spare')).toBe(true);
    player.play('spare');
    expect(ctx.oscillators).toHaveLength(1);
    player.play('filed');
    expect(ctx.oscillators).toHaveLength(1);
    expect(ctx.sources.at(-1)!.buffer?.id).toBe('filed-1.ogg');
  });

  it('times repeats the whole cue back to back as one voice; each voice starts at its own time', async () => {
    const { ctx, player } = await start();
    const ends: EndHow[] = [];
    expect(synthLength(table.cues['chord']!.synth!)).toBeCloseTo(0.2);
    expect(synthLength([])).toBe(0);
    player.play('chord', { times: 2, delayMs: 500, onEnd: (h) => ends.push(h) });
    expect(ctx.oscillators).toHaveLength(2);
    expect(ctx.oscillators[0]!.startedAt).toBeCloseTo(1.5);
    expect(ctx.oscillators[1]!.startedAt).toBeCloseTo(1.7);
    const noises = ctx.sources.filter((s) => s.loop);
    expect(noises[0]!.startedAt).toBeCloseTo(1.6);
    expect(noises[1]!.startedAt).toBeCloseTo(1.8);
    expect(player.count()).toBe(1);
    for (const s of ctx.sources.slice(0, -1)) ctx.end(s);
    expect(ends).toEqual([]);
    ctx.end(ctx.sources.at(-1)!);
    expect(ends).toEqual(['ended']);
  });

  it('a voice that cannot be made is skipped and leaves nothing connected; with none made the cue is dropped', async () => {
    const { ctx, player } = await start();
    const ends: EndHow[] = [];
    ctx.createOscillator = () => {
      throw new Error('no oscillator');
    };
    const before = ctx.gains.length;
    player.play('chord', { onEnd: (h) => ends.push(h) });
    expect(ctx.sources.filter((s) => s.loop)).toHaveLength(1);
    expect(ctx.gains.slice(before).filter((g) => !g.connected)).toHaveLength(1);
    expect(player.count()).toBe(1);
    player.play('blip', { onEnd: (h) => ends.push(h) });
    expect(ends).toEqual(['dropped']);
    expect(player.count()).toBe(1);
  });

  it('a stopped synth cue fades over 150 ms before its sources stop', async () => {
    const { ctx, player } = await start();
    const ends: EndHow[] = [];
    player.play('blip', { onEnd: (h) => ends.push(h) });
    const osc = ctx.oscillators[0]!;
    ctx.currentTime = 1.05;
    player.stopCues();
    expect(ends).toEqual(['faded']);
    expect(ctx.heard(osc, 1.1)).toBeGreaterThan(0);
    expect(ctx.heard(osc, 1.05 + MIN_FADE_MS / 1000)).toBeCloseTo(0);
    expect(osc.stoppedAt).toBeGreaterThanOrEqual(1.05 + MIN_FADE_MS / 1000);
  });

  it('a synth cue stopped near its end stops no later than its own end', async () => {
    const { ctx, player } = await start();
    player.play('blip');
    ctx.currentTime = 1.25;
    player.stopCues();
    expect(ctx.oscillators[0]!.stoppedAt).toBeCloseTo(1.32);
  });

  it('nothing is made while the context is not running, before the first tap, or for an empty voice list', async () => {
    const { ctx, warn, player } = await start();
    const ends: EndHow[] = [];
    (ctx as { state: string }).state = 'interrupted';
    player.play('blip', { onEnd: (h) => ends.push(h) });
    ctx.state = 'running';
    player.play('empty', { onEnd: (h) => ends.push(h) });
    expect(player.canPlay('empty')).toBe(false);
    const quiet = createSoundPlayer({ table, silent: true });
    quiet.play('blip', { onEnd: (h) => ends.push(h) });
    expect(quiet.canPlay('blip')).toBe(true);
    expect(ends).toEqual(['dropped', 'dropped', 'dropped']);
    expect(ctx.oscillators).toHaveLength(0);
    expect(warn.mock.calls.map((c) => String(c[0]))).toContain('sound: cue empty is silent');
  });

  it('a loud synth cue ducks the music like a file', async () => {
    const { ctx, player } = await start();
    const release = player.duck(3);
    release();
    const ducker = ctx.gains.find((g) => g.gain.events.length > 0 && g.gain.events.at(-1)!.v === 1)!;
    player.play('thump');
    expect(ducker.gain.valueAt(1 + MIN_FADE_MS / 1000)).toBeCloseTo(10 ** (-8 / 20));
  });

  it('the file check asks no file of a cue with voices', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'synth-'));
    try {
      fs.writeFileSync(path.join(dir, 'filed-1.ogg'), 'x');
      expect(checkSoundFiles(table, dir)).toEqual(['spare: file not found: gone-1.ogg', 'empty: no file, and not listed as missing']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

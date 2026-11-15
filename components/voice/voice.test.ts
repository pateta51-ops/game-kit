import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, fakeFetch } from '../sound-player/fakeContext';
import { createSoundPlayer } from '../sound-player';
import { checkVoiceFiles } from './check';
import { createVoice, voiceCue, voiceCues, type VoiceOptions, type VoiceTable } from './index';

const table: VoiceTable = {
  lines: {
    hello: { files: ['hello.ogg'] },
    bye: { files: ['bye.ogg'], busy: 'wait' },
    pair: { files: ['p1.ogg', 'p2.ogg'], busy: 'wait' },
    once: { files: ['once.ogg'], limit: { once: true } },
    other: { files: ['other.ogg'], limit: { every: 2 } },
    count: { files: ['count.ogg'], busy: 'wait' },
  },
  parts: { three: 'n3.ogg', four: 'n4.ogg' },
};

function fake(o: Partial<VoiceOptions> & { dead?: string[] } = {}) {
  const started: { cue: string; delayMs?: number | undefined; end: (how?: 'ended' | 'faded' | 'dropped') => void }[] = [];
  const vols: unknown[] = [];
  const player = {
    canPlay: (cue: string) => !(o.dead ?? []).includes(cue.replace('voice:', '')),
    play: (cue: string, p: { delayMs?: number; onEnd?: (how: 'ended' | 'faded' | 'dropped') => void } = {}) => {
      started.push({ cue, delayMs: p.delayMs, end: (how = 'ended') => p.onEnd?.(how) });
    },
    setVolumes: (v: unknown) => vols.push(v),
  };
  const voice = createVoice({ table, player, ...o });
  return { started, vols, voice, files: () => started.map((s) => s.cue.replace('voice:', '')) };
}
afterEach(() => vi.useRealTimers());

describe('voice', () => {
  it('plays one line at a time: a second line is dropped, or waits and plays after the first has ended', () => {
    const { voice, started, files } = fake();
    expect(voice.play('hello')).toBe(true);
    expect(voice.play('other')).toBe(false);
    expect(voice.play('bye')).toBe(true);
    expect(voice.waiting()).toBe(1);
    expect(files()).toEqual(['hello.ogg']);
    started[0]!.end();
    expect(files()).toEqual(['hello.ogg', 'bye.ogg']);
    expect(voice.playing()).toBe('bye');
    started[1]!.end();
    expect(voice.playing()).toBeNull();
  });

  it('never plays the same line twice in a row, a waiting one included', () => {
    const { voice, started, files } = fake();
    voice.play('bye');
    expect(voice.play('bye')).toBe(true);
    started[0]!.end();
    expect(files()).toEqual(['bye.ogg']);
    expect(voice.playing()).toBeNull();
    expect(voice.play('bye')).toBe(false);
    expect(voice.play('hello')).toBe(true);
    started[1]!.end();
    expect(voice.play('bye')).toBe(true);
  });

  it('plays the files of a line back to back with the gap, each after the end of the one before', () => {
    const { voice, started, files } = fake({ gapMs: 120 });
    voice.play('pair');
    expect(files()).toEqual(['p1.ogg']);
    started[0]!.end();
    expect(files()).toEqual(['p1.ogg', 'p2.ogg']);
    expect(started[1]!.delayMs).toBe(120);
    expect(voice.playing()).toBe('pair');
    started[1]!.end();
    expect(voice.playing()).toBeNull();
  });

  it('assembles a line from parts at play time', () => {
    const { voice, started, files } = fake();
    voice.play('count', { parts: ['three', 'four'] });
    started[0]!.end();
    started[1]!.end();
    expect(files()).toEqual(['count.ogg', 'n3.ogg', 'n4.ogg']);
  });

  it('a line with an unknown part, or a file that cannot sound, is wholly silent: not even its first file starts', () => {
    const { voice, started } = fake({ dead: ['n4.ogg', 'p2.ogg'] });
    expect(voice.play('count', { parts: ['three', 'nope'] })).toBe(false);
    expect(voice.play('count', { parts: ['three', 'four'] })).toBe(false);
    expect(voice.play('pair')).toBe(false);
    expect(started).toHaveLength(0);
    expect(voice.counts()).toEqual({});
  });

  it('a file that is faded or dropped ends the line: the next file does not start and the next line goes on', () => {
    const { voice, started, files } = fake();
    voice.play('pair');
    voice.play('bye');
    started[0]!.end('faded');
    expect(files()).toEqual(['p1.ogg', 'bye.ogg']);
    started[1]!.end('dropped');
    expect(voice.playing()).toBeNull();
    voice.play('pair');
    started.at(-1)!.end('dropped');
    expect(files().at(-1)).toBe('p1.ogg');
    expect(voice.playing()).toBeNull();
  });

  it('a line dropped by the gate, by never-twice or by a busy voice does not use up its once or every count', () => {
    let ok = false;
    const { voice, started } = fake({ mayPlay: () => ok });
    expect(voice.play('once')).toBe(false);
    expect(voice.counts()).toEqual({});
    ok = true;
    expect(voice.play('once')).toBe(true);
    expect(voice.counts().once).toBe(1);
    expect(voice.play('other')).toBe(false);
    expect(voice.counts().other).toBeUndefined();
    started[0]!.end();
    expect(voice.play('other')).toBe(true);
    expect(voice.counts().other).toBe(1);
  });

  it('a line with the once limit plays one time per game; reset gives it back', () => {
    const { voice, started } = fake();
    expect(voice.play('once')).toBe(true);
    started[0]!.end();
    voice.play('hello');
    started[1]!.end();
    expect(voice.play('once')).toBe(false);
    voice.reset();
    expect(voice.play('once')).toBe(true);
  });

  it('a line limited to every other time plays on the 1st, 3rd, 5th ask; the counts can be saved and restored', () => {
    const { voice, started } = fake();
    const got: boolean[] = [];
    for (let i = 0; i < 5; i += 1) {
      got.push(voice.play('other'));
      started.at(-1)?.end();
      voice.play('hello');
      started.at(-1)?.end();
    }
    expect(got).toEqual([true, false, true, false, true]);
    expect(voice.counts().other).toBe(5);
    const again = fake({ counts: voice.counts() });
    expect(again.voice.play('other')).toBe(false);
  });

  it('asks the game gate before each line, a waiting line too, and drops a refused one', () => {
    let ok = true;
    const asked: string[] = [];
    const { voice, started, files } = fake({ mayPlay: (id) => (asked.push(id), ok) });
    voice.play('hello');
    voice.play('bye');
    ok = false;
    started[0]!.end();
    expect(files()).toEqual(['hello.ogg']);
    expect(voice.waiting()).toBe(0);
    expect(voice.play('pair')).toBe(false);
    ok = true;
    expect(voice.play('pair')).toBe(true);
    expect(asked).toEqual(['hello', 'bye', 'pair', 'pair']);
  });

  it('off: nothing starts and the queue is emptied; the line playing is not cut; the volume goes to the voice bus', () => {
    const { voice, started, vols } = fake();
    voice.play('hello');
    voice.play('bye');
    voice.setEnabled(false);
    expect(voice.waiting()).toBe(0);
    expect(voice.play('pair')).toBe(false);
    expect(started).toHaveLength(1);
    voice.setVolume(0.4);
    expect(vols).toEqual([{ voice: 0.4 }]);
    expect(voice.enabled()).toBe(false);
  });

  it('a player that never reports an end frees the queue after the timeout', () => {
    vi.useFakeTimers();
    const { voice, files } = fake({ fileTimeoutMs: 1000 });
    voice.play('hello');
    voice.play('bye');
    vi.advanceTimersByTime(1100);
    expect(files()).toEqual(['hello.ogg', 'bye.ogg']);
    vi.advanceTimersByTime(1100);
    expect(voice.playing()).toBeNull();
  });

  it('voiceCues puts every file of the lines and parts on the voice bus', () => {
    const c = voiceCues(table);
    expect(c[voiceCue('hello.ogg')]).toEqual({ files: ['hello.ogg'], tier: 'normal', bus: 'voice' });
    expect(Object.keys(c)).toContain('voice:n4.ogg');
  });
});

describe('voice on the sound player', () => {
  async function rig(missing: string[]) {
    const ctx = new FakeAudioContext();
    const net = fakeFetch(missing);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const player = createSoundPlayer({ table: { cues: voiceCues(table) }, base: 'v/', context: () => ctx as unknown as AudioContext, fetch: net.fetch });
    await player.unlock();
    await new Promise((r) => setTimeout(r, 0));
    return { ctx, voice: createVoice({ table, player }), src: () => ctx.sources.filter((s) => !s.loop) };
  }
  it('a line moves on when the sound player says each file ended, never cutting one', async () => {
    const { ctx, voice, src } = await rig([]);
    voice.play('pair');
    expect(src()).toHaveLength(1);
    expect(src()[0]!.stoppedAt).toBeNull();
    ctx.end(src()[0]!);
    expect(src()).toHaveLength(2);
    ctx.end(src()[1]!);
    expect(voice.playing()).toBeNull();
    expect(src().every((s) => s.stoppedAt === null)).toBe(true);
  });

  it('a line with a file that did not decode is wholly silent', async () => {
    const { voice, src } = await rig(['p2.ogg']);
    expect(voice.play('pair')).toBe(false);
    expect(src()).toHaveLength(0);
    expect(voice.play('hello')).toBe(true);
  });
});

describe('checkVoiceFiles', () => {
  it('reports a missing file, accepts a listed one, and a line with no file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-'));
    try {
      for (const f of ['hello.ogg', 'bye.ogg', 'p1.ogg', 'p2.ogg', 'once.ogg', 'other.ogg', 'count.ogg', 'n3.ogg']) fs.writeFileSync(path.join(dir, f), 'x');
      const bad = checkVoiceFiles({ ...table, lines: { ...table.lines, empty: { files: [] } } }, dir);
      expect(bad).toContain('n4.ogg: file not found: n4.ogg');
      expect(bad).toContain('line empty: no files');
      expect(checkVoiceFiles(table, dir, { missing: ['n4.ogg'] })).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkFrontSilence, decodeWav } from './check';
import { createTrailSounds, mp3Frames, resolveCue, trimMp3, type SoundTable } from './index';

describe('sound-player: trail, chain, front silence, trim (K147)', () => {
  it('cues come only from actions added to the trail: not on load, undo or a rewritten trail', () => {
    const got: string[][] = [];
    const t = createTrailSounds<string>({ onNew: (a) => void got.push([...a]) });
    t.feed(['a', 'b']);
    t.feed(['a', 'b', 'c', 'd']);
    t.feed(['a', 'b']);
    t.feed(['a', 'b']);
    t.feed(['a', 'x']);
    t.feed(['a', 'x', 'y']);
    t.reset();
    t.feed(['a', 'x', 'y', 'z']);
    expect(got).toEqual([['c', 'd'], ['y']]);
  });

  it('resolveCue takes the first cue the player can play', () => {
    const ok = (c: string): boolean => c !== 'own';
    expect(resolveCue(['own', null, 'trait', 'generic'], ok)).toBe('trait');
    expect(resolveCue([undefined, 'own'], ok)).toBeNull();
    expect(resolveCue([], ok)).toBeNull();
  });

  const wav = (lead: number): Buffer => {
    const n = 4410;
    const b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0, 'latin1');
    b.write('WAVE', 8, 'latin1');
    b.write('fmt ', 12, 'latin1');
    b.writeUInt32LE(16, 16);
    b.writeUInt16LE(1, 20);
    b.writeUInt16LE(1, 22);
    b.writeUInt32LE(44100, 24);
    b.writeUInt16LE(16, 34);
    b.write('data', 36, 'latin1');
    b.writeUInt32LE(n * 2, 40);
    for (let i = lead; i < n; i++) b.writeInt16LE(16000, 44 + i * 2);
    return b;
  };

  it('front silence over 60 ms is reported; a wav is decoded', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snd-'));
    fs.writeFileSync(path.join(dir, 'a.wav'), wav(0));
    fs.writeFileSync(path.join(dir, 'b.wav'), wav(4000));
    fs.writeFileSync(path.join(dir, 'c.ogg'), 'x');
    const table: SoundTable = { cues: { a: { files: ['a.wav'], tier: 'normal' }, b: { files: ['b.wav'], tier: 'normal' }, c: { files: ['c.ogg'], tier: 'normal' } } };
    expect(decodeWav(wav(0))?.samples.length).toBe(4410);
    expect(checkFrontSilence(table, dir)).toEqual(['b: b.wav is silent for 91 ms at the start, over 60']);
    fs.rmSync(dir, { recursive: true });
  });

  it('trims an mp3 by whole frames, dropping the tag and the Xing frame', () => {
    const frame = (xing: boolean, fill: number): Buffer => {
      const f = Buffer.alloc(417, fill);
      f.set([0xff, 0xfb, 0x90, 0x00], 0);
      if (xing) f.write('Xing', 36, 'latin1');
      return f;
    };
    const id3 = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 4, 1, 2, 3, 4]);
    const file = Buffer.concat([id3, frame(true, 0), frame(false, 1), frame(false, 2), frame(false, 3)]);
    expect(mp3Frames(file).length).toBe(4);
    const out = trimMp3(file, 1, 1);
    expect(out.length).toBe(417);
    expect(out[100]).toBe(2);
    expect(trimMp3(file).length).toBe(417 * 3);
    expect(mp3Frames(Buffer.from('nope'))).toEqual([]);
    const mono = frame(false, 0);
    mono.write('Info', 21, 'latin1');
    expect(trimMp3(Buffer.concat([mono, frame(false, 1)])).length).toBe(417);
    const noFmt = wav(0);
    noFmt.write('junk', 12, 'latin1');
    expect(decodeWav(noFmt)).toBeNull();
    const zero = wav(0);
    zero.writeUInt16LE(0, 34);
    expect(decodeWav(zero)).toBeNull();
  });
});

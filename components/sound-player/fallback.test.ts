import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkSoundFiles } from './check.ts';
import { FakeAudioContext, fakeFetch } from './fakeContext.ts';
import { createSoundPlayer, type SoundPlayerOptions, type SoundTable } from './index.ts';

const table: SoundTable = {
  cues: { tap: { files: ['tap.webm'], tier: 'quiet' }, theme: { files: ['theme.webm'], tier: 'normal', bus: 'music' } },
  music: { bpm: 96, holdMs: 4000, layers: { lead: 'long-lead.webm' }, states: { calm: { lead: 1 } }, once: { won: 'long-won.webm' } },
  ambience: { bed: 'long-bed.webm' },
};
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
async function start(missing: string[] = [], o: Partial<SoundPlayerOptions> = {}) {
  const ctx = new FakeAudioContext();
  const net = fakeFetch(missing);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const player = createSoundPlayer({ table, base: 'a/', context: () => ctx as unknown as AudioContext, fetch: net.fetch, random: () => 0, ...o });
  await player.unlock();
  await tick();
  return { ctx, net, warn, player };
}
const noWebm = () =>
  vi.stubGlobal(
    'Audio',
    class {
      canPlayType(m: string) {
        return m.includes('webm') ? '' : 'maybe';
      }
    },
  );
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('sound-player: format fallback (K508)', () => {
  it('a browser that cannot play webm loads the m4a and never fetches the webm: cue, layer, once, ambience', async () => {
    noWebm();
    const { net, player } = await start();
    player.setAmbience('bed');
    player.setMusic('calm');
    await tick();
    expect(net.urls.filter((u) => u.endsWith('.webm'))).toEqual([]);
    expect(net.urls).toContain('a/long-lead.m4a');
    expect(net.urls).toContain('a/long-won.m4a');
    expect(net.urls).toContain('a/long-bed.m4a');
    expect(net.urls.filter((u) => u === 'a/tap.m4a')).toHaveLength(1);
  });
  it('a webm that fails to fetch is replaced by its m4a (one take)', async () => {
    const { net, player, ctx } = await start(['tap.webm']);
    player.play('tap');
    expect(net.urls.filter((u) => u.startsWith('a/tap'))).toEqual(['a/tap.webm', 'a/tap.m4a']);
    expect(ctx.sources.some((s) => s.buffer?.id === 'a/tap.m4a')).toBe(true);
  });
  it('a webm that fails to decode is replaced by its m4a', async () => {
    const { net, player, ctx } = await start([], { table: { cues: { tap: { files: ['broken.webm'], tier: 'quiet' } } } });
    player.play('tap');
    expect(net.urls).toEqual(['a/broken.webm', 'a/broken.m4a']);
    expect(ctx.sources).toHaveLength(0);
  });
  it('a missing m4a only warns, and fallback {} turns it off', async () => {
    noWebm();
    const a = await start(['.m4a']);
    expect(a.warn).toHaveBeenCalled();
    const b = await start([], { fallback: {} });
    expect(b.net.urls).toContain('a/tap.webm');
  });
  it('a custom map is used', async () => {
    const { net } = await start(['tap.webm'], { fallback: { '.webm': '.mp3' } });
    expect(net.urls).toContain('a/tap.mp3');
  });
});

describe('sound-player: files check (K508)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'k508-'));
  const put = (f: string, bytes = 10) => fs.writeFileSync(path.join(dir, f), Buffer.alloc(bytes));
  afterEach(() => {
    for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f));
  });
  it('a music-bus cue is held to maxTrackBytes, defaulting to maxLoopBytes then 4 MB; other cues keep the cue limit', () => {
    put('theme.webm', 500_000);
    put('tap.webm', 500_000);
    const t: SoundTable = { cues: table.cues };
    expect(checkSoundFiles(t, dir)).toEqual(['tap: tap.webm is 500000 bytes, over 400000']);
    expect(checkSoundFiles(t, dir, { maxLoopBytes: 100 })).toContain('theme: theme.webm is 500000 bytes, over 100');
    expect(checkSoundFiles(t, dir, { maxLoopBytes: 100, maxTrackBytes: 600_000 }).some((l) => l.startsWith('theme:'))).toBe(false);
  });
  it('fallback reports a file with no sibling', () => {
    put('tap.webm');
    put('theme.webm');
    put('theme.m4a');
    const t: SoundTable = { cues: table.cues };
    expect(checkSoundFiles(t, dir)).toEqual([]);
    expect(checkSoundFiles(t, dir, { fallback: { '.webm': '.m4a' } })).toEqual(['tap: tap.webm has no .m4a sibling']);
  });
});

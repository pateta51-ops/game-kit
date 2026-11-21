import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, fakeFetch } from './fakeContext.ts';
import { createSoundPlayer, type SoundTable } from './index.ts';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
afterEach(() => vi.restoreAllMocks());

const table: SoundTable = {
  cues: {},
  music: {
    bpm: 96,
    fadeMs: 2000,
    stateFadeMs: { victory: 500, menu: 4000 },
    layers: { pad: 'long-pad.ogg' },
    states: { menu: { pad: 1 }, play: { pad: 1 } },
    once: { victory: 'long-victory.ogg', defeat: 'long-defeat.ogg', sting: 'long-sting.ogg' },
    then: { victory: 'menu', defeat: null, sting: 'play' },
    interludes: ['sting'],
  },
};
async function start(onMusicEnd?: (s: string) => void) {
  const ctx = new FakeAudioContext();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const player = createSoundPlayer({ table, base: 'a/', context: () => ctx as unknown as AudioContext, fetch: fakeFetch().fetch, ...(onMusicEnd ? { onMusicEnd } : {}) });
  await player.unlock();
  player.setState('play');
  await tick();
  const of = (f: string) => ctx.sources.filter((s) => (s.buffer as { id: string } | null)?.id === `a/${f}`);
  const pad = of('long-pad.ogg')[0]!;
  return { ctx, player, of, pad };
}

describe('K510 music: per-state fades and chains', () => {
  it('K510 the entered state own fade time is used, not fadeMs', async () => {
    const { ctx, player, of } = await start();
    ctx.currentTime += 20;
    player.setState('victory');
    const v = of('long-victory.ogg')[0]!;
    ctx.currentTime = v.startedAt! + 1;
    player.setState('menu');
    const span = v.stoppedAt! - 0.01 - ctx.currentTime;
    expect(span).toBeGreaterThan(3.9);
    expect(span).toBeLessThan(6);
  });
  it('K510 a state not in stateFadeMs uses fadeMs', async () => {
    const { ctx, player, of } = await start();
    ctx.currentTime += 20;
    player.setState('defeat');
    const d = of('long-defeat.ogg')[0]!;
    ctx.currentTime = d.startedAt! + 1;
    player.setState('play');
    const span = d.stoppedAt! - 0.01 - ctx.currentTime;
    expect(span).toBeGreaterThan(1.9);
    expect(span).toBeLessThan(4.5);
  });
  it('K510 victory plays out and chains into the menu; onMusicEnd fires once', async () => {
    const ended: string[] = [];
    const { ctx, player, of, pad } = await start((s) => ended.push(s));
    ctx.currentTime += 20;
    player.setState('victory');
    const v = of('long-victory.ogg')[0]!;
    ctx.currentTime = v.startedAt! + 40;
    ctx.end(v);
    ctx.end(v);
    expect(ended).toEqual(['victory']);
    expect(ctx.heard(pad, ctx.currentTime + 10)).toBeCloseTo(1);
    expect(of('long-victory.ogg')).toHaveLength(1);
  });
  it('K510 defeat plays out into silence', async () => {
    const { ctx, player, of, pad } = await start();
    ctx.currentTime += 20;
    player.setState('defeat');
    const d = of('long-defeat.ogg')[0]!;
    ctx.currentTime = d.startedAt! + 40;
    ctx.end(d);
    expect(ctx.heard(pad, ctx.currentTime + 10)).toBeCloseTo(0);
  });
  it('K510 leaving early cancels the chain', async () => {
    const ended: string[] = [];
    const { ctx, player, of, pad } = await start((s) => ended.push(s));
    ctx.currentTime += 20;
    player.setState('victory');
    const v = of('long-victory.ogg')[0]!;
    ctx.currentTime = v.startedAt! + 5;
    player.setState('play');
    ctx.end(v);
    expect(ended).toEqual([]);
    expect(ctx.heard(pad, ctx.currentTime + 10)).toBeCloseTo(1);
  });
  it('K510 a shelved track does not chain; the resumed one does', async () => {
    const ended: string[] = [];
    const { ctx, player, of } = await start((s) => ended.push(s));
    ctx.currentTime += 20;
    player.setState('victory');
    const v = of('long-victory.ogg')[0]!;
    ctx.currentTime = v.startedAt! + 10;
    player.setState('sting');
    ctx.end(v);
    expect(ended).toEqual([]);
    const sting = of('long-sting.ogg')[0]!;
    ctx.currentTime = sting.startedAt! + 3;
    player.setState('victory');
    const back = of('long-victory.ogg')[1]!;
    expect(back.offset).toBeGreaterThan(0);
    ctx.end(back);
    expect(ended).toEqual(['victory']);
  });
});

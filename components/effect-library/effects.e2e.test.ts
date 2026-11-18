// Each verb's end state in Chromium, played through the real motion player: to its natural end and skipped half way.
// Skipped off CI when Playwright's Chromium is not installed.
import { existsSync } from 'node:fs';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const HAVE = existsSync(chromium.executablePath());
interface Out {
  left: number;
  anims: number;
  style: { left: string; top: string; opacity: string; visibility: string; transform: string; scale: string; translate: string; boxShadow: string } | null;
  flipped: boolean | null;
  text: string | null;
  midShadow: string;
  midTransform: string;
  midOpacity: string;
  midScale: string;
  veil: boolean | null;
  bg: string | null;
  label: string | null;
}
interface Api {
  runOne(verb: string, extra: Record<string, unknown>, skip: boolean, actor?: Record<string, unknown>): Promise<Out>;
  reduced(): Promise<{ ms: number; actors: number; cues: string[] }>;
  together(skip?: boolean, verb?: string): Promise<{ mid: { scale: string; transform: string }; end: string; seen: string[] }>;
  early(start: boolean): Promise<number>;
  own(): Promise<{ log: string[]; names: string[] }>;
}
const CASES: [string, Record<string, unknown>, (o: Out) => void][] = [
  ['move', { to: 'b' }, (o) => expect([o.style?.left, o.style?.top, o.style?.translate]).toEqual(['330px', '225px', ''])],
  ['lift', { to: 1.2 }, (o) => expect(o.style?.transform).toContain('scale(1.2)')],
  ['settle', {}, (o) => expect(o.style?.transform).toBe('none')],
  ['fade-in', {}, (o) => expect(o.style?.opacity).toBe('1')],
  ['fade-out', {}, (o) => expect(o.style?.opacity).toBe('0')],
  ['show', {}, (o) => expect(o.style?.visibility).toBe('visible')],
  ['hide', {}, (o) => expect(o.style?.visibility).toBe('hidden')],
  ['flip', {}, (o) => expect(o.flipped).toBe(true)],
  ['scale', { to: 1.5 }, (o) => expect(o.style?.scale).toBe('1.5')],
  ['shake', { times: 3 }, (o) => expect(o.style?.transform).toBe('none')],
  ['glow', {}, (o) => expect(o.style?.boxShadow).toBe('')],
  ['text', { text: '+3' }, (o) => expect([o.text, o.style?.opacity]).toEqual(['+3', '1'])],
  ['text', { label: 'PLAY BALL' }, (o) => expect(o.text).toBe('PLAY BALL')],
  ['move', { to: 'b', then: 'hide' }, (o) => expect([o.style?.left, o.style?.visibility]).toEqual(['330px', 'hidden'])],
  ['scale', { to: 1.5, pulse: true }, (o) => expect(o.style?.scale).toBe('none')],
  ['fade-out', { to: 0.6 }, (o) => expect(o.style?.opacity).toBe('0.6')],
  ['flip', { holdMs: 100 }, (o) => expect(o.flipped).toBe(true)],
  ['flip', { label: 'Pick 2 of 3' }, (o) => expect([o.flipped, o.label]).toEqual([true, 'Pick 2 of 3'])],
  ['fade-in', { scale: 2 }, (o) => expect([o.style?.opacity, o.style?.scale]).toEqual(['1', ''])],
  ['fade-in', { scale: [2, 1.5] }, (o) => expect(o.style?.scale).toBe('1.5')],
  ['fade-in', { scale: 2, hold: true }, (o) => expect(o.style?.scale).toBe('2')],
  ['fade-in', { scale: [2, 2] }, (o) => expect(o.style?.scale).toBe('2')],
  ['move', { to: 'b', scale: 2 }, (o) => expect([o.style?.left, o.style?.translate, o.style?.scale]).toEqual(['330px', '', ''])],
  ['move', { to: 'b', ease: 'out' }, (o) => expect(o.style?.left).toBe('330px')],
];

describe.skipIf(!HAVE && !process.env['CI'])('effect library in a browser', () => {
  let browser: Browser;
  let page: Page;
  beforeAll(async () => {
    const r = await build({ entryPoints: [new URL('./fake/entry.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')], bundle: true, format: 'iife', write: false, logLevel: 'silent' });
    browser = await chromium.launch();
    page = await browser.newPage();
    await page.setContent('<!doctype html><body></body>');
    await page.addScriptTag({ content: r.outputFiles[0]?.text ?? '' });
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });
  const run = (verb: string, extra: Record<string, unknown>, skip: boolean, actor: Record<string, unknown> = {}) =>
    page.evaluate(([v, e, s, a]) => (window as unknown as { fxTest: Api }).fxTest.runOne(v, e, s, a), [verb, extra, skip, actor] as const);

  for (const [verb, extra, check] of CASES) {
    it(`${verb} ${JSON.stringify(extra)}: end state at the natural end, and when skipped`, async () => {
      for (const skip of [false, true]) {
        const o = await run(verb, extra, skip);
        check(o);
        expect(o.anims, `${verb} skip=${String(skip)} leaves no running animation`).toBe(0);
        expect(o.left, 'the layer is emptied at the beat end').toBe(0);
      }
    }, 20_000);
  }

  it('shake and glow move while they play and are at rest after', async () => {
    const sh = await run('shake', { times: 3 }, false);
    expect(sh.midTransform).not.toBe('none');
    expect(sh.style?.transform).toBe('none');
    const gl = await run('glow', {}, false);
    expect(gl.midShadow).not.toBe('none');
    expect(gl.style?.boxShadow).toBe('');
  });

  it('actor opacity and veil are applied', async () => {
    expect((await run('show', {}, false, { opacity: 0.6 })).style?.opacity).toBe('1');
    expect((await run('settle', {}, false, { opacity: 0.6 })).style?.opacity).toBe('0.6');
    const v = await run('settle', {}, false, { veil: true });
    expect([v.veil, v.bg]).toEqual([true, 'var(--fx-veil)']);
  });

  it('reduced motion: no clone is made, the beat ends at once and the cues still sound', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const r = await page.evaluate(() => (window as unknown as { fxTest: Api }).fxTest.reduced());
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect(r.actors).toBe(0);
    expect(r.ms).toBeLessThan(100);
    expect(r.cues).toEqual(['c']);
  });

  it('two verbs on one actor at once both show; resolve gets the run', async () => {
    const r = await page.evaluate(() => (window as unknown as { fxTest: Api }).fxTest.together());
    expect(Number(r.mid.scale)).toBeGreaterThan(1);
    expect(Number(r.mid.transform.split(/[(,]/)[1])).toBeLessThan(0.6);
    expect(r.end).toBe('2');
    expect(r.seen).toEqual(['a tg']);
  });

  it('scale with flip or move, skipped half way: both end states are kept', async () => {
    for (const verb of ['flip', 'move']) {
      const r = await page.evaluate((v) => (window as unknown as { fxTest: Api }).fxTest.together(true, v), verb);
      expect(r.end, verb).toBe('2');
    }
    const m = await page.evaluate(() => (window as unknown as { fxTest: Api }).fxTest.together(false, 'move'));
    expect(Number(m.mid.scale)).toBeGreaterThan(1);
  });

  it('entry scale on move and fade-in starts large and shrinks while it plays', async () => {
    for (const verb of ['move', 'fade-in']) {
      const o = await run(verb, { to: 'b', scale: 2, midScale: true }, false);
      expect(Number(o.midScale), verb).toBeGreaterThan(1);
      expect(Number(o.midScale), verb).toBeLessThan(2);
    }
  });

  it('text is fully visible well before its rise ends', async () => {
    expect(Number((await run('text', { text: '+3' }, false)).midOpacity)).toBe(1);
  });

  it('layer.start makes the stand-ins at the beat start, not at the first verb', async () => {
    expect(await page.evaluate(() => (window as unknown as { fxTest: Api }).fxTest.early(false))).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { fxTest: Api }).fxTest.early(true))).toBe(1);
  });

  it('a game registers its own effect beside the built-in verbs', async () => {
    const r = await page.evaluate(() => (window as unknown as { fxTest: Api }).fxTest.own());
    expect(r.names).toHaveLength(23);
    expect(r.names).toEqual(expect.arrayContaining(['arc-move', 'shake-group', 'unroll', 'multi-stop-path', 'trail', 'warp-transfer', 'radial-streaks', 'collapse-jump', 'column-beam', 'rotating-beam']));
    expect(r.names).toContain('pop');
    expect(r.log).toEqual(['done fx-actor']);
  });

  it('a canvas effect draws on one canvas in the layer, with no clone; the canvas goes at its end or on a skip', async () => {
    const r = await page.evaluate(() => (window as unknown as { fxTest: Api2 }).fxTest.canvas(false));
    expect([r.mid, r.after, r.actors, r.at]).toEqual([1, 0, 0, [50, 50]]);
    expect(r.frames).toBeGreaterThan(0);
    expect(r.names).toContain('burst');
    const s = await page.evaluate(() => (window as unknown as { fxTest: Api2 }).fxTest.canvas(true));
    expect([s.mid, s.after]).toEqual([1, 0]);
  });

  it('ambience stays in the box of its target, stops while motion is Off and follows the target again after', async () => {
    const r = await page.evaluate(() => (window as unknown as { fxTest: Api2 }).fxTest.ambience());
    expect(r.on).toEqual([20, 30, 200, 100, 'fx-ambience mist', 'block', 'none', 'hidden']);
    expect(r.size).toEqual([200, 100]);
    expect(r.frames).toBeGreaterThan(0);
    expect([r.off, r.still, r.back, r.gone]).toEqual(['none', true, ['block', '120px'], true]);
  });
});
interface Api2 {
  canvas(skip: boolean): Promise<{ mid: number; after: number; frames: number; at: number[]; actors: number; names: string[] }>;
  ambience(): Promise<{ on: (string | number)[]; size: number[]; frames: number; off: string; still: boolean; back: string[]; gone: boolean }>;
}

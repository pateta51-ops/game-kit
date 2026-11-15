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
  veil: boolean | null;
  bg: string | null;
  label: string | null;
}
interface Api {
  runOne(verb: string, extra: Record<string, unknown>, skip: boolean, actor?: Record<string, unknown>): Promise<Out>;
  reduced(): Promise<{ ms: number; actors: number; cues: string[] }>;
  together(skip?: boolean, verb?: string): Promise<{ mid: { scale: string; transform: string }; end: string; seen: string[] }>;
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
  ['flip', { label: 'Pick 2 of 3' }, (o) => expect([o.flipped, o.label]).toEqual([true, 'Pick 2 of 3'])],
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

  it('a game registers its own effect beside the twelve', async () => {
    const r = await page.evaluate(() => (window as unknown as { fxTest: Api }).fxTest.own());
    expect(r.names).toHaveLength(13);
    expect(r.names).toContain('pop');
    expect(r.log).toEqual(['done fx-actor']);
  });
});

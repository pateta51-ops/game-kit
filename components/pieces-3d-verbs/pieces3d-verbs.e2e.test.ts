// The demo route in Chromium: every piece draws; without WebGL the flat dice show. Skipped off CI when Chromium is not installed.
import { existsSync, readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { chromium, type Browser } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const HAVE = existsSync(chromium.executablePath());
const path = (f: string) => new URL(f, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
type T = { piecesTest: { demo(noGl: boolean): Promise<{ gl: boolean; layer: boolean; dice: [string, boolean, string][]; ball: number; chip: string; cards: boolean[] }>; verbs(): Promise<Record<string, boolean | number>>; context(): Promise<Record<string, boolean | number> | null> } };

describe.skipIf(!HAVE && !process.env['CI'])('pieces-3d demo in a browser', () => {
  let browser: Browser;
  let js = '';
  const css = readFileSync(path('../pieces-3d/pieces3d.css'), 'utf8') + ':root{--card-shadow:0 2px 4px #0006;--card-shadow-lifted:0 8px 16px #0006;--chip-core-1:#aaa;--chip-core-2:#888;--chip-core-3:#666}';
  const open = async () => { const page = await browser.newPage(); await page.setContent(`<!doctype html><style>${css}</style><body></body>`); await page.addScriptTag({ content: js }); return page; };
  beforeAll(async () => {
    js = (await build({ entryPoints: [path('./fake/entry.ts')], bundle: true, format: 'iife', write: false, logLevel: 'silent' })).outputFiles[0]?.text ?? '';
    browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  }, 60_000);
  afterAll(async () => { await browser?.close(); });

  it('every die is drawn as a solid, its flat form hidden; the ball, chip and cards draw', async () => {
    const page = await open();
    const r = await page.evaluate(() => (window as unknown as T).piecesTest.demo(false));
    expect([r.layer, r.gl]).toEqual([true, true]);
    expect(r.dice.map((d) => d[0])).toEqual([...Array<string>(6).fill('d6'), ...Array<string>(10).fill('d10')]);
    expect(r.dice.every((d) => d[1] && d[2] === 'hidden')).toBe(true);
    expect(r.ball).toBeGreaterThan(0);
    expect(r.chip).toBe('preserve-3d');
    expect(r.cards).toEqual([true, true]);
  }, 30_000);

  it('without WebGL the dice keep their flat form', async () => {
    const page = await open();
    const r = await page.evaluate(() => (window as unknown as T).piecesTest.demo(true));
    expect([r.layer, r.gl]).toEqual([false, false]);
    expect(r.dice.every((d) => !d[1] && d[2] === 'visible')).toBe(true);
    expect(r.ball).toBeGreaterThan(0);
  }, 30_000);

  it('move rolls the ball clone and settle rocks it back to rest; shake tumbles the dice; flip turns the old face out and the new in', async () => {
    const page = await open();
    const r = await page.evaluate(() => (window as unknown as T).piecesTest.verbs());
    expect(r).toEqual({ rolling: true, tumbling: 6, rocking: true, restAtEnd: true, turning: 2, flippedMid: false, flipped: true, after: 0 });
  }, 30_000);

  it('a lost context shows the flat dice until it is back; after stop nothing redraws and the context is freed', async () => {
    const page = await open();
    const r = await page.evaluate(() => (window as unknown as T).piecesTest.context());
    expect(r).toEqual({ start: true, lost: false, back: true, redrawn: true, stopped: false, freed: true, canvases: 0, still: true });
  }, 30_000);
});

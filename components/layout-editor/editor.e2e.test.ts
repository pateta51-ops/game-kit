// K269: the editor in Chromium with the two-player sample: drag, resize a parent, undo, export and re-import; capture.mjs on a page.
// Skipped when Playwright's Chromium is not installed.
import { existsSync, readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { capture } from './capture.mjs';
import { type Doc } from './index.ts';

const HAVE = existsSync(chromium.executablePath());
const SAMPLE = readFileSync(new URL('./examples/two-player.json', import.meta.url), 'utf8');
const URL_ = new URL('./editor.html', import.meta.url).href;

describe.skipIf(!HAVE)('K269 layout editor in Chromium', () => {
  let browser: Browser, page: Page;
  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.addInitScript((d) => { (window as unknown as { LAYOUT_EDITOR_INIT: unknown }).LAYOUT_EDITOR_INIT = JSON.parse(d) as unknown; }, SAMPLE);
    await page.goto(URL_);
  });
  afterAll(() => browser?.close());
  const get = () => page.evaluate(() => (window as unknown as { layoutEditor: { get(): Doc } }).layoutEditor.get());
  const rect = async (id: string) => (await get()).screens.desktop!.zones[id]!.r;
  const centre = async (sel: string) => { const b = (await page.locator(sel).boundingBox())!; return [b.x + b.width / 2, b.y + b.height / 2] as const; };
  const dragBy = async (from: readonly [number, number], dx: number, dy: number, alt = false) => {
    if (alt) await page.keyboard.down('Alt');
    await page.mouse.move(from[0], from[1]); await page.mouse.down(); await page.mouse.move(from[0] + dx / 2, from[1] + dy / 2); await page.mouse.move(from[0] + dx, from[1] + dy); await page.mouse.up();
    if (alt) await page.keyboard.up('Alt');
  };

  it('starts from LAYOUT_EDITOR_INIT and shows every zone with its label', async () => {
    expect(await page.locator('#zones .z').count()).toBe(39);
    await expect(page.locator('.z[data-id="shared.market"] .t').innerText()).resolves.toContain('Market row, 6 cards');
  });
  it('drags a zone, resizes a parent with its children, undoes and redoes', async () => {
    const m0 = await rect('shared.market');
    await dragBy(await centre('.z[data-id="shared.market"] .t'), 60, 0, true);
    const m1 = await rect('shared.market');
    expect(m1[0]).toBeGreaterThan(m0[0] + 50);
    await page.locator('#tree .row[data-id="you"] span').click();
    const h0 = await rect('you.hand'), y0 = await rect('you');
    await dragBy(await centre('#selbox .h[data-h="t"]'), 0, 100, true);
    const y1 = await rect('you'), h1 = await rect('you.hand');
    expect(y1[1]).toBeGreaterThan(y0[1] + 100);
    expect(h1[3]).toBeLessThan(h0[3]);
    await page.keyboard.press('Control+z');
    expect(await rect('you.hand')).toEqual(h0);
    await page.keyboard.press('Control+z');
    expect(await rect('shared.market')).toEqual(m0);
    await page.keyboard.press('Control+y');
    expect(await rect('shared.market')).toEqual(m1);
  });
  it('exports the JSON and imports it back, also the older array form', async () => {
    const before = await get();
    await page.click('#json');
    const text = await page.locator('#txt').inputValue();
    expect(JSON.parse(text)).toEqual(before);
    await page.locator('#txt').fill(JSON.stringify({ w: 100, h: 100, zones: { a: [0, 0, 10, 10] } }));
    await page.click('#loadTxt');
    expect((await get()).screens).toEqual({ main: { w: 100, h: 100, card: [180, 252], zones: { a: { r: [0, 0, 10, 10] } } } });
    await page.click('#json');
    await page.locator('#txt').fill(text);
    await page.click('#loadTxt');
    expect(await get()).toEqual(before);
  });
  it('a host doc is not written to localStorage; rounding touches only changed zones; a renamed screen keeps its backdrop (review 1, 4, 6)', async () => {
    expect(await page.evaluate(() => localStorage.getItem('layout-editor-doc'))).toBeNull();
    await page.evaluate(() => (window as unknown as { layoutEditor: { load(d: unknown): void } }).layoutEditor.load({ screens: { a: { w: 100, h: 100, zones: { f: { r: [0.5, 0.5, 10.25, 10] }, g: { r: [50, 50, 10, 10] } } }, b: { w: 100, h: 100, zones: {} } } }));
    await page.locator('#tree .row[data-id="g"] span').click();
    await page.keyboard.press('ArrowRight');
    const s = (await get()).screens.a!;
    expect([s.zones.f!.r, s.zones.g!.r]).toEqual([[0.5, 0.5, 10.25, 10], [51, 50, 10, 10]]);
    await page.locator('#bgUrl').fill('data:image/gif;base64,R0lGODlhAQABAAAAACw=');
    await page.locator('#bgUrl').press('Enter');
    await page.locator('#sName').fill('desk');
    await page.locator('#sName').press('Enter');
    expect(Object.keys((await get()).screens)).toEqual(['desk', 'b']);
    expect(await page.evaluate(() => [document.getElementById('bg')!.style.display, Object.keys(JSON.parse(localStorage.getItem('layout-editor-doc-bg')!) as object)])).toEqual(['', ['desk']]);
    await page.click('.tab[data-screen="b"]');
    expect(await page.evaluate(() => document.getElementById('bg')!.style.display)).toBe('none');
  });
  it('capture.mjs nests [data-zone] rects by DOM containment', async () => {
    const html = '<body style="margin:0"><div data-zone="you" style="position:absolute;left:10px;top:20px;width:300px;height:100px"><div data-zone="hand" style="margin:5px;width:50px;height:40px"></div><div data-zone="x.y" style="width:5px;height:5px"></div></div></body>';
    const d = await capture('data:text/html,' + encodeURIComponent(html), { w: 400, h: 300, screen: 'phone' });
    expect(d.screens.phone).toEqual({ w: 400, h: 300, card: [180, 252], zones: { you: { r: [10, 20, 300, 100] }, 'you.hand': { r: [15, 25, 50, 40] }, 'x.y': { r: [10, 70, 5, 5] } } });
  });
  it('capture.mjs adds the scroll and skips hidden and empty elements (review 5)', async () => {
    const html = '<body style="margin:0;height:3000px"><div data-zone="a" style="position:absolute;top:800px;width:20px;height:20px"></div><div data-zone="b" style="visibility:hidden;width:5px;height:5px"></div><div data-zone="c" style="display:none"></div><div data-zone="d"></div><script>scrollTo(0, 500)</script></body>';
    const d = await capture('data:text/html,' + encodeURIComponent(html), { w: 400, h: 300 });
    expect(d.screens.desktop!.zones).toEqual({ a: { r: [0, 800, 20, 20] } });
  });
});

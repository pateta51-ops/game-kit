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
  type W = { layoutEditor: { load(d: unknown): void; get(): Doc; zoom(z?: number, x?: number, y?: number): number } };
  const load = (d: string) => page.evaluate((t) => (window as unknown as W).layoutEditor.load(JSON.parse(t)), d);
  const zoom = (z?: number, x?: number, y?: number) => page.evaluate(([a, b, c]) => (window as unknown as W).layoutEditor.zoom(a, b, c), [z, x, y] as const);
  const stagePt = (x: number, y: number) => page.evaluate(([px, py]) => { const b = document.getElementById('stage')!.getBoundingClientRect(); return [(px - b.left) * 3840 / b.width, (py - b.top) * 2160 / b.height, b.width / 3840]; }, [x, y] as const);
  it('K280 zoom keeps the point under the pointer; drag and resize stay exact at 300%', async () => {
    await load(SAMPLE); await zoom(1);
    expect(await page.locator('.z.k-component').count()).toBe(11);
    const c = await centre('.z[data-id="shared.market"] .t'), p0 = await stagePt(c[0], c[1]);
    await zoom(3, c[0], c[1]);
    expect(await page.locator('#zPct').innerText()).toBe('300%');
    const p1 = await stagePt(c[0], c[1]), sc = p1[2]!;
    expect(Math.abs(p1[0]! - p0[0]!) + Math.abs(p1[1]! - p0[1]!)).toBeLessThan(3);
    const m0 = await rect('shared.market');
    await dragBy(c, 90, 30, true);
    const m1 = await rect('shared.market');
    expect(Math.abs(m1[0] - m0[0] - 90 / sc)).toBeLessThanOrEqual(1);
    expect(Math.abs(m1[1] - m0[1] - 30 / sc)).toBeLessThanOrEqual(1);
    await dragBy(await centre('#selbox .h[data-h="l"]'), -60, 0, true);
    const m2 = await rect('shared.market');
    expect(Math.abs(m1[0] - m2[0] - 60 / sc)).toBeLessThanOrEqual(1);
    expect(m2[0] + m2[2]).toBe(m1[0] + m1[2]);
    await page.click('#zFit');
    expect(await zoom()).toBe(1);
    const c2 = await centre('.z[data-id="log"]'), q0 = await stagePt(c2[0], c2[1]);
    await page.mouse.move(c2[0], c2[1]); await page.keyboard.down('Control'); await page.mouse.wheel(0, -300); await page.keyboard.up('Control');
    await expect.poll(() => zoom()).toBeGreaterThan(2);
    const q1 = await stagePt(c2[0], c2[1]);
    expect(Math.abs(q1[0]! - q0[0]!) + Math.abs(q1[1]! - q0[1]!)).toBeLessThan(3);
    await page.click('#zFit');
  });
  it('K280 consolidates three piles into you.piles with one undo step, and splits them', async () => {
    await load(SAMPLE); await zoom(1);
    const before = await get();
    await page.locator('#tree .row[data-id="you.deck"] span').click();
    for (const k of ['you.discard', 'you.captain']) await page.locator(`#tree .row[data-id="${k}"] span`).click({ modifiers: ['Shift'] });
    await page.click('#cons');
    const z = (await get()).screens.desktop!.zones;
    expect(['you.deck', 'you.piles.deck', 'you.piles.discard', 'you.piles.captain'].map((k) => z[k]?.kind)).toEqual([undefined, 'pile', 'pile', 'pile']);
    expect(z['you.piles']!.r).toEqual([1580, 2160 - 422, 90 + 22, 3 * 126 + 4 * 11]);
    expect(await page.locator('.z[data-id="you.piles.deck"] .pl').count()).toBe(1);
    await page.keyboard.press('Control+z');
    expect(await get()).toEqual(before);
    await page.keyboard.press('Control+y');
    await page.locator('#tree .row[data-id="you.piles"] span').click();
    await page.click('#split');
    const s = (await get()).screens.desktop!.zones;
    expect([s['you.piles'], s['you.deck']!.r.slice(2), s['you.captain']!.cards]).toEqual([undefined, [180, 252], 1]);
  });
  it('K280 snap to grid and snap to zones toggle; grid lines show only with grid snap', async () => {
    await load(SAMPLE); await zoom(1);
    const bgi = () => page.evaluate(() => document.getElementById('stage')!.style.backgroundImage);
    expect(await bgi()).toContain('linear-gradient');
    await page.click('#snapGrid'); await page.click('#snapZones');
    expect(await bgi()).toBe('none');
    const c = await centre('.z[data-id="menu"]'), sc = (await stagePt(0, 0))[2]!, m0 = await rect('menu');
    await dragBy(c, 37, 0);
    const m1 = await rect('menu');
    expect(Math.abs(m1[0] - m0[0] - 37 / sc)).toBeLessThanOrEqual(1);
    expect(m1[0] % 16).not.toBe(0);
    await page.click('#snapGrid');
    expect(await bgi()).toContain('linear-gradient');
    await dragBy(await centre('.z[data-id="menu"]'), 23, 0);
    expect((await rect('menu'))[0] % 16).toBe(0);
    await page.click('#snapZones');
  });
  it('K280 mode/variant tabs and copy zones from another screen', async () => {
    await load(JSON.stringify({ screens: { 'solo/table': { w: 100, h: 100, zones: { crew: { r: [1, 2, 30, 40], kind: 'component' }, 'crew.x': { r: [2, 3, 4, 5] } } }, '2p/rulebook': { w: 100, h: 100, zones: {} }, '2p/columns': { w: 100, h: 100, zones: {} } } }));
    const tabs = () => page.evaluate(() => [...document.querySelectorAll('#tabs .tab')].map((b) => (b.classList.contains('on') ? '*' : '') + (b as HTMLElement).innerText));
    expect(await tabs()).toEqual(['*solo', '2p', '*table']);
    await page.click('#tabs .tab:has-text("2p")');
    expect(await tabs()).toEqual(['solo', '*2p', '*rulebook', 'columns']);
    await page.selectOption('#cpScreen', 'solo/table');
    await page.selectOption('#cpZone', 'crew');
    await page.click('#cpGo');
    expect((await get()).screens['2p/rulebook']!.zones).toEqual({ crew: { r: [1, 2, 30, 40], kind: 'component' }, 'crew.x': { r: [2, 3, 4, 5] } });
    await page.keyboard.press('Control+z');
    expect((await get()).screens['2p/rulebook']!.zones).toEqual({});
  });
  it('Reset asks first, then restores the doc, backdrops and onChange fires once', async () => {
    await load(SAMPLE); await zoom(1);
    const ev = (f: string) => page.evaluate(f);
    await ev('window.__n = 0; layoutEditor.onChange(() => window.__n++)');
    const start = await get();
    await dragBy(await centre('.z[data-id="menu"]'), 60, 0, true);
    await page.fill('#bgUrl', 'data:image/gif;base64,R0lGODlhAQABAAAAACw='); await page.press('#bgUrl', 'Enter');
    const moved = await get(), bg = () => page.evaluate(() => document.getElementById('bg')!.style.display);
    expect(moved).not.toEqual(start); expect(await bg()).toBe('');
    await page.click('#reset'); await page.click('#rNo');
    expect(await get()).toEqual(moved);
    await page.click('#reset'); await page.keyboard.press('Escape');
    expect(await get()).toEqual(moved); expect(await page.locator('#rdlg').isVisible()).toBe(false);
    const n0 = await ev('window.__n') as number;
    await page.click('#reset'); await page.click('#rGo');
    expect(await get()).toEqual(start);
    expect(await bg()).toBe('none');
    expect(await ev('window.__n')).toBe(n0 + 1);
    expect(await page.evaluate(() => localStorage.getItem('layout-editor-doc-bg'))).toBeNull();
  });
  it('Reset starts from LAYOUT_EDITOR_INIT, not localStorage; editing keys do nothing while the dialog is open', async () => {
    const p2 = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await p2.addInitScript(() => localStorage.setItem('layout-editor-doc', JSON.stringify({ w: 9, h: 9, zones: { z: [0, 0, 1, 1] } })));
    await p2.goto(URL_);
    const g2 = () => p2.evaluate(() => (window as unknown as { layoutEditor: { get(): Doc } }).layoutEditor.get());
    expect(Object.keys((await g2()).screens.main!.zones)).toEqual(['z']);
    await p2.click('#tree .row[data-id="z"] span');
    await p2.click('#reset');
    await p2.keyboard.press('Delete'); await p2.keyboard.press('ArrowRight'); await p2.keyboard.press('Control+d');
    await p2.click('#rNo');
    expect((await g2()).screens.main!.zones).toEqual({ z: { r: [0, 0, 1, 1] } });
    await p2.click('#reset'); await p2.click('#rGo');
    expect(Object.keys((await g2()).screens)).toEqual(['desktop']);
    await p2.close();
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

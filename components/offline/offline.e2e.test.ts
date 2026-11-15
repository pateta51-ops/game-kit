// Offline end to end in Chromium: a small build (index, the bundled register.ts, an asset folder, a folder left out) with
// the kit's sw.js plays with the network off after one visit; a second build found when the page comes back to the
// front is offered (update state `ready`), Reload takes it, and only its cache stays. Served on http://localhost (the
// `local` build). Skipped off CI when Playwright's Chromium is not installed.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeServiceWorker } from './precache';

const HAVE = existsSync(chromium.executablePath());
const O = { prefix: 'e2e-', assets: ['faces'] };
const TYPES: Readonly<Record<string, string>> = { '.html': 'text/html', '.js': 'text/javascript', '.txt': 'text/plain' };

describe.skipIf(!HAVE && !process.env['CI'])('offline install in a browser', () => {
  let tmp = '';
  let root = '';
  let server: Server;
  let browser: Browser;
  let base = '';

  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'kit-offline-'));
    const A = join(tmp, 'a');
    mkdirSync(join(A, 'assets'), { recursive: true });
    await build({ entryPoints: [join(import.meta.dirname, 'fake', 'app.ts')], bundle: true, format: 'esm', outfile: join(A, 'assets', 'app.js'), logLevel: 'silent' });
    writeFileSync(join(A, 'index.html'), '<!doctype html><html><head><meta name="build" content="a"></head><body><h1>Offline</h1><script type="module" src="assets/app.js"></script></body></html>');
    mkdirSync(join(A, 'faces'));
    writeFileSync(join(A, 'faces', 'one.txt'), 'face one');
    writeFileSync(join(A, 'faces', 'two[1].txt'), 'face two');
    mkdirSync(join(A, 'skip'));
    writeFileSync(join(A, 'skip', 'x.txt'), 'not kept');
    writeServiceWorker(A, O);
    const B = join(tmp, 'b');
    cpSync(A, B, { recursive: true });
    writeFileSync(join(B, 'index.html'), readFileSync(join(B, 'index.html'), 'utf8').replace('content="a"', 'content="b"'));
    writeServiceWorker(B, O);
    root = A;
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/__build/a' || url.pathname === '/__build/b') {
        root = url.pathname.endsWith('a') ? A : B;
        res.writeHead(200).end();
        return;
      }
      const rel = normalize(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)).replace(/^[/\\]+/, '');
      const file = join(root, rel);
      if (!file.startsWith(root + sep) || !existsSync(file)) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' }).end(readFileSync(file));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://localhost:${String((server.address() as AddressInfo).port)}`;
    browser = await chromium.launch();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await new Promise((r) => server?.close(r));
    rmSync(tmp, { recursive: true, force: true });
  });

  const controlled = (page: Page) =>
    page.waitForFunction(async () => {
      await navigator.serviceWorker.ready;
      return navigator.serviceWorker.controller !== null;
    });
  const get = (page: Page, path: string) =>
    page.evaluate((p) => fetch(p).then((r) => (r.ok ? r.text() : `HTTP ${String(r.status)}`), () => 'failed'), path);

  it('after one visit the page and its asset folder load with the network off; a folder left out does not', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(base);
    await controlled(page);
    const keys = await page.evaluate(() => caches.keys());
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^e2e-[0-9a-f]{16}$/);
    await context.setOffline(true);
    const r = await page.reload();
    expect(r?.fromServiceWorker()).toBe(true);
    await expect.poll(() => page.textContent('h1')).toBe('Offline');
    expect(await get(page, 'faces/one.txt')).toBe('face one');
    expect(await get(page, 'faces/two%5B1%5D.txt')).toBe('face two');
    expect(await get(page, 'skip/x.txt')).toBe('failed');
    expect(await page.getAttribute('body', 'data-update')).toBe('current');
    await context.close();
  }, 60_000);

  it('a newer build found when the page comes to the front is offered; Reload takes it and deletes the old cache', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.request.get(`${base}/__build/a`);
    await page.goto(base);
    await controlled(page);
    const [cacheA] = await page.evaluate(() => caches.keys());
    await page.request.get(`${base}/__build/b`);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForSelector('body[data-update="ready"]', { timeout: 20_000 });
    expect(await page.getAttribute('meta[name="build"]', 'content')).toBe('a');
    const loaded = page.waitForEvent('load');
    await page.evaluate(() => (window as unknown as { applyUpdate: () => void }).applyUpdate());
    await loaded;
    await page.waitForSelector('meta[name="build"][content="b"]', { state: 'attached' });
    await controlled(page);
    const keysB = await page.evaluate(() => caches.keys());
    expect(keysB).toHaveLength(1);
    expect(keysB[0]).not.toBe(cacheA);
    expect(await page.getAttribute('body', 'data-update')).toBe('current');
    await context.close();
  }, 60_000);
});

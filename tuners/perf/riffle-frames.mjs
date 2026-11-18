/* global window, document, requestAnimationFrame */
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
let PNG;
try { ({ PNG } = require('pngjs')); } catch { ({ PNG } = require(require.resolve('playwright-core').replace(/index.js$/, 'lib/utilsBundle.js'))); }
const target = process.argv[2] ?? fileURLToPath(new URL('../riffle.html', import.meta.url));
const reference = process.argv[3];
const profile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const laptop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const browser = await chromium.launch();
const errors = [];

async function open(path, frozen = false, device = profile) {
  const page = await browser.newPage(device);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  if (frozen) {
    await page.addInitScript(() => {
      let next;
      performance.now = () => 0;
      window.requestAnimationFrame = (callback) => { next = callback; return 1; };
      window.cancelAnimationFrame = () => { next = undefined; };
      window.freezeFrame = (time) => next(time);
    });
  }
  await page.goto(pathToFileURL(resolve(path)).href);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

try {
  if (!process.env.RIFFLE_LOOK_ONLY) await measure();
  if (!process.env.RIFFLE_LOOK_ONLY) await endpoints();
  if (reference) await compare();
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('No console errors');
} finally {
  await browser.close();
}

async function measure() {
  for (const [view, button, pile] of [['side', '#play', 'side'], ['top', '#top-play', 'new']]) {
    const page = await open(target);
    const frames = [];
    const play = page.locator(button);
    await play.scrollIntoViewIfNeeded();
    for (let run = 0; run < 5; run++) {
      frames.push(...await play.evaluate((element, pile) => new Promise((done) => {
        const deltas = [];
        const selector = `[data-riffle-motion="${pile}"]`;
        let previous;
        function sample(now) {
          if (previous !== undefined) deltas.push(now - previous);
          previous = now;
          if (document.querySelector(selector)) requestAnimationFrame(sample);
          else done(deltas);
        }
        requestAnimationFrame(sample);
        element.click();
      }), pile));
    }
    frames.sort((a, b) => a - b);
    const percentile = (p) => frames[Math.ceil(frames.length * p) - 1].toFixed(1);
    console.log(`${view}: median ${percentile(0.5)} ms, p95 ${percentile(0.95)} ms (${frames.length} frames)`);
    await page.close();
  }
}

async function compare() {
  const out = new URL('./out/', import.meta.url);
  await mkdir(out, { recursive: true });
  const pages = [await open(reference, true), await open(target, true)];
  for (const page of pages) {
    await page.locator('#top-stage').evaluate((stage) => stage.scrollIntoView({ block: 'center' }));
    await page.locator('#top-play').evaluate((button) => button.click());
  }
  for (const time of [0.3, 0.9, 1.6, 2.4, 2.8]) {
    const [approved, current] = await Promise.all(pages.map(async (page) => {
      await page.evaluate((ms) => window.freezeFrame(ms), time * 1000);
      const clip = await page.locator('#top-stage').boundingBox();
      return PNG.sync.read(await page.screenshot({ clip }));
    }));
    const pair = new PNG({ width: approved.width * 2, height: approved.height });
    PNG.bitblt(approved, pair, 0, 0, approved.width, approved.height, 0, 0);
    PNG.bitblt(current, pair, 0, 0, current.width, current.height, approved.width, 0);
    let changed = 0;
    let error = 0;
    for (let i = 0; i < approved.data.length; i += 4) {
      const delta = Math.max(
        Math.abs(approved.data[i] - current.data[i]),
        Math.abs(approved.data[i + 1] - current.data[i + 1]),
        Math.abs(approved.data[i + 2] - current.data[i + 2]),
      );
      changed += Number(delta > 0);
      error += delta;
    }
    const pixels = approved.width * approved.height;
    await writeFile(new URL(`${time}.png`, out), PNG.sync.write(pair));
    console.log(`${time}s: ${changed}/${pixels} changed pixels, mean max-channel error ${(error / pixels).toFixed(3)}/255`);
  }
}

// K396: the top view's first frame, last frame and the static pile must match (0 px over 8/255 first vs last).
async function endpoints() {
  for (const [name, device] of [['phone', profile], ['laptop', laptop]]) {
    for (const orientation of ['Portrait', 'Landscape']) {
      const page = await open(target, true, device);
      await page.evaluate((value) => {
        const select = document.querySelector('[data-view=top] [data-k=orientation]') ?? document.getElementById('orientation');
        select.value = value;
        window.dispatchEvent(new Event('resize'));
      }, orientation);
      await page.locator('#top-stage').evaluate((stage) => stage.scrollIntoView({ block: 'center' }));
      const clip = await page.locator('#top-stage').boundingBox();
      const shot = async () => PNG.sync.read(await page.screenshot({ clip }));
      const pile = await shot();
      await page.locator('#top-play').evaluate((button) => button.click());
      const first = await shot();
      await page.evaluate(() => window.freezeFrame(2999.9));
      const last = await shot();
      const over = (a, b) => {
        let n = 0;
        for (let i = 0; i < a.data.length; i += 4) n += Number(Math.max(...[0, 1, 2].map((c) => Math.abs(a.data[i + c] - b.data[i + c]))) > 8);
        return n;
      };
      if (process.env.RIFFLE_DUMP) for (const [k, png] of Object.entries({ pile, first, last })) await writeFile(`${process.env.RIFFLE_DUMP}/${name}-${orientation}-${k}.png`, PNG.sync.write(png));
      console.log(`top ${name} ${orientation}: first vs last ${over(first, last)} px over 8/255, pile vs first ${over(pile, first)} px`);
      await page.close();
    }
  }
}

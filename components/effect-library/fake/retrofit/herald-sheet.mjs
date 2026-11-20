// K449 contact sheet: node herald-sheet.mjs <out.png>. Frames of the ?herald demo at about 0.05, 0.45, 0.85, 1.25 and 1.75 s in one picture.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

const dir = new URL('.', import.meta.url).pathname;
const bundle = (await build({ entryPoints: [join(dir, 'herald.ts')], bundle: true, format: 'iife', write: false, logLevel: 'silent' })).outputFiles[0].text;
const html = readFileSync(join(dir, 'index.html'), 'utf8').replace(/<script type="module"[^>]*><\/script>/g, '').replace('</body>', `<script>${bundle.replace(/<\/script>/g, '<\\/script>')}</script></body>`);
const file = join(mkdtempSync(join(tmpdir(), 'herald-')), 'index.html');
writeFileSync(file, html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
page.on('console', (c) => { console.log('page:', c.text()); });
page.on('pageerror', (e) => { console.log('pageerror:', e.message); });
const shots = [];
await page.goto(`file://${file}?herald`);
let last = 0;
for (const at of [50, 450, 850, 1250, 1750]) {
  await page.waitForTimeout(at - last);
  last = at;
  console.log('dbg', await page.evaluate(() => `${String(document.getAnimations().length)} anims; ${document.body.innerHTML.length} chars; clones ${String(document.querySelectorAll('[data-fx-actor],.fx-actor').length)}; ${getComputedStyle(document.getElementById('herald-count')).display}`));
  shots.push((await page.screenshot()).toString('base64'));
}
const sheet = await browser.newPage({ viewport: { width: 1000, height: 800 } });
await sheet.setContent(`<body style="margin:0;display:grid;grid-template-columns:repeat(3,1fr);gap:4px;background:#000">${shots.map((s, i) => `<figure style="margin:0;color:#fff;font:12px sans-serif"><img style="width:100%" src="data:image/png;base64,${s}">t=~${['0.05', '0.45', '0.85', '1.25', '1.75'][i] ?? ''}s</figure>`).join('')}</body>`);
await sheet.screenshot({ path: process.argv[2] ?? 'herald-sheet.png', fullPage: true });
await browser.close();

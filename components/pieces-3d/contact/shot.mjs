// contact sheet: the same round transparent token as a plain chip (before) and with dieCut (after); run with heavy in WSL
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '../pieces3d.css'), 'utf8');
const src = 'data:image/webp;base64,' + readFileSync(join(here, 'token.webp')).toString('base64');
const root = ':root{--chip-core-1:#e9d9b8;--chip-core-2:#cdb98f;--chip-core-3:#a8935f;--chip-thickness:14px;--piece-shadow-ink:rgba(0,0,0,.45)}body{margin:0;background:#2d5a3d;display:flex;gap:80px;padding:60px;font:16px sans-serif;color:#fff}figure{margin:0;perspective:700px}.p3-chip img{width:200px;height:200px}';
const html = `<style>${css}${root}</style><figure><span class="p3-chip"><img src="${src}"></span><figcaption>before: plain chip</figcaption></figure><figure><span class="p3-chip p3-diecut"><img src="${src}"></span><figcaption>after: dieCut</figcaption></figure>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 700, height: 380 }, deviceScaleFactor: 1.5 });
await p.setContent(html);
await p.screenshot({ path: join(here, 'sheet-before-after.png') });
await b.close();

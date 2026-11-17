// K263 demo, not shipped: Imperium's real phone screens at 390x844, same states as shots.mjs.
//   node imp-shots.mjs <outdir> <a copy of Imperium's dist/>
const { chromium } = await import('playwright');
import { join, extname } from 'node:path';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const out = process.argv[2] ?? 'shots';
const dist = process.argv[3];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };
const srv = createServer((q, r) => {
  const f = decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html');
  readFile(join(dist, f)).then(
    (d) => { r.writeHead(200, { 'content-type': types[extname(f)] ?? 'application/octet-stream' }); r.end(d); },
    () => { r.writeHead(404); r.end(); },
  );
}).listen(0);
const base = `http://localhost:${srv.address().port}`;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const snap = async (n) => { await p.waitForTimeout(700); await p.screenshot({ path: join(out, `imp-${n}.png`) }); };
await p.goto(`${base}/?pack=proto#/new`);
await p.getByLabel('Seed').fill('ui-1');
await p.getByRole('button', { name: 'Start game' }).click();
await p.getByTestId('round').waitFor({ state: 'attached' });
await snap('base');
await p.getByTestId('dock-toggle').tap();
await snap('open');
await p.getByTestId('dock-toggle').tap();
await p.getByTestId('tab-you').tap();
await snap('you');
await p.locator('[data-area="you"] [data-testid="sheet-open"]:visible').first().tap();
await snap('sheet');
await p.keyboard.press('Escape');
await p.getByTestId('phone-menu-button').tap();
await snap('menu');
await b.close();
srv.close();

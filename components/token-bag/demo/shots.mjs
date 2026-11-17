// K246 demo, not shipped. Run in WSL from a folder with node_modules (esbuild, playwright, react, react-dom, three):
//   node components/token-bag/demo/shots.mjs <outdir>
/* global document, window, HTMLCanvasElement */
const dyn = (m) => import(m);
const { build } = await dyn('esbuild');
const { chromium } = await dyn('playwright');
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? 'shots';
mkdirSync(out, { recursive: true });
await build({ entryPoints: [join(here, 'main.tsx')], bundle: true, splitting: true, format: 'esm', outdir: join(out, 'site'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
writeFileSync(join(out, 'site', 'index.html'), '<div id=root></div><script type=module src=main.js></script>');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'] });
const errs = [];
const open = async (s, noGl) => {
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`${s}: ${m.text()}`); });
  p.on('pageerror', (e) => errs.push(`${s}: pageerror ${e.message}`));
  if (noGl) await p.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (k, ...r) { return /webgl/.test(k) ? null : g.call(this, k, ...r); }; });
  await p.goto(`file://${join(out, 'site', 'index.html')}?${s}`);
  return p;
};
const ready = (p) => p.waitForFunction(() => document.title === 'ready', null, { timeout: 30000 });
const snap = async (name, s, noGl) => { const p = await open(s, noGl); if (!noGl) await ready(p); else await p.waitForTimeout(800); await p.screenshot({ path: join(out, `${name}.png`) }); await p.close(); };
await snap('rest-3d', 'mode=rest');
for (const [n, t] of [['draw-00', 0], ['draw-40', 0.4], ['draw-80', 0.8], ['draw-end', 1]]) await snap(n, `mode=seek&t=${t}`);
await snap('fallback-2d', 'mode=2d', true);
// the real flow: click draw, let it play, the overlay goes and onDrawDone fires
{
  const p = await open('mode=play');
  await p.waitForTimeout(1500);
  await p.click('#go');
  await p.waitForTimeout(1800);
  await p.screenshot({ path: join(out, 'play-mid.png') });
  // software GL is below 30 fps, so the session falls back to 2D by design; the draw still ends
  console.log('after play', await p.evaluate(() => document.querySelector('[data-part=token-bag]')?.getAttribute('data-fallback')));
  await p.waitForFunction(() => window.log.some((l) => l.startsWith('done')), null, { timeout: 20000 }).catch(() => errs.push('play: onDrawDone never fired'));
  console.log('play log', JSON.stringify(await p.evaluate(() => window.log)), 'overlay left', await p.locator('[data-part=token-bag-draw]').count());
  await p.close();
}
console.log(errs.length ? `ERRORS\n${errs.join('\n')}` : 'no console errors');
await b.close();

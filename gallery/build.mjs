// K502: builds gallery/src/effects.html into gallery/effects.html: the kit's code inlined (tuners/build.mjs) and every
// components/effect-library/catalog.json entry as a tile, grouped in the order of the README's "Effects by group".
// `--check` fails when the built page is out of date; `--play` plays every tile of the built page once (Chromium).
import fs from 'node:fs';
import path from 'node:path';
const norm = (s) => s.replace(/\r\n/g, '\n');
const root = path.resolve(import.meta.dirname, '..');
const lib = path.join(root, 'components/effect-library');
const catalog = JSON.parse(fs.readFileSync(path.join(lib, 'catalog.json'), 'utf8'));
const readme = norm(fs.readFileSync(path.join(lib, 'README.md'), 'utf8'));
const from = readme.indexOf('## Effects by group');
const groups = [...readme.slice(from, readme.indexOf('\n## ', from + 3)).matchAll(/^\*\*([a-z-]+)\*\*$/gm)].map((m) => m[1]);
const ENERGY = ['light-pillar', 'radar-sweep', 'light-teleport', 'projectile', 'shield-bubble', 'target-brackets', 'drawPlasmaOrb', 'drawDriftCloud'];
const SCREEN = ['cameraPull', 'cameraPush', 'letterboxBanner', 'pileLift'];
const tuner = (e) => ENERGY.includes(e.id) ? 'energy.html' : SCREEN.includes(e.id) || (e.id === 'text' && e.option?.typewriter) ? 'screen.html' : e.id === 'flight' ? 'token-motion.html' : 'effect-library.html';
const lost = catalog.filter((e) => !groups.includes(e.group));
if (lost.length) throw new Error(`gallery: groups not in the README list: ${lost.map((e) => e.group).join(', ')}`);
const data = groups.map((g) => ({ group: g, tiles: catalog.filter((e) => e.group === g).map((e) => ({
  key: e.id + (e.option ? ' ' + JSON.stringify(e.option) : ''), id: e.id, option: e.option ?? null, was: e.was, title: e.title, looks: e.looks, ms: e.ms, demo: e.demo, tuner: tuner(e),
})) }));
const out = path.join(import.meta.dirname, 'effects.html');
if (process.argv.includes('--play')) {
  // plays every tile of the built page once in Chromium (4x fast) and fails on any console error
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(new URL('file:///' + out.replace(/\\/g, '/').replace(/^\/+/, '')).href + '?speed=0.25');
  const n = await page.evaluate(() => globalThis.playEvery());
  await page.waitForTimeout(500);
  await browser.close();
  console.log(`gallery play: ${n} tiles, ${errors.length} console errors`);
  for (const e of errors) console.error(e);
  process.exit(errors.length || n !== data.reduce((s, g) => s + g.tiles.length, 0) ? 1 : 0);
}
if (process.argv.includes('--strips')) {
  const { strips } = await import('./strips.mjs');
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
  process.exit(await strips({ entries: data.flatMap((g) => g.tiles.map((t) => ({ ...t, group: g.group }))), url: new URL('file:///' + out.replace(/\\/g, '/').replace(/^\/+/, '')).href, outDir: path.resolve(process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? path.join(import.meta.dirname, 'strips')), only }));
}
const { inlineKit } = await import('../tuners/build.mjs');
const html = inlineKit(norm(fs.readFileSync(path.join(import.meta.dirname, 'src/effects.html'), 'utf8')))
  .replace('<!--@gallery-data-->', () => `<script type="application/json" id="data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`);
if (!process.argv.includes('--check')) fs.writeFileSync(out, html);
else if (!fs.existsSync(out) || norm(fs.readFileSync(out, 'utf8')) !== html) {
  console.error('gallery out of date, run node gallery/build.mjs');
  process.exit(1);
}

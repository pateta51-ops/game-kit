// K502: builds gallery/src/effects.html into gallery/effects.html: the kit's code inlined (tuners/build.mjs) and every
// components/effect-library/catalog.json entry as a tile, grouped in the order of the README's "Effects by group".
// `--check` fails when the built page is out of date.
import fs from 'node:fs';
import path from 'node:path';
import { inlineKit, norm } from '../tuners/build.mjs';
const root = path.resolve(import.meta.dirname, '..');
const lib = path.join(root, 'components/effect-library');
const catalog = JSON.parse(fs.readFileSync(path.join(lib, 'catalog.json'), 'utf8'));
const readme = norm(fs.readFileSync(path.join(lib, 'README.md'), 'utf8'));
const from = readme.indexOf('## Effects by group');
const groups = [...readme.slice(from, readme.indexOf('\n## ', from + 3)).matchAll(/^\*\*([a-z-]+)\*\*$/gm)].map((m) => m[1]);
const ENERGY = ['column-beam', 'rotating-beam', 'warp-transfer', 'projectile', 'shield-bubble', 'reticle', 'drawPlasmaOrb', 'drawDriftCloud'];
const SCREEN = ['cameraPull', 'cameraPush', 'letterboxBanner', 'pileLift'];
const tuner = (e) => ENERGY.includes(e.id) ? 'energy.html' : SCREEN.includes(e.id) || (e.id === 'text' && e.option?.typewriter) ? 'screen.html' : e.id === 'flight' ? 'token-motion.html' : 'effect-library.html';
const lost = catalog.filter((e) => !groups.includes(e.group));
if (lost.length) throw new Error(`gallery: groups not in the README list: ${lost.map((e) => e.group).join(', ')}`);
const data = groups.map((g) => ({ group: g, tiles: catalog.filter((e) => e.group === g).map((e) => ({
  key: e.id + (e.option ? ' ' + JSON.stringify(e.option) : ''), id: e.id, option: e.option ?? null, title: e.title, looks: e.looks, ms: e.ms, demo: e.demo, tuner: tuner(e),
})) }));
const html = inlineKit(norm(fs.readFileSync(path.join(import.meta.dirname, 'src/effects.html'), 'utf8')))
  .replace('<!--@gallery-data-->', () => `<script type="application/json" id="data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`);
const out = path.join(import.meta.dirname, 'effects.html');
if (!process.argv.includes('--check')) fs.writeFileSync(out, html);
else if (!fs.existsSync(out) || norm(fs.readFileSync(out, 'utf8')) !== html) {
  console.error('gallery out of date, run node gallery/build.mjs');
  process.exit(1);
}

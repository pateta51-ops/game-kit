// K263 demo, not shipped. Run in WSL from a folder with node_modules (esbuild, playwright, react, react-dom):
//   node components/phone-mode/demo/shots.mjs <outdir>
// Writes kit-<state>.png at 390x844. Imperium's real screens are shot by imp-shots.mjs beside it.
const dyn = (m) => import(m);
const { build } = await dyn('esbuild');
const { chromium } = await dyn('playwright');
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? 'shots';
mkdirSync(out, { recursive: true });
await build({ entryPoints: [join(here, 'main.tsx')], bundle: true, outdir: join(out, 'site'), loader: { '.css': 'css' }, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
writeFileSync(join(out, 'site', 'index.html'), '<meta name=viewport content="width=device-width,initial-scale=1"><link rel=stylesheet href=main.css><div id=root></div><script src=main.js></script>');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
for (const s of ['base', 'open', 'you', 'sheet', 'menu']) {
  await p.goto(`file://${join(out, 'site', 'index.html')}?s=${s}`);
  await p.waitForTimeout(600);
  await p.screenshot({ path: join(out, `kit-${s}.png`) });
}
await b.close();

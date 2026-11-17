// K218 demo, not shipped. Run in WSL from a folder with node_modules (esbuild, playwright, react, react-dom):
//   node components/card-hand/demo/shots.mjs <outdir>
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
writeFileSync(join(out, 'site', 'index.html'), '<link rel=stylesheet href=main.css><div id=root></div><script src=main.js></script>');
const url = (s) => `file://${join(out, 'site', 'index.html')}?${s}`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const shot = async (name, s, act) => { await p.goto(url(s)); await p.waitForTimeout(200); if (act) await act(); await p.waitForTimeout(700); await p.screenshot({ path: join(out, `${name}.png`) }); };
await shot('rest-3', 'n=3');
await shot('rest-7', 'n=7');
await shot('rest-12', 'n=12');
await shot('hover-7-mid', 'n=7', () => p.mouse.move(360 + 560, 380 + 150));
await shot('focus-7-second', 'n=7', async () => { await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); });
await shot('backs-7', 'n=7&mode=back');
await shot('picked-12', 'n=12&mode=picked');
await b.close();

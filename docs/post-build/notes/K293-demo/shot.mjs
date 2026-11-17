// K293 demo, not shipped. WSL, folder with esbuild+playwright+react: node components/table-panels/demo/shot.mjs <outdir>
const dyn = (m) => import(m);
const { build } = await dyn('esbuild');
const { chromium } = await dyn('playwright');
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? 'shots';
mkdirSync(out, { recursive: true });
await build({ entryPoints: [join(here, 'main.tsx')], bundle: true, outdir: join(out, 'site'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
writeFileSync(join(out, 'site', 'index.html'), '<meta charset=utf-8><div id=root></div><script src=main.js></script>');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 800, height: 120 } });
await p.goto(`file://${join(out, 'site', 'index.html')}`);
await p.screenshot({ path: join(out, 'turn-banner-words.png') });
await b.close();

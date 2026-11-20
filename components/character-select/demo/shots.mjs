// K467 demo, not shipped. Run in WSL from a folder with node_modules (esbuild, playwright, react, react-dom):
//   heavy run -- node components/character-select/demo/shots.mjs <outdir>
// Writes <outdir>/sheet-4k.png and <outdir>/sheet-phone.png: Game options closed and open, an opponent picked.
const dyn = (m) => import(m);
const { build } = await dyn('esbuild');
const { chromium } = await dyn('playwright');
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] ?? 'shots');
mkdirSync(join(out, 'site'), { recursive: true });
await build({ entryPoints: [join(here, 'main.tsx')], bundle: true, outdir: join(out, 'site'), loader: { '.css': 'css' }, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
writeFileSync(join(out, 'site', 'index.html'), '<meta charset=utf-8><link rel=stylesheet href=main.css><div id=root></div><script src=main.js></script>');
const url = (s) => `file://${join(out, 'site', 'index.html')}?${s}`;
const b = await chromium.launch();
const shoot = async (vp, s, open, name, full) => {
  const p = await b.newPage({ viewport: vp, deviceScaleFactor: 1 });
  await p.goto(url(s));
  await p.waitForTimeout(300);
  if (open) await p.click('[data-part="options-toggle"]');
  await p.waitForTimeout(300);
  const path = join(out, `${name}.png`);
  if (full) await p.locator('[data-part="opponent-strip"]').scrollIntoViewIfNeeded();
  await p.waitForTimeout(200);
  await p.screenshot({ path });
  await p.close();
  return { name, data: `data:image/png;base64,${readFileSync(path).toString('base64')}` };
};
const sheet = async (shots, w, name) => {
  const p = await b.newPage({ viewport: { width: w, height: 400 }, deviceScaleFactor: 1 });
  await p.setContent(
    `<body style="margin:0;background:#222;color:#eee;font:28px system-ui;display:flex;gap:24px;padding:24px;align-items:flex-start">` +
      shots.map((s) => `<figure style="margin:0;flex:1"><figcaption style="padding:0 0 12px">${s.name}</figcaption><img style="width:100%;display:block" src="${s.data}"></figure>`).join('') +
      `</body>`,
  );
  await p.waitForTimeout(300);
  await p.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  await p.close();
};
const k = { width: 3840, height: 2160 };
await sheet([await shoot(k, 'opp=fen', false, '4K, Game options closed, rival Rook picked'), await shoot(k, 'opp=fen', true, '4K, Game options open')], 3840, 'sheet-4k');
const ph = { width: 390, height: 844 };
await sheet(
  [
    await shoot(ph, 'phone=1&opp=fen', false, 'Phone, options closed', false),
    await shoot(ph, 'phone=1&opp=fen', true, 'Phone, options open', false),
    await shoot(ph, 'phone=1&opp=fen', false, 'Phone, scrolled to the rival strip (Rook picked)', true),
  ],
  1600,
  'sheet-phone',
);
await b.close();

/* eslint-disable no-undef -- page.evaluate callbacks run in the browser */
// K394: real-mouse hit check for card-hand on tuners/card-hand.html (4K). Run in WSL: bash tuners/card-hand-e2e/hit-area.sh
// CI: a step on the kit runner after `node tuners/build.mjs` (needs playwright on NODE_PATH). Exit 1 on failure.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = new URL('../card-hand.html', import.meta.url).href;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 3840, height: 2160 } });
await p.goto(url);
await p.evaluate(() => { const i = document.getElementById('c-n'); i.value = 6; i.dispatchEvent(new Event('input', { bubbles: true })); });
const n = await p.locator('[data-part=strip]').count();
if (n !== 6) { console.error('expected 6 cards, got', n); process.exit(1); }
const centres = await p.evaluate(() => [...document.querySelectorAll('[data-part=strip]')].map((s) => { const r = s.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
const hit = (x, y) => p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); const li = e?.closest('[data-part=card]'); return li ? [...li.parentNode.children].indexOf(li) : -1; }, [x, y]);
let bad = 0;
const order = [...centres.keys()];
for (const [name, seq] of [['ltr', order], ['rtl', [...order].reverse()]]) {
  await p.mouse.move(5, 5);
  await p.waitForTimeout(900);
  for (const i of seq) {
    await p.mouse.move(centres[i][0], centres[i][1], { steps: 12 });
    await p.waitForTimeout(900);
    const got = await hit(centres[i][0], centres[i][1]);
    if (got !== i) { bad++; console.error(`FAIL strip ${i + 1} answers as card ${got + 1} (${name})`); }
  }
}
// the lifted face above the strip keeps the hover (K310): the card stays lifted (z-index 50) with the pointer above its strip
const i = 2;
await p.mouse.move(5, 5);
await p.waitForTimeout(900);
await p.mouse.move(centres[i][0], centres[i][1], { steps: 12 });
await p.waitForTimeout(900);
const top = await p.evaluate((i) => { const s = document.querySelectorAll('[data-part=strip]')[i].getBoundingClientRect(); return [s.x + s.width / 2, s.y]; }, i);
await p.mouse.move(top[0], top[1] - 20, { steps: 6 });
await p.waitForTimeout(900);
const held = await p.evaluate((i) => getComputedStyle(document.querySelectorAll('[data-part=card]')[i]).zIndex === '50', i);
if (!held) { bad++; console.error('FAIL hover lost above the strip'); }
await b.close();
console.log(bad ? `${bad} failures` : 'hit-area ok');
process.exit(bad ? 1 : 0);

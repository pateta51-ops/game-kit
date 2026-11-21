/* global window, document, Element, Image, tiles, specs, player, __adv, __paint */
// K505: `node gallery/build.mjs --strips` shoots five frames of every catalogue demo from the built gallery page, with a fake clock
// (performance.now, timers, rAF, Web Animations paused and set) so the same demo gives the same picture. One PNG per entry, one sheet per group.
import fs from 'node:fs';
import path from 'node:path';

const FW = 180, FH = 105, GAP = 4, LAB = 16, TITLE = 20;
export const stripName = (e) => e.id + (e.option ? '--' + Object.entries(e.option).map(([k, v]) => (typeof v === 'object' || v === true ? k : `${k}-${String(v)}`)).join('-') : '');

export const clock = () => {
  let now = 0, seq = 0, seed = 12345;
  const timers = new Map();
  let raf = [];
  Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const realRaf = window.requestAnimationFrame.bind(window);
  window.__paint = () => new Promise((r) => realRaf(() => realRaf(() => r())));
  performance.now = () => now;
  Date.now = () => 1.7e12 + now;
  window.setTimeout = (f, d = 0, ...a) => { const id = ++seq; timers.set(id, { at: now + Math.max(0, +d || 0), f, a, id }); return id; };
  window.setInterval = (f, d = 0, ...a) => { const id = ++seq; timers.set(id, { at: now + Math.max(1, +d || 0), f, a, id, every: Math.max(1, +d || 0) }); return id; };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  window.requestAnimationFrame = (f) => { raf.push({ id: ++seq, f }); return seq; };
  window.cancelAnimationFrame = (id) => { raf = raf.filter((r) => r.id !== id); };
  const started = new WeakMap();
  const done = new WeakSet();
  const sync = () => { let fresh = false; for (const a of document.getAnimations()) { if (!started.has(a)) started.set(a, now); a.pause(); a.currentTime = now - started.get(a); if (a.playState === 'finished' && !done.has(a)) { done.add(a); fresh = true; } } return fresh; };
  const orig = Element.prototype.animate;
  Element.prototype.animate = function (...args) { const a = orig.apply(this, args); started.set(a, now); a.pause(); a.currentTime = 0; return a; };
  const yieldTurn = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
  window.__adv = async (ms) => {
    const end = now + ms;
    for (;;) {
      let t;
      for (const x of timers.values()) if (x.at <= end && (!t || x.at < t.at || (x.at === t.at && x.id < t.id))) t = x;
      if (!t) break;
      now = Math.max(now, t.at);
      if (t.every) t.at += t.every; else timers.delete(t.id);
      t.f(...t.a);
      await yieldTurn();
    }
    now = end;
    const q = raf; raf = [];
    for (const r of q) r.f(now);
    const fresh = sync();
    // real frames per step, so finish events of the paused animations fire before the next virtual step
    for (let i = fresh ? 4 : 1; i > 0; i--) await new Promise((r) => realRaf(() => r()));
  };
};

const PAGE_CSS = `header,.head,.hint{display:none!important}.tile{display:none!important}.tile.shoot{display:grid!important;border:0!important;border-radius:0!important;width:${FW}px!important}.stage{width:${FW}px!important}main,section{padding:0!important;margin:0!important;max-width:none!important}.grid{display:block!important}`;
// entries whose look is no motion (frames 2 to 4 may equal frame 1)
const STILL = [
  'show', // switches a hidden piece on at once: nothing moves, the strip is the look
  'flight', // the browser's view transition between two pages of the app: the gallery has no stand-in for it
];
const paintShot = async (loc, o) => { await loc.page().evaluate(() => __paint()); return loc.screenshot(o); };

export async function strips({ entries, url, outDir, only }) {
  const { chromium } = await import('playwright-core');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 700, height: 500 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(clock);
  const errors = [];
  const open = async (idx) => {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    await page.addStyleTag({ content: PAGE_CSS });
    const L = await page.evaluate(([i, ms, old]) => {
      const id = 't' + i;
      tiles[id].tile.classList.add('shoot');
      const sp = specs[id], end = Math.max(...sp.steps.map((s) => s.t + (s.dur ?? 0)));
      // the demo's real play time (spec length, steps' ends, the entry's ms), at least 400 ms
      return old ? sp.maxMs ?? end : Math.max(400, sp.maxMs ?? 0, end, ms ?? 0);
    }, [idx, entries[idx].ms, !!process.env.K505_OLD]);
    await page.evaluate((i) => { player.play('t' + i); }, idx);
    await page.evaluate(() => __adv(0));
    return { page, L, stage: page.locator('.tile.shoot .stage'), adv: (ms) => page.evaluate((m) => __adv(m), ms) };
  };
  const snap = async (stage) => (await paintShot(stage, { animations: 'allow', caret: 'hide' })).toString('base64');
  // the play time up to the last change on the stage: demos padded with a quiet tail would show four empty frames
  const active = async (idx) => {
    const { page, L, stage, adv } = await open(idx);
    if (process.env.K505_OLD) { await page.close(); return L; }
    const n = 60, d = Math.ceil(L / n);
    let prev = await snap(stage), last = 0;
    for (let k = 1; k * d <= L + d; k++) {
      await adv(d);
      // the restore at the end of the run is not motion
      if (!(await page.evaluate((i) => tiles['t' + i].tile.classList.contains('playing'), idx))) break;
      const s = await snap(stage);
      if (s !== prev) last = k;
      prev = s;
    }
    await page.close();
    return Math.min(L, Math.max(400, Math.round((last + 1) * d * 1.5)));
  };
  const shoot = async (idx) => {
    const span = await active(idx);
    const { page, stage, adv } = await open(idx);
    const step = Math.max(16, Math.round(span / 100));
    const frames = [];
    let at = 0;
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const target = Math.round(span * f);
      while (at < target) { const d = Math.min(step, target - at); await adv(d); at += d; }
      frames.push({ ms: at, png: await snap(stage) });
    }
    await page.close();
    return frames;
  };
  const composer = await ctx.newPage();
  await composer.setContent('<canvas id="c"></canvas>');
  const compose = (spec) => composer.evaluate(async ({ spec, FW, FH, GAP, LAB, TITLE }) => {
    const load = (b64) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + b64; });
    const c = document.getElementById('c');
    if (spec.kind === 'strip') {
      const imgs = await Promise.all(spec.frames.map((f) => load(f.png)));
      c.width = imgs.length * FW + (imgs.length - 1) * GAP; c.height = FH + LAB;
      const g = c.getContext('2d');
      g.fillStyle = '#111317'; g.fillRect(0, 0, c.width, c.height);
      g.font = '11px Consolas, monospace'; g.textAlign = 'center'; g.fillStyle = '#9298a2';
      imgs.forEach((im, k) => { const x = k * (FW + GAP); g.drawImage(im, x, 0, FW, FH); g.fillText(spec.frames[k].ms + ' ms', x + FW / 2, FH + 12); });
    } else {
      const imgs = await Promise.all(spec.items.map((s) => load(s.png)));
      const h = imgs.map((i) => i.height + TITLE + 6);
      c.width = Math.max(...imgs.map((i) => i.width)); c.height = h.reduce((a, b) => a + b, 0);
      const g = c.getContext('2d');
      g.fillStyle = '#111317'; g.fillRect(0, 0, c.width, c.height);
      let y = 0;
      imgs.forEach((im, k) => {
        g.font = '13px Consolas, monospace'; g.textAlign = 'left'; g.fillStyle = '#e9ebee'; g.fillText(spec.items[k].title, 2, y + 14);
        g.fillStyle = '#7cc4ff'; g.fillText(spec.items[k].id, 2 + g.measureText(spec.items[k].title + '   ').width, y + 14);
        g.drawImage(im, 0, y + TITLE); y += h[k];
      });
    }
    return c.toDataURL('image/png').split(',')[1];
  }, { spec, FW, FH, GAP, LAB, TITLE });
  const byGroup = {}, still = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i], name = stripName(e);
    if (only && !only.includes(name)) continue;
    const frames = await shoot(i);
    if (frames.slice(1, 4).every((f) => f.png === frames[0].png) && !STILL.includes(name)) still.push(name);
    const png = await compose({ kind: 'strip', frames });
    fs.writeFileSync(path.join(outDir, name + '.png'), Buffer.from(png, 'base64'));
    (byGroup[e.group] ??= []).push({ title: e.title, id: name, png });
  }
  if (!only) for (const [g, items] of Object.entries(byGroup)) fs.writeFileSync(path.join(outDir, `group-${g}.png`), Buffer.from(await compose({ kind: 'sheet', items }), 'base64'));
  await browser.close();
  let total = 0;
  for (const f of fs.readdirSync(outDir)) total += fs.statSync(path.join(outDir, f)).size;
  console.log(`still strips (frames 2 to 4 equal frame 1, no visible motion): ${still.length}${still.length ? ': ' + still.join(', ') : ''}`);
  console.log(`gallery strips: ${entries.length} entries, ${(total / 1048576).toFixed(1)} MB, ${errors.length} page errors`);
  for (const e of errors) console.error(e);
  return errors.length || still.length ? 1 : 0;
}

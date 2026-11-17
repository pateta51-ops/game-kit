// K269: record the rects of a running page's [data-zone] (and with --parts [data-part]) elements as a layout-editor doc.
/* global document, getComputedStyle, scrollX, scrollY */
// node capture.mjs <url> <out.json> [--w 3840 --h 2160] [--screen desktop] [--parts] [--wait ms]
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

export async function capture(url, o = {}) {
  const w = o.w ?? 3840, h = o.h ?? 2160
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: w, height: h } })
    await page.goto(url, { waitUntil: 'load' })
    if (o.wait) await page.waitForTimeout(o.wait)
    const zones = await page.evaluate((parts) => {
      const q = parts ? '[data-zone],[data-part]' : '[data-zone]', ids = new Map(), out = {}
      const idOf = (el) => {
        if (ids.has(el)) return ids.get(el)
        let id = el.getAttribute('data-zone') ?? el.getAttribute('data-part')
        const up = el.parentElement?.closest(q)
        if (!id.includes('.') && up) id = idOf(up) + '.' + id
        ids.set(el, id)
        return id
      }
      for (const el of document.querySelectorAll(q)) {
        const b = el.getBoundingClientRect(), cs = getComputedStyle(el)
        if (!b.width || !b.height || cs.visibility === 'hidden' || cs.display === 'none') continue
        let id = idOf(el), n = 2
        while (out[id]) id = idOf(el) + '-' + n++
        out[id] = { r: [b.left + scrollX, b.top + scrollY, b.width, b.height].map(Math.round) }
      }
      return out
    }, !!o.parts)
    return { screens: { [o.screen ?? 'desktop']: { w, h, card: [180, 252], zones } } }
  } finally {
    await browser.close()
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const a = process.argv.slice(2), opt = (k) => { const i = a.indexOf('--' + k); return i < 0 ? undefined : a.splice(i, 2)[1] }
  const w = opt('w'), h = opt('h'), screen = opt('screen'), wait = opt('wait'), pi = a.indexOf('--parts'), parts = pi >= 0
  if (parts) a.splice(pi, 1)
  if (a.length < 2) { console.error('usage: node capture.mjs <url> <out.json> [--w 3840 --h 2160] [--screen desktop] [--parts] [--wait ms]'); process.exit(2) }
  const doc = await capture(a[0], { w: w ? Number(w) : undefined, h: h ? Number(h) : undefined, screen, parts, wait: wait ? Number(wait) : undefined })
  fs.writeFileSync(a[1], JSON.stringify(doc, null, 1) + '\n')
  console.log(`${Object.keys(Object.values(doc.screens)[0].zones).length} zones -> ${a[1]}`)
}

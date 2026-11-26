import { existsSync } from 'node:fs'
import { build } from 'esbuild'
import { chromium, type Browser } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe.skipIf(!existsSync(chromium.executablePath()) && !process.env['CI'])('nested attachment controls in Chromium', () => {
  let browser: Browser
  let script: string
  beforeAll(async () => {
    const result = await build({ bundle: true, write: false, jsx: 'automatic', stdin: { loader: 'tsx', resolveDir: import.meta.dirname, contents: `
      import { createRoot } from 'react-dom/client'
      import { HostStack } from './HostStack.tsx'
      const mark = (id) => { document.getElementById(id).textContent += 'x' }
      const attach = (host) => {
        if (!host) return
        const button = document.createElement('button')
        button.textContent = 'Shadow action'
        button.onclick = () => mark('actions')
        host.attachShadow({ mode: 'open' }).append(button)
      }
      const controls = <>
        <div ref={attach} />
        <img width="20" height="20" alt="Map" useMap="#attachment-map" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" />
        <map name="attachment-map"><area shape="rect" coords="0,0,20,20" href="#chosen" alt="Map action" onClick={() => mark('actions')} /></map>
      </>
      createRoot(document.getElementById('root')).render(<HostStack host="Host" mode="fan" fanDir="down" ms={0} w={100} h={140}
        attachments={[{ key: 'attachment', node: controls }]} onRead={() => mark('reads')} />)
    ` } })
    script = result.outputFiles[0]!.text
    browser = await chromium.launch()
  })
  afterAll(async () => { await browser?.close() })

  it.each(['button', 'area'])('gives Enter to the nested %s only', async (selector) => {
    const page = await browser.newPage()
    try {
      await page.setContent('<div id="root"></div><output id="actions"></output><output id="reads"></output>')
      await page.addScriptTag({ content: script })
      await page.locator(selector).press('Enter')
      expect(await page.locator('#actions').textContent()).toBe('x')
      expect(await page.locator('#reads').textContent()).toBe('')
    } finally { await page.close() }
  })
})

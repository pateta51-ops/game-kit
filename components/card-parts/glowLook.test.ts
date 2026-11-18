import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(here, 'looks', 'icon-glow.css'), 'utf8')
describe('K308 look icon-glow', () => {
  it('exists with balanced braces', () => {
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '').match(/\{/g)?.length).toBe(css.match(/\}/g)?.length)
  })
  it('is not imported by the component', () => {
    for (const f of readdirSync(here).filter((x) => /\.(tsx?|css)$/.test(x) && !x.includes('.test.')))
      expect(readFileSync(join(here, f), 'utf8')).not.toContain('looks/icon-glow')
  })
})

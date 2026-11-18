import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(here, 'looks', 'legal-glow.css'), 'utf8')
describe('K308 look legal-glow', () => {
  it('exists with balanced braces', () => {
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '').match(/\{/g)?.length).toBe(css.match(/\}/g)?.length)
  })
  it('is not imported by the component', () => {
    for (const f of readdirSync(here).filter((x) => /\.(tsx?|css)$/.test(x) && !x.includes('.test.')))
      expect(readFileSync(join(here, f), 'utf8')).not.toContain('looks/legal-glow')
  })
  it('uses no filter and no :hover (shows on touch)', () => {
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/filter/)
    expect(css).not.toContain(':hover')
  })
})
const imp = readFileSync(join(here, 'looks', 'imperium-legal.css'), 'utf8')
describe('K309 look imperium-legal', () => {
  it('balanced, no filter, glow not behind :hover, not imported', () => {
    const c = imp.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(c.match(/\{/g)?.length).toBe(c.match(/\}/g)?.length)
    expect(c).not.toMatch(/filter/)
    expect(c.split('@media')[0]).toContain("[data-mark='legal'] {")
    for (const f of readdirSync(here).filter((x) => /\.(tsx?|css)$/.test(x) && !x.includes('.test.')))
      expect(readFileSync(join(here, f), 'utf8')).not.toContain('looks/imperium-legal')
  })
})

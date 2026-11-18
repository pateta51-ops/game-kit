import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(here, 'looks', 'rise-pulse.css'), 'utf8')
describe('K308 look rise-pulse', () => {
  it('exists with balanced braces', () => {
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '').match(/\{/g)?.length).toBe(css.match(/\}/g)?.length)
  })
  it('is not imported by the component', () => {
    for (const f of readdirSync(here).filter((x) => /\.(tsx?|css)$/.test(x) && !x.includes('.test.')))
      expect(readFileSync(join(here, f), 'utf8')).not.toContain('looks/rise-pulse')
  })
  it('scales by motion and is still under reduced motion', () => {
    expect(css).toContain('max(1ms, calc(var(--buff-ms, 1400ms) * var(--motion-scale, 1)))')
    expect(css).not.toMatch(/infinite/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.fx-rise-pulse \{\s*animation: none;/)
  })
})

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { pickedAttrs, pickedState, pickedStates } from './index'

describe('picked-state', () => {
  it('nothing is dimmed before the first pick', () => {
    expect(pickedStates([1, 2, 3], () => false)).toEqual(['none', 'none', 'none'])
    expect(pickedAttrs(false, false)).toEqual({})
  })
  it('once one is picked the others of the choice are unpicked, still pressable', () => {
    expect(pickedStates([1, 2, 3], (o) => o === 2)).toEqual(['unpicked', 'picked', 'unpicked'])
    expect(pickedAttrs(false, true)).toEqual({ 'data-picked': 'unpicked' })
  })
  it('several picks', () => {
    expect(pickedState(true, true)).toBe('picked')
    expect(pickedStates([1, 2, 3], (o) => o !== 3)).toEqual(['picked', 'picked', 'unpicked'])
  })
})

const here = dirname(fileURLToPath(import.meta.url))
describe('picked-state looks', () => {
  it('picked.css applies no style', () => {
    expect(readFileSync(join(here, 'picked.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').trim()).toBe('')
  })
  it('every look targets only [data-picked] (or :root variables)', () => {
    const files = readdirSync(join(here, 'looks')).sort()
    expect(files).toEqual(['imperium.css', 'kit-classic.css', 'stcc.css'])
    for (const f of files) {
      const css = readFileSync(join(here, 'looks', f), 'utf8')
      const sels = [...css.matchAll(/(?:^|\})\s*([^{}@]+)\{/g)].map((m) => m[1]!.trim())
      expect(sels.length).toBeGreaterThan(0)
      for (const s of sels) expect(s.startsWith('[data-picked') || s.startsWith(':root')).toBe(true)
    }
  })
})

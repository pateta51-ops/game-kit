import { describe, expect, it } from 'vitest'
import { fitReport, fitSize } from './index.ts'

// a box 100 wide: text of n characters needs n * size * 0.5 px
const fits = (n: number) => (s: number) => n * s * 0.5 <= 100

describe('fitSize (K235 A9)', () => {
  it('keeps max when it fits, else the largest size that fits', () => {
    expect(fitSize(fits(10), { min: 8, max: 16 })).toEqual({ size: 16, fits: true })
    expect(fitSize(fits(17), { min: 8, max: 16 })).toEqual({ size: 11.5, fits: true })
  })
  it('never drops text: when min overflows it returns min and fits: false', () => {
    expect(fitSize(fits(100), { min: 8, max: 16 })).toEqual({ size: 8, fits: false })
  })
  it('steps are honoured', () => {
    expect(fitSize(fits(30), { min: 4, max: 16, step: 1 }).size).toBe(6)
  })
  it('fitReport keeps the longest text per zone and lists the zones that overflow at min', () => {
    const r = fitReport([{ zone: 'name', text: 'ab' }, { zone: 'name', text: 'abcdef' }, { zone: 'rules', text: 'x'.repeat(100) }], (_z, t, s) => fits(t.length)(s), { min: 8, max: 16 })
    expect(r.rows.find((x) => x.zone === 'name')?.text).toBe('abcdef')
    expect(r.bad).toEqual(['rules'])
  })
})

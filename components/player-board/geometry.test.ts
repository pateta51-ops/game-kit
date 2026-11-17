import { describe, expect, it } from 'vitest'
import { footprint } from '../card-attachments/geometry.ts'
import { fitZone, handSink, layRow, planBoard } from './index.ts'

const card = { w: 276, h: 386 }
const fp = () => card
const items = (n: number) => Array.from({ length: n }, (_, i) => i)

describe('player-board geometry', () => {
  it('layRow puts cards left to right with a gap; squeeze fans to the edge', () => {
    const r = layRow(items(3), 2000, fp, { gap: 24 })
    expect(r.placed.map((p) => p.x)).toEqual([0, 300, 600])
    const f = layRow(items(4), 600, fp, { squeeze: true })
    expect(f.fits).toBe(false)
    expect(f.placed[3]!.x + 276).toBe(600)
    expect(f.placed[1]!.overlap).toBeGreaterThan(0)
  })
  it('fitZone keeps full size when it fits', () => {
    const r = fitZone(items(3), 1000, 400, card, fp)
    expect(r.scale).toBe(1)
    expect(r.fits).toBe(true)
  })
  it('fitZone shrinks to the largest size that fits one row', () => {
    const r = fitZone(items(3), 600, 400, card, fp, { minWidth: 100 })
    expect(r.scale!).toBeLessThan(1)
    expect(r.width).toBeLessThanOrEqual(600.01)
    expect(new Set(r.placed.map((p) => p.y)).size).toBe(1)
  })
  it('switches to two rows when that allows larger cards', () => {
    const one = fitZone(items(4), 700, 900, card, fp, { minWidth: 10 })
    expect(new Set(one.placed.map((p) => p.y)).size).toBe(2)
    expect(one.scale!).toBeGreaterThan(0.6)
    expect(one.placed.map((p) => p.item)).toEqual([0, 1, 2, 3])
  })
  it('fans below the readable minimum', () => {
    const r = fitZone(items(8), 700, 400, card, fp)
    expect(r.fits).toBe(false)
    expect(r.scale).toBeCloseTo(200 / 276)
    expect(r.placed.some((p) => p.overlap > 0)).toBe(true)
    expect(r.width).toBeLessThanOrEqual(700.01)
  })
  it('a footprint callback sizes an assembly (K245 hook)', () => {
    const r = fitZone(items(2), 2000, 600, card, (i) => (i === 0 ? { w: 400, h: 500 } : card))
    expect(r.placed[1]!.x).toBe(424)
  })
  it('planBoard sizes a host with tucked cards through card-attachments footprint (K245)', () => {
    const tucked: Record<string, number> = { host: 2 }
    const fpt = (id: string | null) => footprint({}, Array.from({ length: tucked[id ?? ''] ?? 0 }, () => ({})), card.w, card.h)
    const z = planBoard({ z: [0, 0, 2000, 600] }, { z: ['host', 'plain'] }, { card, footprint: fpt })['z']!
    expect(z.placed[0]!.w).toBeGreaterThan(card.w)
    expect(z.placed[0]!.h).toBeGreaterThan(card.h)
    expect(z.placed[1]!.w).toBe(card.w)
    expect(z.placed[1]!.x).toBe(6 + z.placed[0]!.w + 24)
  })
  it('planBoard scales with the zone and offsets by the zone origin', () => {
    const cards = { z: ['a', null, 'b'] }
    const big = planBoard({ z: [100, 50, 1000, 400] }, cards, { card })['z']!
    const small = planBoard({ z: [100, 50, 500, 200] }, cards, { card })['z']!
    expect(big.placed[0]!.x).toBe(106)
    expect(big.placed[0]!.y).toBe(56)
    expect(big.placed[1]!.item.id).toBeNull()
    expect(small.scale!).toBeLessThan(big.scale!)
    expect(planBoard({ z: [0, 0, 100, 100] }, {}, { card })['z']!.placed).toEqual([])
  })
  it('handSink sinks only as far as needed', () => {
    expect(handSink(100, 1000, 300, 60)).toBe(0)
    expect(handSink(900, 1000, 300, 60)).toBe(224)
    expect(handSink(2000, 1000, 300, 60)).toBe(240)
  })
})

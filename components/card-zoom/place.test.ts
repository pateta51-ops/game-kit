import { describe, expect, it } from 'vitest'
import { placeZoom, zoomRoom } from './place.ts'

const screen = { width: 3840, height: 2160 }
const inside = (p: { left: number; top: number }, s: { width: number; height: number }, v = screen): boolean =>
  p.left >= 0 && p.top >= 0 && p.left + s.width <= v.width && p.top + s.height <= v.height
const overlaps = (a: { left: number; top: number; right: number; bottom: number }, p: { left: number; top: number }, s: { width: number; height: number }): boolean =>
  p.left < a.right && p.left + s.width > a.left && p.top < a.bottom && p.top + s.height > a.top

describe('placeZoom centred (zoom beside its anchor)', () => {
  const size = { width: 1300, height: 1000 }
  it('right when it fits, centred on the anchor height', () => {
    const p = placeZoom({ left: 400, top: 900, right: 700, bottom: 1300 }, size, screen)
    expect(p).toEqual({ left: 712, top: 600, side: 'right', fits: true })
  })
  it('left near the right edge', () => {
    const a = { left: 3000, top: 1800, right: 3300, bottom: 2100 }
    const p = placeZoom(a, size, screen)
    expect(p.side).toBe('left')
    expect(p.left + size.width).toBe(2988)
    expect(inside(p, size)).toBe(true)
    expect(overlaps(a, p, size)).toBe(false)
  })
  it('below or above when neither side has room, clear of the anchor', () => {
    const wide = { width: 2200, height: 900 }
    const a = { left: 1400, top: 100, right: 2000, bottom: 500 }
    const p = placeZoom(a, wide, screen)
    expect(p.top).toBe(512)
    expect(p.side).toBe('below')
    expect(inside(p, wide) && !overlaps(a, p, wide)).toBe(true)
    const low = { left: 1400, top: 1700, right: 2000, bottom: 2100 }
    const q = placeZoom(low, wide, screen)
    expect(q.side).toBe('above')
    expect(inside(q, wide) && !overlaps(low, q, wide)).toBe(true)
  })
})

describe('placeZoom level with the anchor top (hover preview)', () => {
  const view = { width: 1920, height: 1080 }
  const size = { width: 600, height: 300 }
  const o = { gap: 12, margin: 12, order: ['right', 'left'] as const, align: 'start' as const }
  const card = (left: number, top: number) => ({ left, top, right: left + 150, bottom: top + 210 })
  it('right of a card on the left, level with its top', () => {
    expect(placeZoom(card(100, 400), size, view, o)).toMatchObject({ left: 262, top: 400, side: 'right' })
  })
  it('left of a card near the right edge', () => {
    expect(placeZoom(card(1700, 400), size, view, o)).toMatchObject({ left: 1700 - 12 - 600, top: 400, side: 'left' })
  })
  it('moved up for a card at the bottom, down for one at the top', () => {
    expect(placeZoom(card(100, 950), size, view, o).top).toBe(1080 - 300 - 12)
    expect(placeZoom(card(100, -40), size, view, o).top).toBe(12)
  })
  it('no room either side: inside the bounds over the card, fits false', () => {
    const narrow = { width: 700, height: 900 }
    const at = placeZoom({ left: 200, top: 100, right: 500, bottom: 520 }, size, narrow, o)
    expect(at.fits).toBe(false)
    expect(at.left).toBeGreaterThanOrEqual(12)
    expect(at.left + size.width).toBeLessThanOrEqual(narrow.width - 12)
  })
  it('preview larger than the viewport: at the margin, never negative', () => {
    const p = placeZoom(card(100, 500), { width: 3000, height: 2000 }, view, o)
    expect(p).toMatchObject({ left: 12, top: 12, fits: false })
  })
})

describe('placeZoom in a container, order configurable', () => {
  it('offsets by the container origin and honours order', () => {
    const p = placeZoom({ left: 1100, top: 500, right: 1200, bottom: 600 }, { width: 200, height: 100 }, { left: 1000, top: 400, width: 500, height: 400 }, { order: ['below', 'right'] })
    expect(p.side).toBe('below')
    expect(p.top).toBe(612)
    expect(p.left).toBe(1100 + 50 - 100)
  })
})

describe('placeZoom extras', () => {
  it('rounds left and top', () => {
    const p = placeZoom({ left: 100.4, top: 400.2, right: 250.4, bottom: 610.2 }, { width: 600, height: 300 }, { width: 1920, height: 1080 }, { align: 'start' })
    expect(p.left).toBe(262)
    expect(p.top).toBe(400)
  })
  it('nothing fits: the side with most room among the order, not only left/right', () => {
    expect(placeZoom({ left: 100, top: 100, right: 300, bottom: 200 }, { width: 900, height: 900 }, { width: 1000, height: 1000 })).toMatchObject({ side: 'below', fits: false })
    expect(placeZoom({ left: 400, top: 100, right: 600, bottom: 200 }, { width: 950, height: 950 }, { width: 1000, height: 1000 }, { order: ['left', 'below'] })).toMatchObject({ side: 'below', fits: false })
  })
  it('zoomRoom is the wider side', () => {
    expect(zoomRoom({ left: 100, top: 0, right: 200, bottom: 100 }, 1000)).toEqual({ side: 'right', room: 776 })
    expect(zoomRoom({ left: 800, top: 0, right: 900, bottom: 100 }, 1000)).toEqual({ side: 'left', room: 776 })
  })
})

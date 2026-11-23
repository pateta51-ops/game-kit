import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { imageClipOf, insertLayer, insertRanks, layerStyle, notchOf, notchWindow, tabBox, tabClipOf, tabOf } from './index.ts'
import { SleeveStack, type SleeveFace } from './ui.ts'

// a 100x140 host with a notch in its right edge; inserts 100x150 (a tab of 10 on top, 6 % of their length)
const notched = [[0, 0], [1, 0], [1, 0.3], [0.75, 0.3], [0.75, 0.85], [1, 0.85], [1, 1], [0, 1]] as const
const tabbed = [[0, 0.1], [0.35, 0.1], [0.35, 0], [0.65, 0], [0.65, 0.1], [1, 0.1], [1, 1], [0, 1]] as const
const tabbedB = [[0, 0.1], [0.4, 0.1], [0.4, 0], [0.6, 0], [0.6, 0.1], [1, 0.1], [1, 1], [0, 1]] as const
const f = (src: string, width: number, height: number, outline?: readonly (readonly [number, number])[]): SleeveFace => ({ src, width, height, ...(outline ? { outline } : {}) })
const host = { front: f('hf', 100, 140, notched), back: f('hb', 140, 100) }
const ins = (k: string, o: readonly (readonly [number, number])[] = tabbed) => ({ key: k, front: f(`${k}f`, 100, 150, o), back: f(`${k}b`, 150, 100) })
const parts = (c: HTMLElement, p: string) => [...c.querySelectorAll<HTMLElement>(`[data-part="${p}"]`)]

describe('sleeve geometry (K721)', () => {
  it('an insert longer than its host runs past the open edge: up on top, left when the sleeve opens left', () => {
    const top = insertLayer({ width: 100, height: 140 }, { width: 100, height: 150 }, 'top')!
    expect(top.rotate).toBe(0)
    expect(top.box.x).toBe(0)
    expect(top.box.y).toBeCloseTo(1 - 1.5 / 1.4)
    const left = insertLayer({ width: 140, height: 100 }, { width: 100, height: 150 }, 'left')!
    expect(left.rotate).toBe(-90)
    expect(left.box.x).toBeCloseTo(1 - 1.5 / 1.4)
    expect(left.box.h).toBe(1)
    expect(insertLayer({ width: 0, height: 140 }, { width: 100, height: 150 })).toBeNull()
  })
  it('a turned layer is laid out on its side and turned about its centre', () => {
    const s = layerStyle({ box: { x: -0.1, y: 0, w: 1.1, h: 1 }, rotate: -90 }, 1.4)
    expect(s.transform).toBe('translate(-50%, -50%) rotate(-90deg)')
    expect(s.left).toBe('45%')
    expect(s.width).toBe('71.43%')
    expect(layerStyle({ box: { x: 0, y: -0.1, w: 1, h: 1.1 }, rotate: 0 }, 1).top).toBe('-10%')
  })
  it('reads the tab from the outline and clips to it alone', () => {
    expect(tabOf(tabbed)).toEqual({ top: 0, bodyTop: 0.1 })
    expect(tabOf([[0, 0], [1, 0], [1, 1], [0, 1]])).toBeNull()
    expect(tabOf(undefined)).toBeNull()
    expect(tabClipOf(tabbed, 0.1)).not.toMatch(/% 100%/)
  })
  it('a tab the host hides stands out to show; one already past stays; each rank behind steps out further', () => {
    const tab = { top: 0, bodyTop: 0.1 }
    const flush = { box: { x: 0, y: 0, w: 1, h: 1 }, rotate: 0 as const }
    expect(tabBox(flush, tab, 0).y).toBeCloseTo(-0.1)
    expect(tabBox(flush, tab, 1).y).toBeCloseTo(-0.135)
    const past = { box: { x: -0.2, y: 0, w: 1.2, h: 1 }, rotate: -90 as const }
    expect(tabBox(past, tab, 0).x).toBeCloseTo(-0.2)
    expect(tabBox(past, tab, 1, 0.5).x).toBeCloseTo(-0.26)
  })
  it('ranks: index 0 is nearest from the front, the last from the back', () => {
    expect(insertRanks(1, 'front')).toEqual([0])
    expect(insertRanks(2, 'front')).toEqual([0, 1])
    expect(insertRanks(2, 'back')).toEqual([1, 0])
  })
  it('clips a die-cut image, not pre-cut art', () => {
    expect(imageClipOf({ outline: notched })).toMatch(/^polygon\(/)
    expect(imageClipOf({ outline: notched, cutout: true })).toBeUndefined()
  })
  it('finds the notch and splits it among the inserts', () => {
    const n = notchOf(notched, 'right')!
    expect(n).toEqual({ from: 0.3, to: 0.85, inner: 0.75 })
    expect(notchOf([[0, 0], [1, 0], [1, 1], [0, 1]], 'right')).toBeNull()
    expect(notchWindow(n, 1, 2, 'right').y).toBeCloseTo(0.575)
  })
})

describe('SleeveStack (K721)', () => {
  it('one insert: its front under the host front, cut to its die-cut, and its tab past the top', () => {
    const { container } = render(<SleeveStack host={host} inserts={[ins('a')]} face="front" />)
    const [layer] = parts(container, 'sleeve-insert')
    expect(layer!.getAttribute('src')).toBe('af')
    expect(layer!.style.clipPath).toMatch(/^polygon\(/)
    const [tab] = parts(container, 'sleeve-tab')
    expect(Number.parseFloat(tab!.style.top)).toBeLessThan(Number.parseFloat(layer!.style.top))
    const all = [...container.querySelectorAll('img')]
    expect(all.at(-1)!.dataset.part).toBe('sleeve-host')
    expect(all.at(-1)!.style.clipPath).toMatch(/^polygon\(/)
  })
  it('the back face shows the inserts\' backs under the host back, turned with a left opening', () => {
    const { container } = render(<SleeveStack host={host} inserts={[ins('a')]} face="back" open={{ back: 'left' }} />)
    const [layer] = parts(container, 'sleeve-insert')
    expect(layer!.getAttribute('src')).toBe('ab')
    expect(layer!.style.transform).toContain('rotate(-90deg)')
    expect(parts(container, 'sleeve-host')[0]!.getAttribute('src')).toBe('hb')
    expect(parts(container, 'sleeve-tab')).toHaveLength(0) // the back scan has no outline, so no tab
  })
  it('two inserts: the one nearer the viewer is drawn last on each face, the one behind stands further out', () => {
    const two = [ins('a'), ins('b', tabbedB)]
    const front = render(<SleeveStack host={host} inserts={two} face="front" />).container
    expect(parts(front, 'sleeve-insert').map((e) => e.getAttribute('src'))).toEqual(['bf', 'af'])
    const tabs = parts(front, 'sleeve-tab')
    expect(tabs.map((e) => e.dataset.rank)).toEqual(['1', '0'])
    expect(Number.parseFloat(tabs[0]!.style.top)).toBeLessThan(Number.parseFloat(tabs[1]!.style.top))
    const back = render(<SleeveStack host={host} inserts={two} face="back" />).container
    expect(parts(back, 'sleeve-insert').map((e) => e.getAttribute('src'))).toEqual(['ab', 'bb'])
  })
  it('tabs={false} draws no tab; children go over the host', () => {
    const { container } = render(<SleeveStack host={host} inserts={[ins('a')]} face="front" tabs={false}><b data-x="over" /></SleeveStack>)
    expect(parts(container, 'sleeve-tab')).toHaveLength(0)
    expect(container.querySelector('[data-part="sleeve"]')!.lastElementChild!.getAttribute('data-x')).toBe('over')
  })
})

import { describe, expect, it } from 'vitest'
import { arcsFor, edgesFor, fanPlaces, gatherFlight, flight, holesPath, totalMs } from './fan.ts'
import { backdropCloses, named, nextInRing, pickEnded, pileModel, pileWords, step } from './logic.ts'

const pile = { x: 800, y: 700, w: 100, h: 140 }
const screen = { width: 1920, height: 1080 }

describe('fan geometry', () => {
  it('lays n cards in one arc of the pile card size, kept on the screen', () => {
    const p = fanPlaces(7, pile, 10, screen)
    expect(p).toHaveLength(7)
    expect(p.every((x) => x.box.w === 100 && x.box.h === 140 && x.row === 0)).toBe(true)
    expect(p[0]!.turn).toBeLessThan(0)
    expect(p[6]!.turn).toBeGreaterThan(0)
    expect(Math.min(...p.map((x) => x.box.x))).toBeGreaterThanOrEqual(0)
    expect(fanPlaces(0, pile, 10, screen)).toEqual([])
  })
  it('a long pile lies in several arcs', () => {
    expect(arcsFor(5, 100, 1920, 15)).toBe(1)
    const rows = arcsFor(60, 100, 1920, 15)
    expect(rows).toBeGreaterThan(1)
    expect(new Set(fanPlaces(60, pile, 10, screen).map((x) => x.row)).size).toBe(rows)
  })
  it('edges: one per card beneath, at most 8', () => {
    expect([0, 1, 2, 9, 40].map(edgesFor)).toEqual([0, 0, 1, 8, 8])
  })
  it('flight starts at the pile and ends at the place; gather is its reverse; no time at speed 0', () => {
    const pl = { ...fanPlaces(3, pile, 10, screen)[1]!, from: pile }
    const f = flight(pl, 1, 3, 10)
    expect(f[0]!.offset).toBe(0)
    expect(f.at(-1)!.transform).toContain('translate(0px, 0px)')
    const g = gatherFlight(pl, 1, 3, 10)
    expect(g[0]!.transform).toBe(f.at(-1)!.transform)
    expect(g[0]!.offset).toBe(0)
    expect(totalMs(5, 0)).toBe(0)
    expect(totalMs(5, 2)).toBe(2 * totalMs(5, 1))
  })
  it('backdrop hole path', () => {
    expect(holesPath([])).toBe('none')
    expect(holesPath([{ x: 1, y: 2, w: 3, h: 4 }])).toContain('evenodd')
  })
})

describe('open / close / pick logic', () => {
  it('toggle opens a pile with cards, gathers an open one, ignores an empty one', () => {
    expect(step('rest', 'toggle', 3)).toBe('fan')
    expect(step('rest', 'toggle', 0)).toBe('rest')
    expect(step('fan', 'toggle', 3)).toBe('gather')
    expect(step('gather', 'toggle', 3)).toBe('gather')
    expect(step('gather', 'done', 3)).toBe('rest')
  })
  it('a changed pile gathers the cards that remain, else rests', () => {
    expect(step('fan', 'changed', 2)).toBe('gather')
    expect(step('fan', 'changed', 0)).toBe('rest')
    expect(step('rest', 'changed', 2)).toBe('rest')
  })
  it('closes when the prompt no longer names its cards, only after it did', () => {
    expect(pickEnded(true, false)).toBe(true)
    expect(pickEnded(false, false)).toBe(false)
    expect(step('fan', 'pickEnded', 2)).toBe('gather')
  })
  it('the backdrop does not close while the cards fly out', () => {
    expect(backdropCloses('fan', false)).toBe(false)
    expect(backdropCloses('fan', true)).toBe(true)
    expect(backdropCloses('gather', true)).toBe(false)
  })
  it('Tab goes round', () => {
    expect([nextInRing(3, 2, false), nextInRing(3, 0, true), nextInRing(3, -1, true)]).toEqual([0, 2, 2])
  })
  it('model from a ZoneView: a null is a back, none is empty; names are the marked ids', () => {
    expect(pileModel({ count: 0 }).top).toBeUndefined()
    expect(pileModel({ count: 4, cards: [null] }, true)).toMatchObject({ top: null, count: 4 })
    expect(pileModel({ count: 3 }).browsable).toBe(false)
    expect(pileModel({ count: 2, cards: ['a', 'b'] }, false).browsable).toBe(false)
    expect(named(['a', null, 'c'], { c: 'legal', z: 'legal' })).toEqual(['c'])
    expect(pileWords('Discard', 12)).toBe('Discard, 12 cards')
    expect(pileWords('Deck', 0)).toBe('Deck, empty')
  })
})

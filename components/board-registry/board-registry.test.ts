import { describe, expect, it } from 'vitest'
import type { Thing } from './index'
import { define, emptyRegistry, get, highlighted, inSpace, mark, moveTo, remove, stackLayout, unknownOffered } from './index'

const reg = () => ([
  { type: 'space', id: 'A' }, { type: 'space', id: 'B' },
  { type: 'piece', id: 'p1', space: 'A' }, { type: 'piece', id: 'p2', space: 'A' }, { type: 'marker', id: 'm1', space: 'B' },
] as Thing[]).reduce(define, emptyRegistry())

describe('board-registry', () => {
  it('lists the things in a space in definition order and moves them', () => {
    let r = reg()
    expect(inSpace(r, 'A').map(t => t.id)).toEqual(['p1', 'p2'])
    expect(inSpace(r, 'A', 'marker')).toEqual([])
    r = moveTo(r, 'piece', 'p1', 'B')
    expect(inSpace(r, 'B').map(t => t.id)).toEqual(['p1', 'm1'])
    expect(get(moveTo(r, 'piece', 'p1', undefined), 'piece', 'p1')?.space).toBeUndefined()
    expect(() => moveTo(r, 'piece', 'zz', 'A')).toThrow()
    expect(get(remove(r, 'piece', 'p2'), 'piece', 'p2')).toBeUndefined()
  })
  it('marks things from the legal-action list; 0 is barred', () => {
    const a = { space: ['B'], piece: { p1: 1, p2: 0 } }
    expect(mark(a, 'space', 'B')).toBe('legal')
    expect(mark(a, 'space', 'A')).toBe('none')
    expect(mark(a, 'piece', 'p2')).toBe('barred')
    expect(mark(a, 'card', 'x')).toBe('none')
    expect(mark(a, 'toString', 'x')).toBe('none')
    expect(mark(a, 'piece', 'toString')).toBe('none')
    expect(mark(a, 'space', 'toString')).toBe('none')
    expect(highlighted(reg(), a).map(t => `${t.id}:${t.mark}`)).toEqual(['B:legal', 'p1:legal', 'p2:barred'])
    expect(unknownOffered(reg(), { space: ['B', 'Z'] })).toEqual(['space:Z'])
  })
  it('stack: collapsed offsets, expanded under the threshold, wrap, clamp', () => {
    expect(stackLayout(3, { collapsed: { dx: 1, dy: 0 } })).toEqual([{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }])
    expect(stackLayout(2, { threshold: 2, major: { dx: 10, dy: 0 } })).toEqual([{ dx: 0, dy: 0 }, { dx: 10, dy: 0 }])
    expect(stackLayout(3, { expanded: true, wrap: 2, major: { dx: 10, dy: 0 }, minor: { dx: 0, dy: 10 } }))
      .toEqual([{ dx: 0, dy: 0 }, { dx: 10, dy: 0 }, { dx: 0, dy: 10 }])
    const c = stackLayout(3, { expanded: true, major: { dx: 5, dy: 0 }, anchor: [15, 5], size: [4, 4], bounds: [0, 0, 20, 20] })
    expect(c.map(p => 15 + p.dx)).toEqual([6, 11, 16])
    expect(stackLayout(0)).toEqual([])
  })
})

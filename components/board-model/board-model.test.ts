import { describe, expect, it } from 'vitest'
import { availableSpaces, baseKinds, createBoard, emptyBoard, fromLayout, hexRows, neighbours, setSpace } from './index.ts'

describe('board-model', () => {
  it('computes adjacency once, symmetric, no duplicates', () => {
    const b = createBoard([{ id: 'a' }, { id: 'b' }, { id: 'c' }], [['a', 'b'], ['b', 'a'], ['b', 'c']])
    expect(neighbours(b, 'b')).toEqual(['a', 'c'])
    expect(neighbours(b, 'a')).toEqual(['b'])
    expect(neighbours(b, 'zz')).toEqual([])
    expect(() => createBoard([{ id: 'a' }], [['a', 'x']])).toThrow()
    expect(() => createBoard([{ id: 'a' }, { id: 'a' }])).toThrow()
  })
  it('hexRows builds six neighbours inside and skips holes', () => {
    const b = hexRows([['land', 'land', 'land'], ['land', 'land', 'land'], ['land', 'land', 'land']])
    expect(neighbours(b, '1,1').slice().sort()).toEqual(['0,1', '0,2', '1,0', '1,2', '2,1', '2,2'])
    const h = hexRows([['land', null, 'land']])
    expect(neighbours(h, '0,0')).toEqual([])
  })
  it('adapts board-layout output', () => {
    const b = fromLayout({ nodes: { A: [0, 0, 10, 10], B: [20, 0, 10, 10] }, edges: [['A', 'B', 5, 5, 25, 5]] }, id => (id === 'B' ? 'water' : 'land'))
    expect(neighbours(b, 'A')).toEqual(['B'])
    expect(b.spaces.A).toMatchObject({ x: 5, y: 5, type: 'land' })
    expect(availableSpaces(b, baseKinds(), 'water').map(s => s.id)).toEqual(['B'])
  })
  it('resolves named kinds on an empty board fixture', () => {
    const e = emptyBoard(3)
    expect(availableSpaces(e, baseKinds(), 'land')).toHaveLength(3)
    expect(() => availableSpaces(e, baseKinds(), 'nope')).toThrow()
  })
  it('isolated and away-from respect tiles', () => {
    let b = createBoard([{ id: 'a', type: 'land' }, { id: 'b', type: 'land' }, { id: 'c', type: 'land' }], [['a', 'b']])
    b = setSpace(b, 'a', { tile: 'city' })
    const k = baseKinds()
    expect(availableSpaces(b, k, 'land').map(s => s.id)).toEqual(['b', 'c'])
    expect(availableSpaces(b, k, 'isolated').map(s => s.id)).toEqual(['c'])
    expect(availableSpaces(b, k, 'away-from', { tile: 'city' }).map(s => s.id)).toEqual(['c'])
    expect(b.adjacency).toBe(setSpace(b, 'c', { owner: 'p1' }).adjacency)
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type GridMap, adjacent, adjacentTiles, area, cellsOf, columnOf, distance, firstSteps, gridMap, line, lineOfSight, neighbours, rotateTile, rowOf, shortestPaths, spaceAt, spacesOf, tileOf, within } from './index.ts'

// 4 x 6, two 4 x 3 tiles A (left) and B (right). | and _ are walls, HH is the merged space 'hall'.
//      c0  c1  c2  c3  c4  c5
// r0    . | .   . | .   .   .      r0c0 east (marked by r0c0); r0c3 west (marked by B's cell)
// r1    .   .   .   H   H   .
// r2    .   .   . | .   .   .      r2c2 east (marked by A's cell, on A's outer edge)
// r3    . | _   .   .   .   .      r3c1 west and north (they meet at one corner)
const M = gridMap({
  rows: 4,
  cols: 6,
  walls: [[0, 0, 'e'], [3, 1, 'w'], [3, 1, 'n'], [2, 2, 'e'], [0, 3, 'w']],
  merges: [{ id: 'hall', cells: [[1, 3], [1, 4]] }],
  tiles: [{ id: 'A', row: 0, col: 0, rows: 4, cols: 3 }, { id: 'B', row: 0, col: 3, rows: 4, cols: 3 }],
})
const O = gridMap({ rows: 5, cols: 5 })
// 1 x 3 corridor with a wall between c0 and c1; `sealed` also walls the top and bottom of c1, so both wall ends are junctions
const oneWall = gridMap({ rows: 1, cols: 3, walls: [[0, 1, 'w']] })
const sealed = gridMap({ rows: 1, cols: 3, walls: [[0, 1, 'w'], [0, 1, 'n'], [0, 1, 's']] })
// 3 x 3 with one wall segment between r1c0 and r1c1: both its ends are inside the board
const gap = gridMap({ rows: 3, cols: 3, walls: [[1, 1, 'w']] })

describe('grid-map: steps', () => {
  it('a wall blocks both ways, whichever side marks it', () => {
    expect(neighbours(M, 'r0c0')).toEqual(['r1c0'])
    expect(neighbours(M, 'r0c1')).toEqual(['r0c2', 'r1c1'])
    expect(neighbours(M, 'r3c1')).toEqual(['r3c2'])
    expect(neighbours(M, 'r3c0')).toEqual(['r2c0'])
    expect(neighbours(M, 'r2c1')).toEqual(['r1c1', 'r2c0', 'r2c2'])
    expect(neighbours(gridMap({ rows: 1, cols: 2, walls: [[0, 0, 'e'], [0, 1, 'w']] }), 'r0c0')).toEqual([])
  })
  it('a merged space is one space with its own id', () => {
    expect(spaceAt(M, 1, 3)).toBe('hall')
    expect(spaceAt(M, 1, 4)).toBe('hall')
    expect(spaceAt(M, 9, 9)).toBeNull()
    expect(cellsOf(M, 'hall')).toEqual([[1, 3], [1, 4]])
    expect(M.spaces).toHaveLength(23)
    expect(neighbours(M, 'hall')).toEqual(['r0c3', 'r0c4', 'r1c2', 'r1c5', 'r2c3', 'r2c4'])
    expect(distance(M, 'r1c2', 'r1c5')).toBe(2)
    expect(shortestPaths(M, 'r0c3', ['r2c4'])).toEqual({ distance: 2, paths: [['r0c3', 'hall', 'r2c4']], overflow: false })
  })
  it('the diagonal one corner past a wall end is allowed', () => {
    expect(neighbours(M, 'r1c0', { diagonal: true })).toEqual(['r0c0', 'r1c1', 'r2c0', 'r2c1'])
    expect(neighbours(M, 'r2c1', { diagonal: true })).toContain('r1c0')
  })
  it('the diagonal through a corner where a wall ends is barred', () => {
    expect(neighbours(M, 'r0c0', { diagonal: true })).toEqual(['r1c0'])
    expect(neighbours(M, 'r1c0', { diagonal: true })).not.toContain('r0c1')
    expect(neighbours(M, 'r1c1', { diagonal: true })).not.toContain('r0c0')
    expect(neighbours(gridMap({ rows: 4, cols: 6 }), 'r0c0', { diagonal: true })).toEqual(['r0c1', 'r1c0', 'r1c1'])
  })
  it("wallEnd 'open' allows the diagonal through the free end of one wall segment, never through a junction", () => {
    expect(neighbours(M, 'r0c0', { diagonal: true, wallEnd: 'open' })).toEqual(['r1c0', 'r1c1'])
    expect(neighbours(M, 'r0c0', { diagonal: true, wallEnd: 'closed' })).toEqual(['r1c0'])
    expect(neighbours(M, 'r1c0', { diagonal: true, wallEnd: 'open' })).toContain('r0c1')
    expect(neighbours(M, 'r2c0', { diagonal: true, wallEnd: 'open' })).not.toContain('r3c1')
    expect(neighbours(M, 'r3c0', { diagonal: true, wallEnd: 'open' })).not.toContain('r2c1')
    expect(neighbours(M, 'r0c0', { wallEnd: 'open' })).toEqual(['r1c0'])
    expect(distance(M, 'r0c0', 'r0c1', { diagonal: true, wallEnd: 'open' })).toBe(2)
    expect(shortestPaths(M, 'r0c0', 'r0c1', { diagonal: true, wallEnd: 'open' }).paths).toEqual([['r0c0', 'r1c0', 'r0c1'], ['r0c0', 'r1c1', 'r0c1']])
    expect(shortestPaths(M, 'r0c0', 'r0c1', { diagonal: true }).distance).toBe(3)
    expect(within(M, 'r0c0', 1, { diagonal: true, wallEnd: 'open' })).toEqual(['r1c0', 'r1c1'])
    expect(adjacent(M, 'r0c0', { diagonal: true, wallEnd: 'open' })).toEqual(['r1c0', 'r1c1'])
    expect(line(M, 'r0c0', 'se', { stopAtWall: true, wallEnd: 'open' })).toEqual(['r1c1', 'r2c2', 'r3c3'])
    expect(line(M, 'r2c0', 'se', { stopAtWall: true, wallEnd: 'open' })).toEqual([])
  })
  it('a diagonal between two plain cells past the corner of a merged space is a step', () => {
    expect(neighbours(M, 'r0c5', { diagonal: true })).toContain('r1c5')
    expect(neighbours(M, 'r0c4', { diagonal: true })).toEqual(['r0c3', 'r0c5', 'hall', 'r1c5'])
    expect(neighbours(M, 'r1c5', { diagonal: true })).toContain('r0c4')
  })
  it('no diagonal step enters or leaves a merged space', () => {
    expect(neighbours(M, 'r0c2', { diagonal: true })).toEqual(['r0c1', 'r1c1', 'r1c2'])
    expect(neighbours(M, 'hall', { diagonal: true })).toEqual(neighbours(M, 'hall'))
  })
  it('distance counts steps, to the nearest of a set, and is null when cut off', () => {
    expect(distance(M, 'r0c0', 'r0c1')).toBe(3)
    expect(distance(M, 'r0c0', 'r0c1', { diagonal: true })).toBe(3)
    expect(distance(M, 'r0c0', new Set(['r0c1', 'r2c0']))).toBe(2)
    expect(distance(M, 'r0c0', ['r0c0'])).toBe(0)
    expect(distance(O, 'r0c0', 'r4c4')).toBe(8)
    expect(distance(O, 'r0c0', 'r4c4', { diagonal: true })).toBe(4)
    const cut = gridMap({ rows: 1, cols: 2, walls: [[0, 0, 'e']] })
    expect(distance(cut, 'r0c0', 'r0c1')).toBeNull()
    expect(shortestPaths(cut, 'r0c0', 'r0c1')).toEqual({ distance: null, paths: [], overflow: false })
    expect(() => distance(M, 'nowhere', 'r0c0')).toThrow('unknown space')
  })
})

describe('grid-map: shortestPaths', () => {
  it('returns every tied path, ordered by the sequence of space ids', () => {
    expect(shortestPaths(M, 'r2c3', ['r3c4'])).toEqual({ distance: 2, paths: [['r2c3', 'r2c4', 'r3c4'], ['r2c3', 'r3c3', 'r3c4']], overflow: false })
    expect(shortestPaths(O, 'r0c0', ['r1c2', 'r2c1']).paths).toEqual([
      ['r0c0', 'r0c1', 'r0c2', 'r1c2'],
      ['r0c0', 'r0c1', 'r1c1', 'r1c2'],
      ['r0c0', 'r0c1', 'r1c1', 'r2c1'],
      ['r0c0', 'r1c0', 'r1c1', 'r1c2'],
      ['r0c0', 'r1c0', 'r1c1', 'r2c1'],
      ['r0c0', 'r1c0', 'r2c0', 'r2c1'],
    ])
    expect(shortestPaths(O, 'r0c0', 'r1c1', { diagonal: true }).paths).toEqual([['r0c0', 'r1c1']])
  })
  it('stops at maxPaths and says more exist', () => {
    expect(shortestPaths(M, 'r2c3', ['r3c4'], { maxPaths: 2 }).overflow).toBe(false)
    expect(shortestPaths(M, 'r2c3', ['r3c4'], { maxPaths: 1 })).toEqual({ distance: 2, paths: [['r2c3', 'r2c4', 'r3c4']], overflow: true })
    const big = shortestPaths(gridMap({ rows: 8, cols: 9 }), 'r0c0', ['r7c8'])
    expect(big.paths).toHaveLength(64)
    expect(big.overflow).toBe(true)
    expect(big.distance).toBe(15)
  })
  it('p95 under 1 ms on a 9 x 8 grid (5 ms allowed on a shared CI machine)', () => {
    const g = gridMap({ rows: 8, cols: 9, walls: [[3, 0, 's'], [3, 1, 's'], [3, 2, 's'], [4, 6, 'e'], [5, 6, 'e'], [1, 4, 'w']], merges: [{ id: 'room', cells: [[6, 3], [6, 4], [7, 3], [7, 4]] }] })
    const ends = ['r7c8', 'r0c8', 'r7c0', 'r4c4', 'room']
    for (let i = 0; i < 50; i++) shortestPaths(g, 'r0c0', [ends[i % 5] as string], { diagonal: i % 2 === 0 })
    const times: number[] = []
    for (let i = 0; i < 400; i++) {
      const t = performance.now()
      shortestPaths(g, 'r0c0', [ends[i % 5] as string], { diagonal: i % 2 === 0 })
      times.push(performance.now() - t)
    }
    times.sort((a, b) => a - b)
    expect(times[379] as number).toBeLessThan(5)
  })
})

describe('grid-map: lineOfSight', () => {
  it('sees across a merged space and from one', () => {
    expect(lineOfSight(M, 'r1c2', 'r1c5')).toBe(true)
    expect(lineOfSight(M, 'hall', 'r3c5')).toBe(true)
    expect(lineOfSight(M, 'hall', 'hall')).toBe(true)
  })
  it('touching the free end of a single wall segment is clear', () => {
    expect(lineOfSight(gap, 'r1c0', 'r1c2')).toBe(true)
    expect(lineOfSight(gridMap({ rows: 3, cols: 3, walls: [[1, 1, 'w'], [0, 1, 'w']] }), 'r1c0', 'r1c2')).toBe(true)
  })
  it('a wall end on the border of the board is not a free end: a wall across the full width blocks', () => {
    expect(lineOfSight(oneWall, 'r0c0', 'r0c2')).toBe(false)
    expect(lineOfSight(oneWall, 'r0c0', 'r0c1')).toBe(false)
    expect(lineOfSight(oneWall, 'r0c1', 'r0c2')).toBe(true)
    expect(lineOfSight(gridMap({ rows: 2, cols: 3, walls: [[0, 1, 'w']] }), 'r0c0', 'r0c2')).toBe(true)
    expect(lineOfSight(gridMap({ rows: 2, cols: 3, walls: [[0, 1, 'w'], [1, 1, 'w']] }), 'r0c0', 'r0c2')).toBe(false)
  })
  it('a wall lying on the border of the board blocks no sight', () => {
    expect(lineOfSight(gridMap({ rows: 1, cols: 3, walls: [[0, 1, 'n'], [0, 1, 's'], [0, 0, 'w']] }), 'r0c0', 'r0c2')).toBe(true)
  })
  it('running along a wall blocks, where that alone decides', () => {
    // the upper corners of r1c0 and r1c2 are wall junctions or border ends, so only segments on the line under them are left
    const others: [number, number, 'n' | 'w'][] = [[1, 0, 'n'], [0, 1, 'w'], [1, 2, 'n'], [0, 2, 'w']]
    expect(lineOfSight(gridMap({ rows: 3, cols: 3, walls: others }), 'r1c0', 'r1c2')).toBe(true)
    expect(lineOfSight(gridMap({ rows: 3, cols: 3, walls: [...others, [2, 1, 'n']] }), 'r1c0', 'r1c2')).toBe(false)
  })
  it('touching a point where two wall segments meet blocks', () => {
    expect(lineOfSight(gridMap({ rows: 3, cols: 3, walls: [[1, 1, 'w'], [0, 1, 'w'], [2, 1, 'w']] }), 'r1c0', 'r1c2')).toBe(false)
    expect(lineOfSight(gridMap({ rows: 4, cols: 3, walls: [[1, 1, 'w'], [2, 1, 'w']] }), 'r1c0', 'r1c2')).toBe(true)
    expect(lineOfSight(gridMap({ rows: 4, cols: 3, walls: [[1, 1, 'w'], [2, 1, 'w'], [0, 1, 'w']] }), 'r1c0', 'r1c2')).toBe(false)
    expect(lineOfSight(sealed, 'r0c0', 'r0c2')).toBe(false)
    expect(lineOfSight(sealed, 'r0c2', 'r0c0')).toBe(false)
    expect(lineOfSight(sealed, 'r0c0', 'r0c1')).toBe(false)
    expect(lineOfSight(sealed, 'r0c1', 'r0c2')).toBe(true)
  })
  it('a long wall blocks what is behind it', () => {
    const g = gridMap({ rows: 3, cols: 3, walls: [[1, 0, 'n'], [1, 1, 'n'], [1, 2, 'n']] })
    expect(lineOfSight(g, 'r0c1', 'r2c1')).toBe(false)
    expect(lineOfSight(g, 'r0c0', 'r0c2')).toBe(true)
    expect(lineOfSight(gridMap({ rows: 3, cols: 3 }), 'r0c1', 'r2c1')).toBe(true)
  })
})

describe('grid-map: tiles', () => {
  it('tileOf, spacesOf, adjacentTiles', () => {
    expect(tileOf(M, 'r0c0')).toBe('A')
    expect(tileOf(M, 'hall')).toBe('B')
    expect(tileOf(O, 'r0c0')).toBeNull()
    expect(spacesOf(M, 'B')).toEqual(['r0c3', 'r0c4', 'r0c5', 'hall', 'r1c5', 'r2c3', 'r2c4', 'r2c5', 'r3c3', 'r3c4', 'r3c5'])
    expect(adjacentTiles(M, 'A')).toEqual(['B'])
    const four = gridMap({ rows: 2, cols: 2, tiles: [{ id: 'a', row: 0, col: 0, rows: 1, cols: 1 }, { id: 'b', row: 0, col: 1, rows: 1, cols: 1 }, { id: 'c', row: 1, col: 0, rows: 1, cols: 1 }, { id: 'd', row: 1, col: 1, rows: 1, cols: 1 }] })
    expect(adjacentTiles(four, 'a')).toEqual(['b', 'c'])
    expect(adjacentTiles(four, 'd')).toEqual(['b', 'c'])
    expect(() => spacesOf(M, 'Z')).toThrow('unknown tile')
  })
  it('a tile turned twice equals the original', () => {
    const once = rotateTile(M, 'A', 180)
    expect(once.grid).not.toEqual(M)
    expect(rotateTile(once.grid, 'A', 180).grid).toEqual(M)
    const b = rotateTile(M, 'B', 180)
    expect(rotateTile(b.grid, 'B', 180).grid).toEqual(M)
  })
  it('walls and merges turn with their tile; the map names each space after the turn', () => {
    const { grid, map } = rotateTile(M, 'A', 180)
    expect(map.r0c0).toBe('r3c2')
    expect(map.r1c1).toBe('r2c1')
    expect(map.hall).toBe('hall')
    expect(map.r0c5).toBe('r0c5')
    expect(grid.tiles[0]?.turn).toBe(180)
    expect(neighbours(grid, 'r3c2')).toEqual(['r2c2', 'r3c3'])
    expect(neighbours(M, 'r3c2')).toEqual(['r2c2', 'r3c1', 'r3c3'])
    const b = rotateTile(M, 'B', 180)
    expect(b.map.r0c3).toBe('r3c5')
    expect(b.map.hall).toBe('hall')
    expect(cellsOf(b.grid, 'hall')).toEqual([[2, 4], [2, 5]])
    // @ts-expect-error only 180 is accepted
    expect(() => rotateTile(M, 'A', 90)).toThrow('180')
  })
  it('a wall on a tile outer edge goes with the tile whose cell marks it', () => {
    const { grid } = rotateTile(M, 'A', 180)
    expect(neighbours(M, 'r2c2')).not.toContain('r2c3')
    expect(neighbours(grid, 'r2c2')).toContain('r2c3')
    expect(neighbours(M, 'r0c2')).not.toContain('r0c3')
    expect(neighbours(grid, 'r0c2')).toEqual(['r1c2'])
  })
})

describe('grid-map: targeting shapes on an open grid', () => {
  it('within', () => {
    expect(within(O, 'r2c2', 1)).toEqual(['r1c2', 'r2c1', 'r2c3', 'r3c2'])
    expect(within(O, 'r2c2', 2)).toHaveLength(12)
    expect(within(O, 'r2c2', 1, { diagonal: true })).toHaveLength(8)
    expect(within(O, 'r2c2', 2, { sight: true })).toEqual(within(O, 'r2c2', 2))
    expect(within(O, 'r0c0', 0)).toEqual([])
  })
  it('adjacent', () => {
    expect(adjacent(O, 'r0c0')).toEqual(['r0c1', 'r1c0'])
    expect(adjacent(O, 'r0c0', { diagonal: true })).toEqual(['r0c1', 'r1c0', 'r1c1'])
    expect(adjacent(O, 'r0c0', { throughWalls: true })).toEqual(['r0c1', 'r1c0'])
  })
  it('rowOf and columnOf', () => {
    expect(rowOf(O, 'r2c2')).toEqual(['r2c0', 'r2c1', 'r2c2', 'r2c3', 'r2c4'])
    expect(columnOf(O, 'r2c2')).toEqual(['r0c2', 'r1c2', 'r2c2', 'r3c2', 'r4c2'])
    expect(rowOf(O, 'r2c2', { stopAtWall: true })).toEqual(rowOf(O, 'r2c2'))
  })
  it('line', () => {
    expect(line(O, 'r2c2', 'ne')).toEqual(['r1c3', 'r0c4'])
    expect(line(O, 'r2c0', 'e', { length: 2 })).toEqual(['r2c1', 'r2c2'])
    expect(line(O, 'r2c2', 'sw', { stopAtWall: true })).toEqual(['r3c1', 'r4c0'])
    expect(line(O, 'r0c0', 'n')).toEqual([])
    // @ts-expect-error not one of the 8 directions
    expect(() => line(O, 'r0c0', 'up')).toThrow('unknown direction')
  })
  it('area', () => {
    expect(area(O, 'r2c2', 1, { square: true })).toEqual(['r1c1', 'r1c2', 'r1c3', 'r2c1', 'r2c2', 'r2c3', 'r3c1', 'r3c2', 'r3c3'])
    expect(area(O, 'r2c2', 1, { diamond: true })).toEqual(['r1c2', 'r2c1', 'r2c2', 'r2c3', 'r3c2'])
    expect(area(O, 'r0c0', 2, { diamond: true })).toEqual(['r0c0', 'r0c1', 'r0c2', 'r1c0', 'r1c1', 'r2c0'])
    // @ts-expect-error the shape must be named
    expect(() => area(O, 'r2c2', 1, {})).toThrow('exactly one')
  })
})

describe('grid-map: targeting shapes on a walled grid', () => {
  it('within counts steps round walls; throughWalls counts cells; sight drops what is hidden', () => {
    expect(within(M, 'r0c0', 2)).toEqual(['r1c0', 'r1c1', 'r2c0'])
    expect(within(M, 'r0c0', 2, { throughWalls: true })).toEqual(['r0c1', 'r0c2', 'r1c0', 'r1c1', 'r2c0'])
    expect(within(sealed, 'r0c0', 2)).toEqual([])
    expect(within(sealed, 'r0c0', 2, { throughWalls: true })).toEqual(['r0c1', 'r0c2'])
    expect(within(sealed, 'r0c0', 2, { throughWalls: true, sight: true })).toEqual([])
    expect(within(oneWall, 'r0c0', 2, { throughWalls: true, sight: true })).toEqual([])
    expect(within(gap, 'r1c0', 1, { throughWalls: true, sight: true })).toEqual(['r0c0', 'r1c1', 'r2c0'])
    expect(within(gap, 'r1c0', 1)).toEqual(['r0c0', 'r2c0'])
  })
  it('adjacent: walls block unless throughWalls', () => {
    expect(adjacent(M, 'r0c0')).toEqual(['r1c0'])
    expect(adjacent(M, 'r0c0', { throughWalls: true })).toEqual(['r0c1', 'r1c0'])
    expect(adjacent(M, 'r1c0', { diagonal: true })).toEqual(['r0c0', 'r1c1', 'r2c0', 'r2c1'])
    expect(adjacent(M, 'r1c0', { diagonal: true, throughWalls: true })).toEqual(['r0c0', 'r0c1', 'r1c1', 'r2c0', 'r2c1'])
  })
  it('rowOf and columnOf ignore walls unless stopAtWall', () => {
    expect(rowOf(M, 'r0c1')).toEqual(['r0c0', 'r0c1', 'r0c2', 'r0c3', 'r0c4', 'r0c5'])
    expect(rowOf(M, 'r0c1', { stopAtWall: true })).toEqual(['r0c1', 'r0c2'])
    expect(rowOf(M, 'r1c0')).toEqual(['r1c0', 'r1c1', 'r1c2', 'hall', 'r1c5'])
    expect(columnOf(M, 'r0c1')).toEqual(['r0c1', 'r1c1', 'r2c1', 'r3c1'])
    expect(columnOf(M, 'r0c1', { stopAtWall: true })).toEqual(['r0c1', 'r1c1', 'r2c1'])
    expect(columnOf(M, 'hall')).toEqual(['r0c3', 'r0c4', 'hall', 'r2c3', 'r2c4', 'r3c3', 'r3c4'])
  })
  it('line ignores walls unless stopAtWall', () => {
    expect(line(M, 'r0c0', 'e')).toEqual(['r0c1', 'r0c2', 'r0c3', 'r0c4', 'r0c5'])
    expect(line(M, 'r0c0', 'e', { stopAtWall: true })).toEqual([])
    expect(line(M, 'r0c1', 'e', { stopAtWall: true })).toEqual(['r0c2'])
    expect(line(M, 'r1c1', 'e')).toEqual(['r1c2', 'hall', 'r1c5'])
    expect(line(M, 'r0c0', 'se')).toEqual(['r1c1', 'r2c2', 'r3c3'])
    expect(line(M, 'r0c0', 'se', { stopAtWall: true })).toEqual([])
    expect(line(M, 'hall', 'e')).toEqual(['r1c5'])
    expect(line(M, 'hall', 's')).toEqual(['r2c3', 'r2c4', 'r3c3', 'r3c4'])
  })
  it('area ignores walls; sight drops what is hidden', () => {
    expect(area(M, 'r0c0', 1, { diamond: true })).toEqual(['r0c0', 'r0c1', 'r1c0'])
    expect(area(M, 'r0c3', 1, { square: true })).toEqual(['r0c2', 'r0c3', 'r0c4', 'r1c2', 'hall'])
    expect(area(sealed, 'r0c0', 2, { square: true })).toEqual(['r0c0', 'r0c1', 'r0c2'])
    expect(area(sealed, 'r0c0', 2, { square: true, sight: true })).toEqual(['r0c0'])
  })
})

describe('grid-map: making one', () => {
  it('a 3 x 3 board with no walls becomes a plain grid', () => {
    const board = { spaces: Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id, i) => [id, { id, x: i % 3, y: Math.floor(i / 3) }])) }
    const all = Object.values(board.spaces)
    const g = gridMap({ rows: Math.max(...all.map(s => s.y)) + 1, cols: Math.max(...all.map(s => s.x)) + 1 })
    const cell = (id: string) => `r${board.spaces[id]?.y}c${board.spaces[id]?.x}`
    const name = Object.fromEntries(all.map(s => [cell(s.id), s.id]))
    expect(g.spaces).toHaveLength(9)
    expect(neighbours(g, cell('e')).map(s => name[s])).toEqual(['b', 'd', 'f', 'h'])
    expect(neighbours(g, cell('e'), { diagonal: true })).toHaveLength(8)
    expect(distance(g, cell('a'), [cell('i')])).toBe(4)
    expect(distance(g, cell('a'), [cell('i')], { diagonal: true })).toBe(2)
    expect(lineOfSight(g, cell('a'), cell('i'))).toBe(true)
    expect(within(g, cell('a'), 1).map(s => name[s])).toEqual(['b', 'd'])
    expect(area(g, cell('e'), 1, { square: true })).toHaveLength(9)
    expect(rowOf(g, cell('e')).map(s => name[s])).toEqual(['d', 'e', 'f'])
    expect(line(g, cell('a'), 'se').map(s => name[s])).toEqual(['e', 'i'])
  })
  it('refuses a broken spec', () => {
    expect(() => gridMap({ rows: 0, cols: 3 })).toThrow('rows and cols')
    expect(() => gridMap({ rows: 2, cols: 2, walls: [[2, 0, 'n']] })).toThrow('wall')
    expect(() => gridMap({ rows: 2, cols: 2, merges: [{ id: 'r0c0', cells: [[0, 0]] }] })).toThrow('merge id')
    expect(() => gridMap({ rows: 2, cols: 2, merges: [{ id: 'x', cells: [[0, 0]] }, { id: 'y', cells: [[0, 0]] }] })).toThrow('two merges')
    expect(() => gridMap({ rows: 2, cols: 2, tiles: [{ id: 't', row: 0, col: 0, rows: 2, cols: 2 }, { id: 'u', row: 1, col: 1, rows: 1, cols: 1 }] })).toThrow('overlap')
    expect(() => gridMap({ rows: 1, cols: 2, merges: [{ id: 'x', cells: [[0, 0], [0, 1]] }], tiles: [{ id: 't', row: 0, col: 0, rows: 1, cols: 1 }] })).toThrow('crosses a tile border')
  })
})

describe('grid-map: firstSteps', () => {
  it('an open 5 + 5 stretch: 252 paths overflow, the two first steps do not', () => {
    const open = gridMap({ rows: 6, cols: 6 })
    expect(shortestPaths(open, 'r0c0', 'r5c5').overflow).toBe(true)
    expect(firstSteps(open, 'r0c0', 'r5c5')).toEqual({ distance: 10, starts: [['r0c1'], ['r1c0']] })
    expect(firstSteps(open, 'r0c0', ['r5c5', 'r0c3'])).toEqual({ distance: 3, starts: [['r0c1']] })
  })
  it('walls leave one first step; no way gives none', () => {
    expect(firstSteps(M, 'r0c0', 'r0c1')).toEqual({ distance: 3, starts: [['r1c0']] })
    expect(firstSteps(M, 'r0c0', 'r0c1', { diagonal: true, wallEnd: 'open' }).starts).toEqual([['r1c0'], ['r1c1']])
    expect(firstSteps(gridMap({ rows: 1, cols: 2, walls: [[0, 0, 'e']] }), 'r0c0', 'r0c1')).toEqual({ distance: null, starts: [] })
    expect(firstSteps(O, 'r0c0', 'r0c0')).toEqual({ distance: 0, starts: [] })
    expect(() => firstSteps(M, 'nowhere', 'r0c0')).toThrow('unknown space')
    for (const steps of [NaN, 0, -1, 1.5, Infinity]) expect(() => firstSteps(O, 'r0c0', 'r4c4', { steps })).toThrow('steps must be a whole number above 0')
  })
  it('steps: 2 gives the distinct first two steps, cut at the target', () => {
    expect(firstSteps(O, 'r0c0', 'r4c4', { steps: 2 }).starts).toEqual([['r0c1', 'r0c2'], ['r0c1', 'r1c1'], ['r1c0', 'r1c1'], ['r1c0', 'r2c0']])
    expect(firstSteps(O, 'r0c0', 'r0c1', { steps: 2 }).starts).toEqual([['r0c1']])
    expect(firstSteps(O, 'r0c0', 'r1c1', { steps: 9 }).starts).toEqual(shortestPaths(O, 'r0c0', 'r1c1').paths.map(p => p.slice(1)))
  })
})

describe('grid-map: extra steps', () => {
  const extra = [['r0c0', 'r0c1']] as const
  it('every call that takes steps sees an extra step, both ways', () => {
    expect(neighbours(M, 'r0c0', { extra })).toEqual(['r0c1', 'r1c0'])
    expect(neighbours(M, 'r0c1', { extra })).toEqual(['r0c0', 'r0c2', 'r1c1'])
    expect(neighbours(M, 'r0c0')).toEqual(['r1c0'])
    expect(adjacent(M, 'r0c0', { extra })).toEqual(['r0c1', 'r1c0'])
    expect(distance(M, 'r0c0', 'r0c2', { extra })).toBe(2)
    expect(distance(M, 'r0c2', 'r0c0', { extra })).toBe(2)
    expect(within(M, 'r0c0', 1, { extra })).toEqual(['r0c1', 'r1c0'])
    expect(shortestPaths(M, 'r0c0', 'r0c2', { extra })).toEqual({ distance: 2, paths: [['r0c0', 'r0c1', 'r0c2']], overflow: false })
    expect(firstSteps(M, 'r0c0', 'r0c2', { extra })).toEqual({ distance: 2, starts: [['r0c1']] })
    expect(M.adjacency.orth.r0c0).toEqual(['r1c0'])
  })
  it('an extra step may be a diagonal into a merged space or between any two spaces', () => {
    expect(neighbours(M, 'r0c5', { diagonal: true, extra: [['r0c5', 'hall']] })).toEqual(['r0c4', 'hall', 'r1c5'])
    expect(neighbours(M, 'hall', { extra: [['r0c5', 'hall']] })).toContain('r0c5')
    expect(distance(O, 'r0c0', 'r4c4', { extra: [['r0c0', 'r4c4']] })).toBe(1)
    expect(() => neighbours(M, 'r0c0', { extra: [['r0c0', 'nowhere']] })).toThrow('unknown space')
  })
  it("a 'oneWay' extra step goes from the first space to the second only, in every call", () => {
    const oneWay = [['r0c0', 'r0c1', 'oneWay']] as const
    expect(neighbours(oneWall, 'r0c0', { extra: oneWay })).toEqual(['r0c1'])
    expect(neighbours(oneWall, 'r0c1', { extra: oneWay })).toEqual(['r0c2'])
    expect(distance(oneWall, 'r0c0', 'r0c2', { extra: oneWay })).toBe(2)
    expect(distance(oneWall, 'r0c2', 'r0c0', { extra: oneWay })).toBeNull()
    expect(within(oneWall, 'r0c2', 2, { extra: oneWay })).toEqual(['r0c1'])
    expect(shortestPaths(oneWall, 'r0c0', 'r0c2', { extra: oneWay })).toEqual({ distance: 2, paths: [['r0c0', 'r0c1', 'r0c2']], overflow: false })
    expect(shortestPaths(oneWall, 'r0c2', 'r0c0', { extra: oneWay })).toEqual({ distance: null, paths: [], overflow: false })
    expect(firstSteps(oneWall, 'r0c0', 'r0c2', { extra: oneWay })).toEqual({ distance: 2, starts: [['r0c1']] })
    expect(firstSteps(oneWall, 'r0c2', 'r0c0', { extra: oneWay })).toEqual({ distance: null, starts: [] })
  })
})

describe('grid-map: line with stopAtWall agrees with neighbours', () => {
  it('a diagonal line stops before it enters or leaves a merged space, as the step is barred', () => {
    expect(neighbours(M, 'r0c5', { diagonal: true })).not.toContain('hall')
    expect(line(M, 'r0c5', 'sw', { stopAtWall: true })).toEqual([])
    expect(line(M, 'hall', 'sw', { stopAtWall: true })).toEqual([])
    expect(line(M, 'r0c5', 'sw')).toEqual(['hall', 'r2c3', 'r3c2'])
    expect(line(M, 'r1c2', 'e', { stopAtWall: true })).toEqual(['hall', 'r1c5'])
  })
  it('an extra step lets the line through, as it lets the step through', () => {
    const extra = [['r0c5', 'hall']] as const
    expect(neighbours(M, 'r0c5', { diagonal: true, extra })).toContain('hall')
    expect(line(M, 'r0c5', 'sw', { stopAtWall: true, extra })).toEqual(['hall'])
    expect(line(M, 'r0c0', 'e', { stopAtWall: true, extra: [['r0c0', 'r0c1']] })).toEqual(['r0c1', 'r0c2'])
    expect(line(M, 'r0c1', 'w', { stopAtWall: true, extra: [['r0c0', 'r0c1', 'oneWay']] })).toEqual([])
    expect(() => line(M, 'r0c0', 'e', { stopAtWall: true, extra: [['r0c0', 'nowhere']] })).toThrow('unknown space')
    expect(() => line(M, 'r0c0', 'e', { extra: [['nowhere', 'r0c0', 'oneWay']] })).toThrow('unknown space')
  })
})

// row 1 is a corridor walled above and below; `cut` also walls it between c1 and c2
const hall = gridMap({ rows: 3, cols: 5, walls: [0, 1, 2, 3, 4].flatMap(c => [[1, c, 'n'], [1, c, 's']] as const) })
const cut = gridMap({ rows: 3, cols: 5, walls: [...hall.walls, [1, 2, 'w']] })
// two wall arms meet at corner (2, 2) and run to the border, closing off the top right; only a line through that corner reaches it
const elbow = gridMap({ rows: 4, cols: 4, walls: [[0, 2, 'w'], [1, 2, 'w'], [2, 2, 'n'], [2, 3, 'n']] })
const ins = { insetCorners: true } as const

describe('grid-map: lineOfSight with insetCorners', () => {
  it('without the option every corner of a walled corridor blocks: no space in it sees another (unchanged)', () => {
    expect(lineOfSight(hall, 'r1c0', 'r1c1')).toBe(false)
    expect(lineOfSight(hall, 'r1c0', 'r1c2')).toBe(false)
    expect(lineOfSight(hall, 'r1c0', 'r1c4')).toBe(false)
  })
  it('insetCorners: corridor neighbours and far corridor spaces see each other', () => {
    expect(lineOfSight(hall, 'r1c0', 'r1c1', ins)).toBe(true)
    expect(lineOfSight(hall, 'r1c0', 'r1c2', ins)).toBe(true)
    expect(lineOfSight(hall, 'r1c4', 'r1c0', ins)).toBe(true)
  })
  it('insetCorners: diagonal neighbours with walls east and south of the top-left space do not see each other', () => {
    const g = gridMap({ rows: 3, cols: 3, walls: [[0, 0, 'e'], [0, 0, 's']] })
    expect(lineOfSight(g, 'r0c0', 'r1c1', ins)).toBe(false)
    expect(lineOfSight(g, 'r1c1', 'r0c0', ins)).toBe(false)
  })
  it('insetCorners: a wall on the edge between orthogonal neighbours blocks, free-ended or not', () => {
    expect(lineOfSight(gridMap({ rows: 3, cols: 3, walls: [[1, 1, 'w']] }), 'r1c0', 'r1c1', ins)).toBe(false)
    expect(lineOfSight(oneWall, 'r0c0', 'r0c1', ins)).toBe(false)
    expect(lineOfSight(cut, 'r1c1', 'r1c2', ins)).toBe(false)
    expect(lineOfSight(oneWall, 'r0c1', 'r0c2', ins)).toBe(true)
    expect(lineOfSight(O, 'r2c2', 'r2c3', ins)).toBe(true)
  })
  it('insetCorners: a space with a corner on a long wall never sees past that wall', () => {
    const g = gridMap({ rows: 3, cols: 3, walls: [[1, 0, 'n'], [1, 1, 'n'], [1, 2, 'n']] })
    for (const a of ['r0c0', 'r0c1', 'r0c2']) expect(within(g, a, 4, { throughWalls: true, sight: true, insetCorners: true }).filter(s => !s.startsWith('r0'))).toEqual([])
    expect(lineOfSight(oneWall, 'r0c0', 'r0c2', ins)).toBe(false)
  })
  it('insetCorners: diagonals see each other with no wall or a free wall end at the shared corner', () => {
    expect(lineOfSight(O, 'r1c1', 'r2c2', ins)).toBe(true)
    expect(lineOfSight(O, 'r2c1', 'r1c2', ins)).toBe(true)
    expect(lineOfSight(gridMap({ rows: 3, cols: 3, walls: [[0, 1, 'w']] }), 'r0c0', 'r1c1', ins)).toBe(true)
  })
  it('insetCorners: a wall crossed mid-line blocks; a point where two wall segments meet blocks', () => {
    expect(lineOfSight(cut, 'r1c0', 'r1c3', ins)).toBe(false)
    expect(lineOfSight(cut, 'r1c0', 'r1c1', ins)).toBe(true)
    expect(lineOfSight(elbow, 'r3c0', 'r0c3', ins)).toBe(false)
    expect(lineOfSight(gridMap({ rows: 4, cols: 4, walls: [[0, 2, 'w'], [1, 2, 'w'], [2, 3, 'n']] }), 'r3c0', 'r0c3', ins)).toBe(true)
  })
  it('insetCorners: a space always sees itself', () => {
    expect(lineOfSight(hall, 'r1c0', 'r1c0', ins)).toBe(true)
    expect(lineOfSight(M, 'hall', 'hall', ins)).toBe(true)
  })
  it('within and area pass insetCorners through to sight', () => {
    expect(within(hall, 'r1c0', 2, { sight: true })).toEqual([])
    expect(within(hall, 'r1c0', 2, { sight: true, insetCorners: true })).toEqual(['r1c1', 'r1c2'])
    expect(area(hall, 'r1c0', 1, { diamond: true, sight: true })).toEqual(['r1c0'])
    expect(area(hall, 'r1c0', 1, { diamond: true, sight: true, insetCorners: true })).toEqual(['r1c0', 'r1c1'])
  })
  it('the README corridor recipe runs as written', () => {
    const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8')
    expect(readme).toContain("const hall = gridMap({ rows: 3, cols: 5, walls: [0, 1, 2, 3, 4].flatMap(c => [[1, c, 'n'], [1, c, 's']] as const) })")
    expect(readme).toContain("lineOfSight(hall, 'r1c0', 'r1c4') // false")
    expect(readme).toContain("lineOfSight(hall, 'r1c0', 'r1c4', { insetCorners: true }) // true")
    expect(readme).toContain("within(hall, 'r1c0', 2, { sight: true, insetCorners: true }) // ['r1c1', 'r1c2']")
    expect(lineOfSight(hall, 'r1c0', 'r1c4')).toBe(false)
    expect(lineOfSight(hall, 'r1c0', 'r1c4', ins)).toBe(true)
    expect(within(hall, 'r1c0', 2, { sight: true, insetCorners: true })).toEqual(['r1c1', 'r1c2'])
  })
})

// independent model of the rule: each corner of a cell moves 1/1000 of a side toward the cell's centre (coordinates kept
// as whole thousandths, so all arithmetic is exact). A segment between two such points is blocked by any wall segment it
// meets (closed: its ends count), except where the only point met is an end of that wall that no other wall shares.
// Each meeting point is found by solving the two segments' equations with whole-number numerators and denominators.
// `strict` names one kind of free wall end that blocks anyway (h/v: horizontal/vertical wall; A/B: its top-left/bottom-right end)
function bruteSight(g: GridMap, a: string, b: string, strict?: 'hA' | 'hB' | 'vA' | 'vB'): boolean {
  if (a === b) return true
  const segs = new Map<string, [number, number, number, number]>()
  for (const [r, c, s] of g.walls) {
    const [x1, y1, x2, y2] = s === 'n' ? [c, r, c + 1, r] : s === 's' ? [c, r + 1, c + 1, r + 1] : s === 'w' ? [c, r, c, r + 1] : [c + 1, r, c + 1, r + 1]
    const onBorder = (y1 === y2 && (y1 === 0 || y1 === g.rows)) || (x1 === x2 && (x1 === 0 || x1 === g.cols))
    if (!onBorder) segs.set(`${x1},${y1},${x2},${y2}`, [x1 * 1000, y1 * 1000, x2 * 1000, y2 * 1000])
  }
  const walls = [...segs.values()]
  const shared = (x: number, y: number) => walls.filter(w => (w[0] === x && w[1] === y) || (w[2] === x && w[3] === y)).length
  const pts = (s: string) => g.cells[s]!.flatMap(([r, c]) => [[r * 1000 + 1, c * 1000 + 1], [r * 1000 + 1, c * 1000 + 999], [r * 1000 + 999, c * 1000 + 1], [r * 1000 + 999, c * 1000 + 999]])
  const blocks = (px: number, py: number, qx: number, qy: number, [ax, ay, bx, by]: [number, number, number, number]) => {
    const rx = qx - px, ry = qy - py, sx = bx - ax, sy = by - ay
    const den = rx * sy - ry * sx
    const tn = (ax - px) * sy - (ay - py) * sx
    const un = (ax - px) * ry - (ay - py) * rx
    if (den === 0) {
      if (un !== 0) return false
      const lo = Math.min(px * rx + py * ry, qx * rx + qy * ry), hi = Math.max(px * rx + py * ry, qx * rx + qy * ry)
      const wa = ax * rx + ay * ry, wb = bx * rx + by * ry
      return Math.max(Math.min(wa, wb), lo) <= Math.min(Math.max(wa, wb), hi)
    }
    const [t, u, d] = den > 0 ? [tn, un, den] : [-tn, -un, -den]
    if (t < 0 || t > d || u < 0 || u > d) return false
    if (u === 0) return shared(ax, ay) > 1 || strict === (ay === by ? 'hA' : 'vA')
    if (u === d) return shared(bx, by) > 1 || strict === (ay === by ? 'hB' : 'vB')
    return true
  }
  return pts(a).some(([y1, x1]) => pts(b).some(([y2, x2]) => !walls.some(w => blocks(x1!, y1!, x2!, y2!, w))))
}

// frozen copy of lineOfSight as it was before insetCorners, to keep the default unchanged
function mainSight(g: GridMap, a: string, b: string): boolean {
  const gcd = (p: number, q: number): number => (q ? gcd(q, p % q) : p)
  const clear = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = x2 - x1
    const dy = y2 - y1
    const n = gcd(Math.abs(dx), Math.abs(dy)) || 1
    for (let i = 0; i <= n; i++) if (g.blocked[(y1 + (dy / n) * i) * (g.cols + 1) + x1 + (dx / n) * i]) return false
    for (const [h, x, y] of g.inner) {
      const [a1, a2, p1, p2, aa, p] = h ? [x1, x2, y1, y2, x, y] : [y1, y2, x1, x2, y, x]
      const dp = p2 - p1
      if (!dp) { if (p1 === p && Math.min(a1, a2) <= aa && Math.max(a1, a2) >= aa + 1) return false; continue }
      if ((p - p1) * (p - p2) > 0) continue
      const den = Math.abs(dp)
      const num = (a1 * dp + (p - p1) * (a2 - a1)) * Math.sign(dp)
      if (aa * den < num && num < (aa + 1) * den) return false
    }
    return true
  }
  const corners = (s: string) => g.cells[s]!.flatMap(([r, c]) => [[r, c], [r, c + 1], [r + 1, c], [r + 1, c + 1]] as const)
  if (a === b) return true
  return corners(a).some(([y1, x1]) => corners(b).some(([y2, x2]) => clear(x1, y1, x2, y2)))
}

// a 4 x 4 map where r0c3 sees r3c0 only along a line through the bottom free end of a vertical wall; flipped and turned,
// the same map needs the top end of a vertical wall, and the right and the left end of a horizontal one
type W = [number, number, 'n' | 'e' | 's' | 'w']
const freeEnd: W[] = [[0, 1, 'n'], [0, 1, 'e'], [0, 1, 'w'], [0, 3, 'e'], [1, 1, 'e'], [1, 2, 'e'], [1, 2, 'w'], [1, 3, 'n'], [1, 3, 'e'], [1, 3, 's'], [1, 3, 'w'], [2, 0, 'n'], [2, 3, 'n'], [2, 3, 'e'], [3, 1, 'e'], [3, 2, 'w'], [3, 3, 'n']]
const flipW = (w: W[]) => w.map(([r, c, s]): W => [3 - r, c, ({ n: 's', s: 'n', e: 'e', w: 'w' } as const)[s]])
const turnW = (w: W[]) => w.map(([r, c, s]): W => [c, r, ({ n: 'w', w: 'n', s: 'e', e: 's' } as const)[s]])
const freeEndMaps: ['vB' | 'vA' | 'hB' | 'hA', W[], string, string][] = [['vB', freeEnd, 'r0c3', 'r3c0'], ['vA', flipW(freeEnd), 'r3c3', 'r0c0'], ['hB', turnW(freeEnd), 'r3c0', 'r0c3'], ['hA', turnW(flipW(freeEnd)), 'r3c3', 'r0c0']]

describe('grid-map: insetCorners free wall ends and merged spaces', () => {
  it('insetCorners: a line through the free end of a single wall is clear, for each end of a vertical and a horizontal wall', () => {
    for (const [kind, walls, a, b] of freeEndMaps) {
      const g = gridMap({ rows: 4, cols: 4, walls })
      expect(lineOfSight(g, a, b, ins), kind).toBe(true)
      expect(lineOfSight(g, b, a, ins), kind).toBe(true)
      expect(bruteSight(g, a, b, kind), `${kind}: only the free end lets it through`).toBe(false)
    }
  })
  it('insetCorners: a wall whose line the sight line meets beyond the wall itself does not block', () => {
    const g = gridMap({ rows: 5, cols: 4, walls: [[1, 1, 's'], [1, 2, 'e'], [2, 1, 's'], [3, 0, 's']] })
    expect(lineOfSight(g, 'r0c3', 'r3c0', ins)).toBe(true)
    expect(lineOfSight(g, 'r3c0', 'r0c3', ins)).toBe(true)
  })
  it('insetCorners: a merged space sees, and is seen by, whatever any of its cells sees (each cell inset toward its own centre)', () => {
    const walls: W[] = [[1, 3, 'w'], [2, 2, 'n'], [2, 3, 'w']]
    const cells = [[0, 0], [1, 0], [1, 1]] as const
    const plain = gridMap({ rows: 4, cols: 4, walls })
    const g = gridMap({ rows: 4, cols: 4, walls, merges: [{ id: 'L', cells }] })
    expect(cells.map(([r, c]) => lineOfSight(plain, `r${r}c${c}`, 'r1c3', ins))).toEqual([true, false, false])
    expect(lineOfSight(g, 'L', 'r1c3', ins)).toBe(true)
    expect(lineOfSight(g, 'r1c3', 'L', ins)).toBe(true)
    for (const t of g.spaces.filter(s => s !== 'L')) {
      const any = cells.some(([r, c]) => lineOfSight(plain, `r${r}c${c}`, t, ins))
      expect(lineOfSight(g, 'L', t, ins), t).toBe(any)
      expect(lineOfSight(g, t, 'L', ins), t).toBe(any)
    }
    expect(g.spaces.filter(t => t !== 'L' && !lineOfSight(g, 'L', t, ins)).length).toBeGreaterThan(0)
  })
})

describe('grid-map: lineOfSight against a brute-force model', () => {
  it('on random small walled grids, insetCorners equals the model of the rule, and the default equals main', () => {
    let seed = 655
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    const sides = ['n', 'e', 's', 'w'] as const
    let differ = 0
    let pairs = 0
    for (let k = 0; k < 300; k++) {
      const rows = 1 + Math.floor(rnd() * 7)
      const cols = 1 + Math.floor(rnd() * 7)
      const walls: [number, number, 'n' | 'e' | 's' | 'w'][] = []
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) for (const s of sides) if (rnd() < 0.25) walls.push([r, c, s])
      const merges = cols > 1 && rnd() < 0.3 ? [{ id: 'm', cells: [[rows - 1, 0], [rows - 1, 1]] as const }] : []
      const g = gridMap({ rows, cols, walls, merges })
      for (const a of g.spaces) for (const b of g.spaces) {
        const got = lineOfSight(g, a, b, { insetCorners: true })
        const was = lineOfSight(g, a, b)
        expect(got, `${JSON.stringify(walls)} ${a} ${b} insetCorners`).toBe(bruteSight(g, a, b))
        expect(was, `${JSON.stringify(walls)} ${a} ${b}`).toBe(mainSight(g, a, b))
        if (got !== was) differ++
        pairs++
      }
    }
    expect(differ).toBeGreaterThan(100)
    expect(pairs).toBeGreaterThan(2000)
  })
  it('on random variants of the four free-end maps, insetCorners equals the model, and the free-end exception alone decides pairs of every kind', () => {
    let seed = 655
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    const decided = { hA: 0, hB: 0, vA: 0, vB: 0 }
    for (let k = 0; k < 100; k++) {
      const walls = freeEndMaps[k % 4]![1].filter(() => rnd() > 0.1)
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (const s of ['n', 'e', 's', 'w'] as const) if (rnd() < 0.03) walls.push([r, c, s])
      const g = gridMap({ rows: 4, cols: 4, walls })
      for (const a of g.spaces) for (const b of g.spaces) {
        const want = bruteSight(g, a, b)
        expect(lineOfSight(g, a, b, { insetCorners: true }), `${JSON.stringify(walls)} ${a} ${b}`).toBe(want)
        if (want) for (const kind of ['hA', 'hB', 'vA', 'vB'] as const) if (!bruteSight(g, a, b, kind)) decided[kind]++
      }
    }
    for (const kind of ['hA', 'hB', 'vA', 'vB'] as const) expect(decided[kind], kind).toBeGreaterThan(10)
  })
})

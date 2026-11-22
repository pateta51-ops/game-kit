import { describe, expect, it } from 'vitest'
import { adjacent, adjacentTiles, area, cellsOf, columnOf, distance, firstSteps, gridMap, line, lineOfSight, neighbours, rotateTile, rowOf, shortestPaths, spaceAt, spacesOf, tileOf, within } from './index.ts'

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

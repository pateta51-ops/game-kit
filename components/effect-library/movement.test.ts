import { describe, expect, it } from 'vitest'
import { movements, placements } from './movement.ts'
import { define, emptyRegistry, moveTo, type Thing } from '../board-registry/index.ts'

const rects: Record<string, { x: number; y: number; w: number; h: number }> = { A: { x: 0, y: 0, w: 10, h: 10 }, B: { x: 100, y: 0, w: 10, h: 10 } }
const o = { rectOf: (s: string) => rects[s], stack: { collapsed: { dx: 2, dy: 0 } } }
const reg = () => ([{ type: 'space', id: 'A' }, { type: 'piece', id: 'p1', space: 'A' }, { type: 'piece', id: 'p2', space: 'A' }] as Thing[]).reduce(define, emptyRegistry())

describe('board-registry movement', () => {
  it('stacks pieces in a space and ignores spaces', () => {
    const p = placements(reg(), o)
    expect(Object.keys(p)).toEqual(['piece:p1', 'piece:p2'])
    expect(p['piece:p2']?.rect.x).toBe(2)
  })
  it('gives a motion for the piece that moved and the one that restacks, none when nothing changed', () => {
    const a = reg()
    expect(movements(a, a, o).moves).toEqual([])
    const m = movements(a, moveTo(a, 'piece', 'p1', 'B'), o).moves
    expect(m.map(x => x.id)).toEqual(['piece:p1', 'piece:p2'])
    expect(m[0]?.from?.x).toBe(0)
    expect(m[0]?.to.x).toBe(100)
  })
  it('a piece leaving the board is a ghost', () => {
    const a = reg()
    expect(movements(a, moveTo(a, 'piece', 'p1', undefined), o).ghosts.map(g => g.id)).toEqual(['piece:p1'])
  })
})

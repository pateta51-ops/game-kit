import { entryMotions, type EntryOpts, type Motion, type Placed, type Rect } from '../effect-library/slots'
import { inSpace, stackLayout, type Registry, type StackOpts } from './index'

export type MoveOpts = EntryOpts & {
  /** Piece-like types that are placed in their space (default piece, marker). */
  types?: readonly string[]
  /** Rect of a space on the board; undefined = off the board. */
  rectOf(space: string): Rect | undefined
  /** Size of a piece; default the space rect's own size. */
  size?: readonly [number, number]
  stack?: StackOpts
}

/** Where each piece sits (key `type:id`): its space's anchor plus its stack offset. Pieces off the board are left out. */
export function placements(r: Registry, o: MoveOpts): Record<string, Placed> {
  const out: Record<string, Placed> = {}
  const types = o.types ?? ['piece', 'marker']
  for (const k of r.order) {
    const t = r.things[k]
    if (!t || t.space === undefined || !types.includes(t.type)) continue
    const a = o.rectOf(t.space)
    if (!a) continue
    const group = inSpace(r, t.space).filter(g => types.includes(g.type))
    const [w, h] = o.size ?? [a.w, a.h]
    const off = stackLayout(group.length, { anchor: [a.x, a.y], size: [w, h], ...o.stack })[group.findIndex(g => g.type === t.type && g.id === t.id)]
    out[k] = { rect: { x: a.x + (off?.dx ?? 0), y: a.y + (off?.dy ?? 0), w, h } }
  }
  return out
}

/** Opt-in movement: one Motion per piece whose rect changed between two registries (ids are `type:id`), for the effect library's `move`. A game that never calls it renders as before. */
export const movements = (prev: Registry, next: Registry, o: MoveOpts): { moves: Motion[]; ghosts: ReturnType<typeof entryMotions>['ghosts'] } =>
  entryMotions(placements(prev, o), placements(next, o), o)

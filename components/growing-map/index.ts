import { createBoard, type Board, type Space } from '../board-model/index.ts'
import type { CtxRng } from '../engine-core/index.ts'

export type OpenMapEdge = { readonly id: string; readonly space: string }
export interface TilePlacement {
  readonly spaces: readonly Space[]
  readonly links: readonly (readonly [string, string])[]
  readonly joins: readonly { readonly edge: string; readonly space: string }[]
  readonly openEdges: readonly OpenMapEdge[]
}
export interface GrowingMap<T extends string = string> {
  readonly board: Board
  readonly openEdges: readonly OpenMapEdge[]
  readonly tiles: readonly T[]
}
export type MapGrowthResult<T extends string> =
  | { readonly kind: 'grew'; readonly map: GrowingMap<T>; readonly tile: T }
  | { readonly kind: 'blocked' | 'closed-edge' | 'empty-deck'; readonly map: GrowingMap<T> }

function validateEdges(spaces: Board['spaces'], openEdges: readonly OpenMapEdge[], used: Set<string>): void {
  for (const edge of openEdges) {
    if (!edge.id.trim()) throw new Error('open edge has no id')
    if (used.has(edge.id)) throw new Error(`duplicate open edge ${edge.id}`)
    if (!Object.hasOwn(spaces, edge.space)) throw new Error(`open edge ${edge.id} names unknown space ${edge.space}`)
    used.add(edge.id)
  }
}

/** Seed the hidden tile order once during setup. */
export function createGrowingMap<T extends string>(
  board: Board, openEdges: readonly OpenMapEdge[], tiles: readonly T[], rng: Pick<CtxRng, 'shuffle'>,
): GrowingMap<T> {
  validateEdges(board.spaces, openEdges, new Set())
  if (tiles.some(id => !id.trim())) throw new Error('a tile has no id')
  return { board, openEdges: openEdges.map(edge => ({ ...edge })), tiles: rng.shuffle(tiles, 'map tiles') }
}

/** Resolve the top tile against an open edge and return the complete replacement, or the untouched map. */
export function growMap<T extends string>(
  map: GrowingMap<T>, edgeId: string, place: (tile: T, edge: OpenMapEdge) => TilePlacement | null,
): MapGrowthResult<T> {
  const open = new Map(map.openEdges.map(edge => [edge.id, edge]))
  const edge = open.get(edgeId)
  if (!edge) return { kind: 'closed-edge', map }
  const tile = map.tiles[0]
  if (tile === undefined) return { kind: 'empty-deck', map }
  const placement = place(tile, { ...edge })
  if (!placement) return { kind: 'blocked', map }

  if (!placement.spaces.length) throw new Error('tile has no spaces')
  const ids = new Set<string>()
  for (const space of placement.spaces) {
    if (!space.id.trim()) throw new Error('tile space has no id')
    if (Object.hasOwn(map.board.spaces, space.id)) throw new Error(`tile overwrites existing space ${space.id}`)
    if (ids.has(space.id)) throw new Error(`duplicate space ${space.id}`)
    ids.add(space.id)
  }
  for (const [a, b] of placement.links) {
    if (!ids.has(a) || !ids.has(b)) throw new Error(`link ${a}-${b} must connect new tile spaces`)
  }
  const extension = createBoard([...placement.spaces], placement.links)
  validateEdges(extension.spaces, placement.openEdges, new Set(open.keys()))
  const used = new Set<string>()
  const adjacency = { ...map.board.adjacency, ...extension.adjacency }
  for (const join of placement.joins) {
    const from = open.get(join.edge)
    if (!from || !Object.hasOwn(map.board.spaces, from.space)) throw new Error(`join ${join.edge} needs an open edge on the board`)
    if (!ids.has(join.space)) throw new Error(`join ${join.edge} needs a new tile space`)
    if (used.has(join.edge)) throw new Error(`duplicate join ${join.edge}`)
    used.add(join.edge)
    const adjacent = adjacency[from.space] ?? []
    if (adjacent.includes(join.space)) continue
    adjacency[from.space] = [...adjacent, join.space]
    adjacency[join.space] = [...adjacency[join.space] ?? [], from.space]
  }
  if (!used.has(edgeId)) throw new Error(`tile must join selected edge ${edgeId}`)

  return {
    kind: 'grew', tile,
    map: {
      board: { spaces: { ...map.board.spaces, ...extension.spaces }, order: [...map.board.order, ...extension.order], adjacency },
      tiles: map.tiles.slice(1),
      openEdges: [...map.openEdges.filter(item => !used.has(item.id)), ...placement.openEdges.map(item => ({ ...item }))],
    },
  }
}

export type Space = { id: string; type?: string; x?: number; y?: number; rect?: [number, number, number, number]; tile?: string; owner?: string }
export type Board = { readonly spaces: Readonly<Record<string, Space>>; readonly order: readonly string[]; readonly adjacency: Readonly<Record<string, readonly string[]>> }
export type Kind<C = unknown> = (board: Board, space: Space, ctx: C) => boolean
export type Kinds<C = unknown> = Record<string, Kind<C>>

export function createBoard(spaces: Space[], edges: readonly (readonly [string, string])[] = []): Board {
  const sp: Record<string, Space> = {}
  const adj: Record<string, string[]> = {}
  for (const s of spaces) {
    if (sp[s.id]) throw new Error(`duplicate space ${s.id}`)
    sp[s.id] = s
    adj[s.id] = []
  }
  for (const [a, b] of edges) {
    const la = adj[a]
    const lb = adj[b]
    if (!la || !lb) throw new Error(`edge ${a}-${b}: unknown space`)
    if (a !== b && !la.includes(b)) { la.push(b); lb.push(a) }
  }
  return { spaces: sp, order: spaces.map(s => s.id), adjacency: adj }
}

/** Accepts the output of board-layout's parseLayout (nodes: name to [x,y,w,h]; edges: [a, b, ...coords]); `type` may name a type per space. */
export function fromLayout(
  layout: { nodes: Record<string, readonly number[]>; edges: readonly (readonly (string | number)[])[] },
  type?: (id: string) => string | undefined,
): Board {
  const spaces = Object.entries(layout.nodes).map(([id, r]): Space => {
    const t = type?.(id)
    const [x = 0, y = 0, w = 0, h = 0] = r
    return { id, x: x + w / 2, y: y + h / 2, rect: [x, y, w, h], ...(t === undefined ? {} : { type: t }) }
  })
  return createBoard(spaces, layout.edges.map(e => [String(e[0]), String(e[1])] as const))
}

/** Rows of space types (null = hole), offset-row hex layout: odd rows are shifted half a cell right. Ids are `r,c`. */
export function hexRows(rows: readonly (readonly (string | null)[])[]): Board {
  const spaces: Space[] = []
  const at = new Set<string>()
  rows.forEach((row, r) => row.forEach((t, c) => { if (t !== null) { spaces.push({ id: `${r},${c}`, type: t, x: c + (r % 2) / 2, y: r }); at.add(`${r},${c}`) } }))
  const edges: [string, string][] = []
  for (const s of spaces) {
    const [r, c] = s.id.split(',').map(Number) as [number, number]
    const o = r % 2
    for (const id of [`${r},${c + 1}`, `${r + 1},${c - 1 + o}`, `${r + 1},${c + o}`]) if (at.has(id)) edges.push([s.id, id])
  }
  return createBoard(spaces, edges)
}

export const neighbours = (b: Board, id: string): readonly string[] => b.adjacency[id] ?? []

/** Pure update: the new board shares adjacency; the space records are copied. */
export function setSpace(b: Board, id: string, patch: Partial<Omit<Space, 'id'>>): Board {
  const s = b.spaces[id]
  if (!s) throw new Error(`unknown space ${id}`)
  return { ...b, spaces: { ...b.spaces, [id]: { ...s, ...patch } } }
}

/** Cards name a kind; the board resolves it. Unknown kind throws. */
export function availableSpaces<C = undefined>(b: Board, kinds: Kinds<C>, kind: string, ctx?: C): Space[] {
  const k = kinds[kind]
  if (!k) throw new Error(`unknown placement kind ${kind}`)
  return b.order.map(id => b.spaces[id] as Space).filter(s => k(b, s, ctx as C))
}

/** Empty-board test fixture: `n` spaces s0 to s(n-1) of one type, no edges, no tiles. */
export const emptyBoard = (n = 0, type = 'land'): Board => createBoard(Array.from({ length: n }, (_, i) => ({ id: `s${i}`, type })))

/** Stock kinds: free, type match, and neighbour-based ones. Add game kinds beside them. */
export const baseKinds = (): Kinds<{ tile?: string } | undefined> => ({
  any: (_b, s) => s.tile === undefined,
  land: (_b, s) => s.type === 'land' && s.tile === undefined,
  water: (_b, s) => s.type === 'water' && s.tile === undefined,
  isolated: (b, s) => s.tile === undefined && neighbours(b, s.id).every(n => (b.spaces[n] as Space).tile === undefined),
  'away-from': (b, s, c) => s.tile === undefined && neighbours(b, s.id).every(n => (b.spaces[n] as Space).tile !== c?.tile),
})

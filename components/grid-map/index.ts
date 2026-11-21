export type Side = 'n' | 'e' | 's' | 'w'
export type Direction = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'
export type Cell = readonly [row: number, col: number]
export type Wall = readonly [row: number, col: number, side: Side]
export type Merge = { readonly id: string; readonly cells: readonly Cell[] }
export type Tile = { readonly id: string; readonly row: number; readonly col: number; readonly rows: number; readonly cols: number; readonly turn?: 0 | 180 }
export type GridSpec = { rows: number; cols: number; walls?: readonly Wall[]; merges?: readonly Merge[]; tiles?: readonly Tile[] }
type Adj = Readonly<Record<string, readonly string[]>>
export type GridMap = {
  readonly rows: number
  readonly cols: number
  readonly walls: readonly Wall[]
  readonly merges: readonly Merge[]
  readonly tiles: readonly Tile[]
  readonly spaces: readonly string[]
  readonly cells: Readonly<Record<string, readonly Cell[]>>
  readonly at: readonly string[]
  readonly segments: readonly (readonly [horizontal: boolean, x: number, y: number])[]
  readonly degree: readonly number[]
  readonly adjacency: { readonly orth: Adj; readonly diag: Adj; readonly orthOpen: Adj; readonly diagOpen: Adj }
}
export type Steps = { diagonal?: boolean }
type Targets = string | Iterable<string>

const STEP: Record<Direction, Cell> = { n: [-1, 0], ne: [-1, 1], e: [0, 1], se: [1, 1], s: [1, 0], sw: [1, -1], w: [0, -1], nw: [-1, -1] }
const OPPOSITE: Record<Side, Side> = { n: 's', s: 'n', e: 'w', w: 'e' }
const int = (n: number) => Number.isInteger(n)
const inTile = (t: Tile, r: number, c: number) => r >= t.row && r < t.row + t.rows && c >= t.col && c < t.col + t.cols
const segKey = (h: boolean, x: number, y: number) => `${h ? 'h' : 'v'}${y},${x}`
const edge = (r: number, c: number, side: Side): [boolean, number, number] => side === 'n' ? [true, c, r] : side === 's' ? [true, c, r + 1] : side === 'w' ? [false, c, r] : [false, c + 1, r]

export function gridMap(spec: GridSpec): GridMap {
  const { rows, cols } = spec
  const walls = spec.walls ?? []
  const merges = spec.merges ?? []
  const tiles = (spec.tiles ?? []).map((t): Tile => ({ ...t, turn: t.turn ?? 0 }))
  if (!int(rows) || !int(cols) || rows < 1 || cols < 1) throw new Error(`grid-map: rows and cols must be whole numbers above 0 (got ${rows} x ${cols})`)
  const inside = (r: number, c: number) => int(r) && int(c) && r >= 0 && r < rows && c >= 0 && c < cols
  const at: string[] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) at.push(`r${r}c${c}`)
  const merged = new Set<string>()
  for (const m of merges) {
    if (merged.has(m.id) || /^r\d+c\d+$/.test(m.id)) throw new Error(`grid-map: merge id ${m.id} is taken or looks like a cell id`)
    if (!m.cells.length) throw new Error(`grid-map: merge ${m.id} has no cells`)
    for (const [r, c] of m.cells) {
      if (!inside(r, c)) throw new Error(`grid-map: merge ${m.id} names a cell outside the grid (${r}, ${c})`)
      if (merged.has(at[r * cols + c] as string)) throw new Error(`grid-map: cell (${r}, ${c}) is in two merges`)
      at[r * cols + c] = m.id
    }
    merged.add(m.id)
  }
  const tileIds = new Set<string>()
  const tileAt = (r: number, c: number) => tiles.find(t => inTile(t, r, c))
  for (const t of tiles) {
    if (tileIds.has(t.id)) throw new Error(`grid-map: duplicate tile ${t.id}`)
    tileIds.add(t.id)
    if (t.rows < 1 || t.cols < 1 || !inside(t.row, t.col) || !inside(t.row + t.rows - 1, t.col + t.cols - 1)) throw new Error(`grid-map: tile ${t.id} is outside the grid`)
    for (const u of tiles) if (u !== t && t.row < u.row + u.rows && u.row < t.row + t.rows && t.col < u.col + u.cols && u.col < t.col + t.cols) throw new Error(`grid-map: tiles ${t.id} and ${u.id} overlap`)
  }
  for (const m of merges) {
    const first = tileAt(...(m.cells[0] as Cell))
    if (m.cells.some(([r, c]) => tileAt(r, c) !== first)) throw new Error(`grid-map: merge ${m.id} crosses a tile border`)
  }
  const spaces: string[] = []
  const cells: Record<string, Cell[]> = {}
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const s = at[r * cols + c] as string
    if (!cells[s]) { cells[s] = []; spaces.push(s) }
    cells[s].push([r, c])
  }
  const seen = new Set<string>()
  const segments: [boolean, number, number][] = []
  const degree: number[] = new Array<number>((rows + 1) * (cols + 1)).fill(0)
  for (const [r, c, side] of walls) {
    if (!inside(r, c) || !(side in OPPOSITE)) throw new Error(`grid-map: wall (${r}, ${c}, ${side}) is not a side of a cell of the grid`)
    const [h, x, y] = edge(r, c, side)
    if (seen.has(segKey(h, x, y))) continue
    seen.add(segKey(h, x, y))
    segments.push([h, x, y])
    degree[y * (cols + 1) + x]!++
    degree[(h ? y : y + 1) * (cols + 1) + (h ? x + 1 : x)]!++
  }
  const index = new Map(spaces.map((s, i) => [s, i]))
  const tables = [0, 1, 2, 3].map(() => Object.fromEntries(spaces.map(s => [s, new Set<string>()])))
  const [orth, diag, orthOpen, diagOpen] = tables as [Record<string, Set<string>>, Record<string, Set<string>>, Record<string, Set<string>>, Record<string, Set<string>>]
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const s = at[r * cols + c] as string
    for (const d of Object.keys(STEP) as Direction[]) {
      const [dr, dc] = STEP[d]
      if (!inside(r + dr, c + dc)) continue
      const t = at[(r + dr) * cols + c + dc] as string
      if (t === s) continue
      if (d.length === 1) {
        orthOpen[s]!.add(t); diagOpen[s]!.add(t)
        if (!seen.has(segKey(...edge(r, c, d as Side)))) { orth[s]!.add(t); diag[s]!.add(t) }
      } else if (!merged.has(s) && !merged.has(t)) {
        diagOpen[s]!.add(t)
        if (!degree[(r + (dr > 0 ? 1 : 0)) * (cols + 1) + c + (dc > 0 ? 1 : 0)]) diag[s]!.add(t)
      }
    }
  }
  const sorted = (t: Record<string, Set<string>>): Adj => Object.fromEntries(spaces.map(s => [s, [...(t[s] as Set<string>)].sort((a, b) => (index.get(a) as number) - (index.get(b) as number))]))
  return { rows, cols, walls, merges, tiles, spaces, cells, at, segments, degree, adjacency: { orth: sorted(orth), diag: sorted(diag), orthOpen: sorted(orthOpen), diagOpen: sorted(diagOpen) } }
}

export function cellsOf(g: GridMap, space: string): readonly Cell[] {
  const c = g.cells[space]
  if (!c) throw new Error(`grid-map: unknown space ${space}`)
  return c
}
export const spaceAt = (g: GridMap, row: number, col: number): string | null => (row >= 0 && row < g.rows && col >= 0 && col < g.cols ? g.at[row * g.cols + col] ?? null : null)
const table = (g: GridMap, diagonal?: boolean, open?: boolean): Adj => g.adjacency[diagonal ? (open ? 'diagOpen' : 'diag') : open ? 'orthOpen' : 'orth']
const ordered = (g: GridMap, set: ReadonlySet<string>) => g.spaces.filter(s => set.has(s))
const targets = (g: GridMap, to: Targets) => new Set((typeof to === 'string' ? [to] : [...to]).filter(s => g.cells[s]))

export function neighbours(g: GridMap, space: string, o: Steps = {}): readonly string[] {
  cellsOf(g, space)
  return table(g, o.diagonal)[space] as readonly string[]
}

function flood(adj: Adj, from: Iterable<string>, stop?: ReadonlySet<string>, max = Infinity): Map<string, number> {
  const d = new Map<string, number>()
  let edge: string[] = []
  for (const s of from) if (!d.has(s)) { d.set(s, 0); edge.push(s) }
  for (let n = 1; edge.length && n <= max; n++) {
    if (stop && edge.some(s => stop.has(s))) break
    const next: string[] = []
    for (const s of edge) for (const t of adj[s] as readonly string[]) if (!d.has(t)) { d.set(t, n); next.push(t) }
    edge = next
  }
  return d
}

export function distance(g: GridMap, from: string, to: Targets, o: Steps = {}): number | null {
  cellsOf(g, from)
  const goal = targets(g, to)
  const d = flood(table(g, o.diagonal), [from], goal)
  let best: number | null = null
  for (const t of goal) { const n = d.get(t); if (n !== undefined && (best === null || n < best)) best = n }
  return best
}

export function shortestPaths(g: GridMap, from: string, to: Targets, o: Steps & { maxPaths?: number } = {}): { distance: number | null; paths: string[][]; overflow: boolean } {
  cellsOf(g, from)
  const adj = table(g, o.diagonal)
  const max = o.maxPaths ?? 64
  const d = flood(adj, targets(g, to))
  const total = d.get(from)
  const paths: string[][] = []
  let overflow = false
  if (total === undefined) return { distance: null, paths, overflow }
  const cur = [from]
  const walk = (s: string, left: number): boolean => {
    if (!left) {
      if (paths.length >= max) { overflow = true; return false }
      paths.push([...cur])
      return true
    }
    for (const t of (adj[s] as readonly string[]).filter(x => d.get(x) === left - 1).sort()) {
      cur.push(t)
      const more = walk(t, left - 1)
      cur.pop()
      if (!more) return false
    }
    return true
  }
  walk(from, total)
  return { distance: total, paths, overflow }
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
function clear(g: GridMap, x1: number, y1: number, x2: number, y2: number): boolean {
  const dx = x2 - x1
  const dy = y2 - y1
  const n = gcd(Math.abs(dx), Math.abs(dy)) || 1
  for (let i = 0; i <= n; i++) if ((g.degree[(y1 + (dy / n) * i) * (g.cols + 1) + x1 + (dx / n) * i] as number) > 1) return false
  for (const [h, x, y] of g.segments) {
    // a, b: along the wall; p: across it
    const [a1, a2, p1, p2, a, p] = h ? [x1, x2, y1, y2, x, y] : [y1, y2, x1, x2, y, x]
    const dp = p2 - p1
    if (!dp) { if (p1 === p && Math.min(a1, a2) <= a && Math.max(a1, a2) >= a + 1) return false; continue }
    if ((p - p1) * (p - p2) > 0) continue
    const den = Math.abs(dp)
    const num = (a1 * dp + (p - p1) * (a2 - a1)) * Math.sign(dp)
    if (a * den < num && num < (a + 1) * den) return false
  }
  return true
}
function corners(g: GridMap, space: string): Cell[] {
  const out = new Map<number, Cell>()
  for (const [r, c] of cellsOf(g, space)) for (const [y, x] of [[r, c], [r, c + 1], [r + 1, c], [r + 1, c + 1]] as Cell[]) out.set(y * (g.cols + 1) + x, [y, x])
  return [...out.values()]
}

export function lineOfSight(g: GridMap, a: string, b: string): boolean {
  const pa = corners(g, a)
  const pb = corners(g, b)
  if (a === b) return true
  for (const [y1, x1] of pa) for (const [y2, x2] of pb) if (clear(g, x1, y1, x2, y2)) return true
  return false
}

const tile = (g: GridMap, id: string): Tile => {
  const t = g.tiles.find(x => x.id === id)
  if (!t) throw new Error(`grid-map: unknown tile ${id}`)
  return t
}
export function tileOf(g: GridMap, space: string): string | null {
  const [r, c] = cellsOf(g, space)[0] as Cell
  return g.tiles.find(t => inTile(t, r, c))?.id ?? null
}
export function spacesOf(g: GridMap, id: string): string[] {
  const t = tile(g, id)
  return g.spaces.filter(s => inTile(t, ...((g.cells[s] as readonly Cell[])[0] as Cell)))
}
export function adjacentTiles(g: GridMap, id: string): string[] {
  const t = tile(g, id)
  return g.tiles.filter(u => u !== t && (
    ((t.row + t.rows === u.row || u.row + u.rows === t.row) && t.col < u.col + u.cols && u.col < t.col + t.cols)
    || ((t.col + t.cols === u.col || u.col + u.cols === t.col) && t.row < u.row + u.rows && u.row < t.row + t.rows)
  )).map(u => u.id)
}

export function rotateTile(g: GridMap, id: string, angle: 180): { grid: GridMap; map: Record<string, string> } {
  if (angle !== 180) throw new Error(`grid-map: a tile turns 180 degrees only (got ${String(angle)})`)
  const t = tile(g, id)
  const turn = (r: number, c: number): [number, number] => (inTile(t, r, c) ? [2 * t.row + t.rows - 1 - r, 2 * t.col + t.cols - 1 - c] : [r, c])
  const grid = gridMap({
    rows: g.rows,
    cols: g.cols,
    walls: g.walls.map(([r, c, s]): Wall => (inTile(t, r, c) ? [...turn(r, c), OPPOSITE[s]] : [r, c, s])),
    merges: g.merges.map(m => ({ id: m.id, cells: m.cells.map(([r, c]) => turn(r, c)) })),
    tiles: g.tiles.map(x => (x === t ? { ...x, turn: x.turn === 180 ? 0 : 180 } : x)),
  })
  const map: Record<string, string> = {}
  for (const s of g.spaces) map[s] = grid.at[turn(...((g.cells[s] as readonly Cell[])[0] as Cell)).reduce((r, c) => r * g.cols + c)] as string
  return { grid, map }
}

export function adjacent(g: GridMap, space: string, o: Steps & { throughWalls?: boolean } = {}): readonly string[] {
  cellsOf(g, space)
  return table(g, o.diagonal, o.throughWalls)[space] as readonly string[]
}

export function within(g: GridMap, from: string, n: number, o: Steps & { throughWalls?: boolean; sight?: boolean } = {}): string[] {
  cellsOf(g, from)
  const d = flood(table(g, o.diagonal, o.throughWalls), [from], undefined, n)
  return g.spaces.filter(s => s !== from && d.has(s) && (!o.sight || lineOfSight(g, from, s)))
}

function run(g: GridMap, r: number, c: number, d: Direction, stop?: boolean, length = Infinity): string[] {
  const [dr, dc] = STEP[d]
  const out: string[] = []
  for (let i = 0; i < length; i++) {
    if (r + dr < 0 || r + dr >= g.rows || c + dc < 0 || c + dc >= g.cols) break
    if (stop && (d.length === 1
      ? g.segments.some(([h, x, y]) => { const e = edge(r, c, d as Side); return h === e[0] && x === e[1] && y === e[2] })
      : g.degree[(r + (dr > 0 ? 1 : 0)) * (g.cols + 1) + c + (dc > 0 ? 1 : 0)])) break
    r += dr
    c += dc
    out.push(g.at[r * g.cols + c] as string)
  }
  return out
}

export function line(g: GridMap, from: string, direction: Direction, o: { length?: number; stopAtWall?: boolean } = {}): string[] {
  if (!STEP[direction]) throw new Error(`grid-map: unknown direction ${String(direction)}`)
  const runs = cellsOf(g, from).map(([r, c]) => run(g, r, c, direction, o.stopAtWall, o.length))
  const out: string[] = []
  for (let i = 0; runs.some(x => i < x.length); i++) for (const x of runs) { const s = x[i]; if (s !== undefined && s !== from && !out.includes(s)) out.push(s) }
  return out
}

function lane(g: GridMap, space: string, dirs: readonly Direction[], stop?: boolean): string[] {
  const set = new Set([space])
  for (const [r, c] of cellsOf(g, space)) for (const d of dirs) for (const s of run(g, r, c, d, stop)) set.add(s)
  return ordered(g, set)
}
export const rowOf = (g: GridMap, space: string, o: { stopAtWall?: boolean } = {}): string[] => lane(g, space, ['w', 'e'], o.stopAtWall)
export const columnOf = (g: GridMap, space: string, o: { stopAtWall?: boolean } = {}): string[] => lane(g, space, ['n', 's'], o.stopAtWall)

export type AreaShape = { square: true; diamond?: never } | { diamond: true; square?: never }
export function area(g: GridMap, centre: string, radius: number, o: AreaShape & { sight?: boolean }): string[] {
  if (!o || !o.square === !o.diamond) throw new Error('grid-map: area needs exactly one of { square: true } or { diamond: true }')
  const mid = cellsOf(g, centre)
  return g.spaces.filter(s => (g.cells[s] as readonly Cell[]).some(([r, c]) => mid.some(([mr, mc]) => {
    const a = Math.abs(r - mr)
    const b = Math.abs(c - mc)
    return (o.square ? Math.max(a, b) : a + b) <= radius
  })) && (!o.sight || lineOfSight(g, centre, s)))
}

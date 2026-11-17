// K244: ported from earthborne-rangers-fan-prototype src/ui/table/geometry.ts (layRow, fitZone, MIN_CARD_WIDTH, handSink), made generic:
// any item, a footprint callback, no mats, tags, slides or Earthborne constants. Pure; loads in node.
export type Size = { w: number; h: number }
export type Rect = { x: number; y: number; w: number; h: number }
export const DEFAULT_GAP = 24
export const DEFAULT_MIN_CARD_WIDTH = 200

export interface Placed<T> { item: T; x: number; y: number; w: number; h: number; overlap: number }
export interface RowFit<T> {
  placed: Placed<T>[]
  scale?: number
  width: number
  height: number
  /** Fits at the readable minimum or better; false when the cards fan (overlap). */
  fits: boolean
}
type RowOpts = { gap?: number; squeeze?: boolean }

/** A row left to right with a gap. Too wide and `squeeze`: even steps so the last card ends at `avail` (a fan). `overlap` is how far a card sits under its left neighbour. */
export function layRow<T>(items: readonly T[], avail: number, footprint: (item: T, i: number) => Size, opts: RowOpts = {}): RowFit<T> {
  const gap = opts.gap ?? DEFAULT_GAP
  const boxes = items.map(footprint)
  let x = 0
  const placed: Placed<T>[] = items.map((item, i) => {
    if (i > 0) x += gap
    const p = { item, x, y: 0, w: boxes[i]!.w, h: boxes[i]!.h, overlap: 0 }
    x += p.w
    return p
  })
  const height = boxes.reduce((m, b) => Math.max(m, b.h), 0)
  let width = x
  const fits = width <= avail + 0.5
  if (!fits && opts.squeeze && items.length > 1) {
    const step = Math.max(0, (avail - boxes[boxes.length - 1]!.w) / (items.length - 1))
    placed.forEach((p, i) => {
      p.x = Math.round(step * i)
      p.overlap = i > 0 ? Math.max(0, Math.round(placed[i - 1]!.w - step)) : 0
    })
    width = avail
  }
  return { placed, width, height, fits }
}

/** Fit card assemblies in `avail` x `height` at the largest uniform scale (never above 1), one row or two (order kept, rows differ by at most one; one row on ties). Below the readable floor (`minWidth` of a `card` at scale 1) the scale stays at the floor and the rows fan. */
export function fitZone<T>(
  items: readonly T[], avail: number, height: number, card: Size, footprint: (item: T, i: number) => Size,
  opts: RowOpts & { minWidth?: number } = {},
): RowFit<T> {
  const gap = opts.gap ?? DEFAULT_GAP
  const at = (parts: (readonly T[])[], j: number) => (j ? parts[0]!.length : 0)
  const row = (parts: (readonly T[])[], j: number, k: number, squeeze = false) =>
    layRow(parts[j]!, avail / k, (t, i) => footprint(t, i + at(parts, j)), { gap, squeeze })
  const full = row([items], 0, 1)
  if (!items.length || (full.fits && full.height <= height)) return { ...full, scale: 1 }
  const candidate = (parts: (readonly T[])[]) => {
    let lo = 0
    let hi = 1
    for (let i = 0; i < 40; i++) {
      const k = (lo + hi) / 2
      const rs = parts.map((_, j) => row(parts, j, k))
      if (rs.every((r) => r.width * k <= avail) && (rs.reduce((n, r) => n + r.height, 0) + gap * (rs.length - 1)) * k <= height) lo = k
      else hi = k
    }
    return { parts, scale: lo }
  }
  let best = candidate([items])
  if (items.length > 1) {
    const split = Math.ceil(items.length / 2)
    const next = candidate([items.slice(0, split), items.slice(split)])
    if (next.scale > best.scale + 0.00001) best = next
  }
  const floor = Math.min(1, (opts.minWidth ?? DEFAULT_MIN_CARD_WIDTH) / card.w)
  let { parts, scale } = best
  const fits = scale >= floor
  if (!fits) {
    scale = floor
    const hs = parts.map((_, j) => row(parts, j, floor).height)
    if ((hs.reduce((a, b) => a + b, 0) + gap * (parts.length - 1)) * floor > height) parts = [items]
  }
  const rows = parts.map((_, j) => row(parts, j, scale, !fits))
  let y = 0
  const placed: Placed<T>[] = []
  for (const r of rows) {
    placed.push(...r.placed.map((p) => ({ ...p, x: p.x * scale, y, w: p.w * scale, h: p.h * scale, overlap: p.overlap * scale })))
    y += (r.height + gap) * scale
  }
  return { placed, scale, width: Math.max(...rows.map((r) => r.width)) * scale, height: y - gap * scale, fits }
}

export interface ZonePlan extends RowFit<{ id: string | null; index: number }> {
  rect: Rect
  rows: number
  /** True when the cards overlap (below the readable minimum). */
  fan: boolean
}
export interface BoardPlanOpts {
  /** The card at scale 1, in design pixels. */
  card: Size
  /** An assembly's size at scale 1 (default: the card). The hook for a host with its tucked cards (K245). */
  footprint?: (id: string | null, zone: string, index: number) => Size
  gap?: number
  /** Room kept inside a zone's border (default 6). */
  pad?: number
  minWidth?: number
  /** Where a short row sits in its zone (default `start`). */
  align?: 'start' | 'center'
}

/** The plan for a board: per zone, a rect per card (absolute in the board's design pixels). `zones` is id to `[x, y, w, h]` (board-layout `zoneRect`); `cards` is a card-zones `ZoneView.cards` per zone (`null` = a back). */
export function planBoard(zones: Readonly<Record<string, readonly number[]>>, cards: Readonly<Record<string, readonly (string | null)[] | undefined>>, o: BoardPlanOpts): Record<string, ZonePlan> {
  const pad = o.pad ?? 6
  const out: Record<string, ZonePlan> = {}
  for (const [zone, r] of Object.entries(zones)) {
    const [x = 0, y = 0, w = 0, h = 0] = r
    const items = (cards[zone] ?? []).map((id, index) => ({ id, index }))
    const fit = fitZone(items, Math.max(0, w - 2 * pad), Math.max(0, h - 2 * pad), o.card, (t) => o.footprint?.(t.id, zone, t.index) ?? o.card, { ...(o.gap !== undefined && { gap: o.gap }), ...(o.minWidth !== undefined && { minWidth: o.minWidth }) })
    const dx = o.align === 'center' ? Math.max(0, (w - 2 * pad - fit.width) / 2) : 0
    const placed = fit.placed.map((p) => ({ ...p, x: x + pad + dx + p.x, y: y + pad + p.y }))
    out[zone] = { ...fit, placed, rect: { x, y, w, h }, rows: new Set(fit.placed.map((p) => p.y)).size, fan: !fit.fits }
  }
  return out
}

/** The floating hand sinks only as far as it must to clear the board (U11): `clear` is the lowest occupied y, `bottom` the stage height, `handH` the hand's height, `peek` the strip left showing. */
export const handSink = (clear: number, bottom: number, handH: number, peek: number, margin = 12): number =>
  Math.min(handH - peek, Math.max(0, clear - (bottom - handH - margin) + margin))

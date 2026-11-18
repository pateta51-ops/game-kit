export interface PlaceRect { left: number; top: number; right: number; bottom: number }
export type PlaceSide = 'right' | 'left' | 'below' | 'above'
export interface PlaceOpts {
  /** space between anchor and preview (default 12) */
  gap?: number
  /** space kept from the bounds' edges (default 8) */
  margin?: number
  /** sides tried in turn (default right, left, below, above) */
  order?: readonly PlaceSide[]
  /** along the other axis: centred on the anchor (default) or level with its start */
  align?: 'center' | 'start'
}
export interface Placed { left: number; top: number; side: PlaceSide; fits: boolean }

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(v, hi))

/**
 * Where a preview `size` big goes beside `anchor`, inside `bounds` (a viewport or container rect; `left`/`top` default 0).
 * The first side in `order` with room whole wins; when none has, the side with the most room (`fits: false`), pushed in.
 * Always kept inside the bounds by `margin` (at the top-left margin when larger than the bounds).
 */
export function placeZoom(
  anchor: PlaceRect,
  size: { width: number; height: number },
  bounds: { left?: number; top?: number; width: number; height: number },
  opts: PlaceOpts = {},
): Placed {
  const { gap = 12, margin = 8, order = ['right', 'left', 'below', 'above'], align = 'center' } = opts
  const bl = bounds.left ?? 0, bt = bounds.top ?? 0
  const minX = bl + margin, maxX = bl + bounds.width - margin - size.width
  const minY = bt + margin, maxY = bt + bounds.height - margin - size.height
  const cx = (x: number): number => clamp(x, minX, Math.max(minX, maxX))
  const cy = (y: number): number => clamp(y, minY, Math.max(minY, maxY))
  const alongY = cy(align === 'center' ? (anchor.top + anchor.bottom) / 2 - size.height / 2 : anchor.top)
  const alongX = cx(align === 'center' ? (anchor.left + anchor.right) / 2 - size.width / 2 : anchor.left)
  const room: Record<PlaceSide, number> = {
    right: bl + bounds.width - margin - (anchor.right + gap),
    left: anchor.left - gap - minX,
    below: bt + bounds.height - margin - (anchor.bottom + gap),
    above: anchor.top - gap - minY,
  }
  const need = (s: PlaceSide): number => (s === 'right' || s === 'left' ? size.width : size.height)
  const at = (s: PlaceSide): { left: number; top: number } =>
    s === 'right' ? { left: cx(anchor.right + gap), top: alongY }
    : s === 'left' ? { left: cx(anchor.left - gap - size.width), top: alongY }
    : s === 'below' ? { left: alongX, top: cy(anchor.bottom + gap) }
    : { left: alongX, top: cy(anchor.top - gap - size.height) }
  const ok = order.find((s) => room[s] >= need(s))
  const rd = (s: PlaceSide, fits: boolean): Placed => { const q = at(s); return { left: Math.round(q.left), top: Math.round(q.top), side: s, fits } }
  if (ok) return rd(ok, true)
  const best = order.reduce((a, b) => (room[b] > room[a] ? b : a), order[0] ?? 'right')
  return rd(best, false)
}

/** The room beside an anchor: the roomier horizontal side and how wide (for a preview whose boxes wrap to fit). */
export function zoomRoom(anchor: PlaceRect, viewWidth: number, gap = 12): { side: 'right' | 'left'; room: number } {
  const right = viewWidth - anchor.right - 2 * gap
  const left = anchor.left - 2 * gap
  return right >= left ? { side: 'right', room: Math.floor(right) } : { side: 'left', room: Math.floor(left) }
}

import type { CSSProperties, ReactNode } from 'react'
import { imageClipOf, insertLayer, insertRanks, layerStyle, tabBox, TAB_SEAM, tabClipOf, tabOf, type SleeveImage, type SleeveOpen } from './sleeve.ts'

export interface SleeveFace extends SleeveImage { src: string }
export interface SleeveInsert { key: string | number; front: SleeveFace; back: SleeveFace }
export interface SleeveStackProps {
  /** The host's two faces; the face shown is `face`. */
  host: { front: SleeveFace; back: SleeveFace }
  /** Listed from the host's front: index 0 lies against the host's front, the last against its back. */
  inserts: readonly SleeveInsert[]
  face: 'front' | 'back'
  /** The edge where the sleeve opens on each face (default top on both). */
  open?: Partial<Record<'front' | 'back', SleeveOpen>>
  /** Draw each insert's tab past the open edge (default true). */
  tabs?: boolean
  /** Tab heights each insert further back stands out (default 0.35). */
  tabStep?: number
  /** Drawn over the host (buttons, tokens), placed in fractions of the host's image. */
  children?: ReactNode
  cls?: (part: string) => string
}

const abs: CSSProperties = { position: 'absolute', maxWidth: 'none', objectFit: 'fill', pointerEvents: 'none' }

/** A host card with inserts in its sleeve, one composite per face: each insert cut to its die-cut lies under the host, read through the host's cut, its tab past the open edge. */
export function SleeveStack({ host, inserts, face, open, tabs = true, tabStep, children, cls = (p) => `kc-${p}` }: SleeveStackProps) {
  const h = host[face]
  const edge = open?.[face] ?? 'top'
  const ratio = h.width / Math.max(1, h.height)
  const ranks = insertRanks(inserts.length, face)
  const order = inserts.map((a, i) => ({ a, i, rank: ranks[i]! })).sort((x, y) => y.rank - x.rank)
  const img = (part: string, f: SleeveFace, style: CSSProperties, clip: string | undefined, i?: number, rank?: number) => (
    <img key={`${part}-${String(i)}`} className={cls(part)} data-part={part} data-index={i} data-rank={rank} src={f.src} alt="" draggable={false} decoding="async" style={{ ...abs, ...style, ...(clip === undefined ? {} : { clipPath: clip }) }} />
  )
  const under: ReactNode[] = []
  for (const { a, i, rank } of order) {
    const f = a[face]
    const layer = insertLayer(h, f, edge)
    if (!layer) continue
    const tab = tabs && f.outline ? tabOf(f.outline) : null
    if (tab && f.outline) under.push(img('sleeve-tab', f, layerStyle({ ...layer, box: tabBox(layer, tab, rank, tabStep) }, ratio), tabClipOf(f.outline, tab.bodyTop, rank === 0 ? TAB_SEAM : -TAB_SEAM), i, rank))
  }
  for (const { a, i, rank } of order) {
    const f = a[face]
    const layer = insertLayer(h, f, edge)
    if (layer) under.push(img('sleeve-insert', f, layerStyle(layer, ratio), imageClipOf(f), i, rank))
  }
  return (
    <div className={cls('sleeve')} data-part="sleeve" data-face={face} data-count={inserts.length} style={{ position: 'relative', width: '100%', aspectRatio: `${String(h.width)} / ${String(h.height)}`, overflow: 'visible' }}>
      {under}
      {img('sleeve-host', h, { inset: 0, width: '100%', height: '100%' }, imageClipOf(h))}
      {children}
    </div>
  )
}

// The zoom's parts (unstyled) and a default composition; each section can be replaced or hidden through a slot.
import type { ReactNode } from 'react'
import { Icon, type Cls, type IconDef, type IconSet } from '../card-parts/ui'
import { GlossaryLink, type OnTerm } from '../glossary/GlossaryText'
import { SECTIONS, ZOOM_WORDS, type IconSeg, type Section, type Seg, type Transcription } from './transcribe'

const kz: Cls = (p) => `kz-${p}`

export interface LineProps {
  icons: IconSet
  cls?: Cls
  onTerm?: OnTerm
  size?: string
  /** Draws an icon the game's way (default: card-parts Icon, its words for an unknown one). */
  renderIcon?: (seg: IconSeg, def: IconDef | undefined) => ReactNode
}

/** One decoded line: icons inline, glossary terms and explained icons as links. */
export function ZoomLine({ segs, icons, cls = kz, onTerm, size, renderIcon }: LineProps & { segs: readonly Seg[] }) {
  const on = onTerm === undefined ? {} : { onTerm }
  return (
    <>
      {segs.map((s, i) => {
        if (s.t === 'text') return <span key={i}>{s.s}</span>
        if (s.t === 'term') return <GlossaryLink key={i} id={s.id} {...on}>{s.s}</GlossaryLink>
        const def = icons[s.name]
        const icon = renderIcon ? renderIcon(s, def) : def ? <Icon def={def} name={s.name} cls={cls} {...(size ? { size } : {})} /> : <span className={cls('unknown')} data-icon={s.name}>{s.name}</span>
        return s.id === null ? <span key={i}>{icon}</span> : <GlossaryLink key={i} id={s.id} {...on}>{icon}</GlossaryLink>
      })}
    </>
  )
}

/** The default composition: `face` (the game's card), then each section with something in it, in `order`. */
export function CardZoom({ tr, face, order = SECTIONS, slots = {}, words = {}, cls = kz, ...line }: LineProps & {
  tr: Transcription
  face?: ReactNode
  order?: readonly Section[]
  /** A section drawn the game's way; `null` leaves it out. */
  slots?: Partial<Record<Section, ((tr: Transcription) => ReactNode) | null>>
  words?: Partial<typeof ZOOM_WORDS>
}) {
  const L = (segs: readonly Seg[]) => <ZoomLine segs={segs} cls={cls} {...line} />
  const w = { ...ZOOM_WORDS, ...words }
  const blocks = (bs: Transcription['printed']) => bs.map((b, i) => <p key={i} className={cls('block')}>{b.label === undefined ? null : <b className={cls('label')}>{b.label}</b>}{L(b.text)}</p>)
  const body: Record<Section, () => ReactNode> = {
    head: () => <header className={cls('head')}><h2 className={cls('title')}>{tr.title}</h2>{tr.meta.map((m, i) => <p key={i} className={cls('meta')}>{L(m)}</p>)}</header>,
    printed: () => tr.printed.length === 0 ? null : blocks(tr.printed),
    notes: () => tr.notes.length === 0 ? null : blocks(tr.notes),
    tokens: () => tr.tokens.length === 0 ? null : <ul>{tr.tokens.map((t, i) => <li key={i} className={cls('token')}>{t.icon ? L([t.icon]) : null}{L(t.label)}{t.count === undefined ? null : <span className={cls('count')}>{t.count}</span>}</li>)}</ul>,
    legend: () => tr.legend.length === 0 ? null : <dl>{tr.legend.map((s) => <div key={s.name} className={cls('legend-item')}><dt>{L([s])}</dt><dd>{s.id === null ? s.label : L([{ t: 'term', s: s.label, id: s.id }])}</dd></div>)}</dl>,
    terms: () => tr.terms.length === 0 ? null : <dl>{tr.terms.map((t) => <div key={t.id} className={cls('term')}><dt>{L([{ t: 'term', s: t.term, id: t.id }])}</dt><dd>{L(t.summary)}</dd></div>)}</dl>,
  }
  return (
    <div className={cls('zoom')}>
      {face === undefined ? null : <div className={cls('face')}>{face}</div>}
      <div className={cls('text')}>
        {order.map((s) => {
          const slot = slots[s]
          const inner = slot === null ? null : slot ? slot(tr) : body[s]()
          if (inner === null || inner === undefined) return null
          return <section key={s} className={cls('section')} data-zoom-section={s}>{s === 'head' || slot ? null : <h3 className={cls('heading')}>{w[s]}</h3>}{inner}</section>
        })}
      </div>
    </div>
  )
}

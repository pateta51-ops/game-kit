// The zoomed card as a full transcription (STCC CardDetail, EBR Zoom, Imperium ViewCard): the printed text decoded with its
// icons, the engine's own reading where it differs, the tokens on the card, a legend of its icons and its glossary terms.
// Data only: each game places and styles it.
import { BRACKETS, parseIconText, type IconSet, type Syntax } from '../card-parts/index.ts'
import { iconEntry, matchText, type GlossaryIndex } from '../glossary/match.ts'

export type IconSeg = { t: 'icon'; name: string; label: string; known: boolean; id: string | null }
/** A piece of a line: words, an icon (with the glossary entry that explains it), or a glossary term. */
export type Seg = { t: 'text'; s: string } | IconSeg | { t: 'term'; s: string; id: string }
export interface Block { label?: string; text: Seg[] }
export interface ZoomSource {
  title: string
  /** Kind, number, cost line...: short lines under the title. */
  meta?: readonly string[]
  /** The printed text, one block per box or side (`label` e.g. 'Side B'). */
  printed: readonly { label?: string; text: string }[]
  /** What the engine reads where it differs from the print: errata, the game's rulings (`label` e.g. 'Errata'). */
  notes?: readonly { label?: string; text: string }[]
  /** What lies on the card now. `icon` is a name of the icon set. */
  tokens?: readonly { label: string; count?: number; icon?: string }[]
}
export type Section = 'head' | 'printed' | 'notes' | 'tokens' | 'legend' | 'terms'
export const SECTIONS: readonly Section[] = ['head', 'printed', 'notes', 'tokens', 'legend', 'terms']
export const ZOOM_WORDS: Record<Exclude<Section, 'head'>, string> = { printed: 'Card text', notes: 'How the game plays it', tokens: 'On the card', legend: 'Icons', terms: 'Glossary' }

export interface ZoomOptions {
  icons: IconSet
  syntax?: Syntax
  glossary?: GlossaryIndex
  /** plain-text's `ids.strip`: run over every text; a line it empties is left out. */
  strip?: (s: string) => string
}
export interface Transcription {
  title: string
  meta: Seg[][]
  printed: Block[]
  notes: Block[]
  tokens: { label: Seg[]; count?: number; icon?: IconSeg }[]
  /** Each icon on the card once, in order of first use. */
  legend: IconSeg[]
  /** Each glossary term on the card once, in order of first use. */
  terms: { id: string; term: string; summary: Seg[] }[]
}

const iconSeg = (name: string, o: ZoomOptions): IconSeg => {
  const d = o.icons[name]
  const label = d?.label ?? name
  return { t: 'icon', name, label: o.strip ? o.strip(label) : label, known: d !== undefined, id: o.glossary ? iconEntry(o.glossary, name) : null }
}

/** One text decoded: icons (with their glossary entry), glossary terms, words. */
export function zoomLine(text: string, o: ZoomOptions): Seg[] {
  const out: Seg[] = []
  for (const p of parseIconText(o.strip ? o.strip(text) : text, o.icons, o.syntax ?? BRACKETS)) {
    if (p.t === 'icon') out.push(iconSeg(p.name, o))
    else if (!o.glossary) out.push(p)
    else for (const s of matchText(o.glossary, p.s)) out.push(s.kind === 'term' ? { t: 'term', s: s.text, id: s.id } : { t: 'text', s: s.kind === 'text' ? s.text : s.raw })
  }
  return out
}

/** The line's words, each icon by its label. */
export const plainSegs = (segs: readonly Seg[]): string => segs.map((s) => (s.t === 'icon' ? s.label : s.s)).join('')

export function transcribe(src: ZoomSource, o: ZoomOptions): Transcription {
  const st = (s: string) => (o.strip ? o.strip(s) : s)
  const blocks = (bs: ZoomSource['printed'] | undefined): Block[] =>
    (bs ?? []).flatMap((b) => {
      const text = zoomLine(b.text, o)
      const label = b.label === undefined ? '' : st(b.label)
      return text.length === 0 && label === '' ? [] : [{ ...(label === '' ? {} : { label }), text }]
    })
  const meta = (src.meta ?? []).map((m) => zoomLine(m, o)).filter((l) => l.length > 0)
  const printed = blocks(src.printed)
  const notes = blocks(src.notes)
  const tokens = (src.tokens ?? []).map((t) => ({ label: zoomLine(t.label, o), ...(t.count === undefined ? {} : { count: t.count }), ...(t.icon === undefined ? {} : { icon: iconSeg(t.icon, o) }) }))
  const all = [...meta, ...printed.map((b) => b.text), ...notes.map((b) => b.text), ...tokens.flatMap((t) => [...(t.icon ? [[t.icon]] : []), t.label])].flat()
  const legend = [...new Map(all.flatMap((s) => (s.t === 'icon' ? [[s.name, s] as const] : []))).values()]
  const terms = [...new Set(all.flatMap((s) => (s.t === 'term' ? [s.id] : [])))].flatMap((id) => {
    const e = o.glossary?.entries.get(id)
    return e ? [{ id, term: st(e.term), summary: zoomLine(e.summary, o) }] : []
  })
  return { title: st(src.title), meta, printed, notes, tokens, legend, terms }
}

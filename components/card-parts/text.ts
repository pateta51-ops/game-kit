// Printed text with icon markers (STCC iconTokens `[[token]]`, Rome `[Icon]`): the game names its marker syntax and icon set.
/** An icon of the game's set: its words (what a reader hears, copies, and the zoom transcribes) and its SVG. */
export interface IconDef {
  label: string
  /** The inner SVG markup (paths), drawn in an <svg> with `viewBox`; `currentColor` follows the text. */
  body?: string
  viewBox?: string
  /** Or a picture file. */
  src?: string
}
export type IconSet = Readonly<Record<string, IconDef>>
/** The marker around an icon's name, and the character that makes the next one plain text. */
export interface Syntax { open: string; close: string; escape?: string; /** Optional, no default: a marker `{code:N}` then also carries `value` (text after the first separator). */ separator?: string }
export const BRACKETS: Syntax = { open: '[[', close: ']]', escape: '\\' }

/** The decoded text: the model the face draws and the zoom (K203) transcribes. `known: false` is a name the set lacks. */
export type Part = { t: 'text'; s: string } | { t: 'icon'; name: string; label: string; known: boolean; value?: string | number }

export function parseIconText(text: string, icons: IconSet, syntax: Syntax = BRACKETS): Part[] {
  const out: Part[] = []
  let buf = ''
  let i = 0
  const { open, close, escape, separator } = syntax
  while (i < text.length) {
    const esc = escape && text.startsWith(escape, i) ? [open, close, escape].find((m) => text.startsWith(m, i + escape.length)) : undefined
    if (escape && esc !== undefined) {
      buf += esc
      i += escape.length + esc.length
      continue
    }
    if (text.startsWith(open, i)) {
      const end = text.indexOf(close, i + open.length)
      if (end >= 0) {
        const inner = text.slice(i + open.length, end)
        const cut = separator ? inner.indexOf(separator) : -1
        const name = (cut >= 0 ? inner.slice(0, cut) : inner).trim()
        const raw = cut >= 0 ? inner.slice(cut + (separator ?? '').length).trim() : undefined
        const def = icons[name]
        if (buf) out.push({ t: 'text', s: buf })
        buf = ''
        out.push({ t: 'icon', name, label: def?.label ?? name, known: def !== undefined, ...(raw === undefined ? {} : { value: raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw }) })
        i = end + close.length
        continue
      }
    }
    buf += text.charAt(i)
    i += 1
  }
  if (buf) out.push({ t: 'text', s: buf })
  return out
}

/** The decoded text as words: each icon by its label (copy, screen readers, the zoom's transcription). */
export const plainOf = (parts: readonly Part[]): string => parts.map((p) => (p.t === 'text' ? p.s : p.value === undefined ? p.label : `${p.label} ${String(p.value)}`)).join('')

/** The marker names a text uses that the icon set lacks (a content test expects `[]`). */
export const unknownIcons = (texts: readonly string[], icons: IconSet, syntax: Syntax = BRACKETS): string[] => [
  ...new Set(texts.flatMap((t) => parseIconText(t, icons, syntax).flatMap((p) => (p.t === 'icon' && !p.known ? [p.name] : [])))),
]

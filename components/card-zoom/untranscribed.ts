// K235 B: a content test for the zoom: every printed word of the card data must reach the transcription.
import { plainSegs, transcribe, zoomLine, type ZoomOptions, type ZoomSource } from './transcribe.ts'

const leaves = (v: unknown, path: string, out: { path: string; text: string }[]): void => {
  if (typeof v === 'string' || typeof v === 'number') out.push({ path, text: String(v) })
  else if (Array.isArray(v)) v.forEach((x, i) => { leaves(x, `${path}[${String(i)}]`, out) })
  else if (typeof v === 'object' && v !== null) for (const [k, x] of Object.entries(v)) leaves(x, path === '' ? k : `${path}.${k}`, out)
}

/**
 * The card's string and number fields (path, text) whose words are in no part of the transcription of `source`.
 * `card` is the game's printed record; `ignore` names fields that are not printed (id, art path). A content test expects `[]`.
 */
export function untranscribed(card: unknown, source: ZoomSource, o: ZoomOptions, ignore: readonly string[] = []): { path: string; text: string }[] {
  const t = transcribe(source, o)
  const block = (b: { label?: string; text: Parameters<typeof plainSegs>[0] }) => `${b.label ?? ''}\n${plainSegs(b.text)}`
  const shown = [t.title, ...t.meta.map(plainSegs), ...t.printed.map(block), ...t.notes.map(block), ...t.tokens.map((k) => `${plainSegs(k.label)} ${String(k.count ?? '')}`)].join('\n')
  const all: { path: string; text: string }[] = []
  leaves(card, '', all)
  return all
    .filter((l) => !ignore.some((i) => l.path === i || l.path.startsWith(`${i}.`) || l.path.startsWith(`${i}[`)))
    .filter((l) => {
      const words = plainSegs(zoomLine(l.text, o))
      return words !== '' && !shown.includes(words)
    })
}

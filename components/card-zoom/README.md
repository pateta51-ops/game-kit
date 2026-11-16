# card-zoom
A zoomed card as a full transcription: the printed text decoded with its icons, the engine's reading where it differs, the tokens on it, a legend of its icons and its glossary terms as links. No layout fixed: the game places and styles it. Needs `card-parts`, `glossary` and `plain-text`. `index.ts` loads in node; `ui.ts` adds React.

## The game passes
- `transcribe(source, { icons, syntax?, glossary?, strip? })`. `source`: `title`, `meta?` (kind, number, cost lines), `printed` (`{ label?, text }` per box or side, card-parts' icon markers), `notes?` (errata, the game's rulings: what the engine plays where the print differs), `tokens?` (`{ label, count?, icon? }`). `glossary` is glossary's `buildIndex(entries)`; `strip` is plain-text's `ids.strip`, run over every text, label, icon label and term: nothing is dropped but a meta line, or a block with no label, that held only ids; a token always stays (count and icon too).
- K235 content test: `untranscribed(card, source, opts, ignore?)` lists the string and number fields of the game's card data (path, text) that are in no part of the transcription; expect `[]` (`ignore`: paths such as `id`).
- It returns `{ title, meta, printed, notes, tokens, legend, terms }`. Lines are `Seg[]`: `text`, `term` (`id`), `icon` (`name`, `label`, `known`, `id` of the entry that explains it or null). `legend`: each icon on the card once, in order of first use (tokens included). `terms`: each linked entry once with its `summary` decoded. Only names the glossary has are linked. `zoomLine(text, opts)` decodes one text; `plainSegs(segs)` gives its words.
- `<CardZoom tr icons face? order? slots? words? onTerm? renderIcon? size? cls?>`: `face` (the game's card), then each section with content in `order` (default `SECTIONS`: head, printed, notes, tokens, legend, terms) under a heading from `ZOOM_WORDS` (`words` overrides). `slots[s]` draws a section the game's way, `null` leaves it out. Terms and explained icons are glossary `GlossaryLink`s (`onTerm`, default opens glossary's lookup). `<ZoomLine segs icons ...>` draws one line.
- Closing is the game's: `useZoomEscape(onClose, open?)` is an optional helper (Escape, caught before windows under it).

## Look
Unstyled. `cls(part)` gives class names (default `kz-<part>`: zoom, face, text, section, heading, head, title, meta, block, label, token, count, legend-item, term, icon, unknown); `data-zoom-section` marks each section. Links take glossary's `--glo-*`.

## Use it in 10 lines
```ts
import { plainSegs, transcribe } from '../kit/card-zoom/index'
import { buildIndex } from '../kit/glossary/index'

const icons = { gold: { label: 'gold', body: '<circle r="5"/>' } }
const glossary = buildIndex([{ id: 'exhaust', term: 'Exhaust', summary: 'Turn it sideways.' }])
const tr = transcribe({ title: 'Scout', printed: [{ text: 'Exhaust: gain [[gold]].' }], tokens: [{ label: 'Damage', count: 2 }] }, { icons, glossary })
console.log(plainSegs(tr.printed[0]?.text ?? [])) // 'Exhaust: gain gold.'
console.log(tr.legend.map((s) => s.name), tr.terms.map((t) => t.id)) // ['gold'] ['exhaust']
```

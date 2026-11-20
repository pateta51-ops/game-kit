# card-zoom
A zoomed card as a full transcription: the printed text decoded with its icons, the engine's reading where it differs, the tokens on it, a legend of its icons and its glossary terms as links. No layout fixed: the game places and styles it. Needs `card-parts`, `glossary` and `plain-text`. `index.ts` loads in node; `ui.ts` adds React.


## Rules for agents

**What it does:** A zoomed card as a full transcription: printed text decoded with its icons, the engine's reading where it differs, tokens, a legend of icons and glossary terms as links; plus a placer for a zoom or preview beside its anchor.

**You must:**
1. Build the transcription with `transcribe(source, { icons, syntax?, glossary?, strip? })`: `source` has `title`, `printed` (card-parts icon markers), and optionally `meta`, `notes` (errata and rulings: what the engine plays where the print differs) and `tokens`.
2. Pass `glossary` from glossary's `buildIndex(entries)` and `strip` from plain-text's `ids.strip`, so terms link and no rule id reaches the screen; only names the glossary has are linked.
3. Show every printed word: put all of the card's text in `printed`, and in a content test expect `untranscribed(card, source, opts, ignore?)` to return `[]` (pass paths such as `id` in `ignore`).
4. Draw with `<CardZoom tr icons face? ... />` (React, from `kit/card-zoom/ui`) and style the `kz-*` classes / `data-zoom-section` yourself; `slots[section]` draws a section your way, `null` leaves it out; override headings with `words`.
5. Close the zoom yourself; `useZoomEscape(onClose, open?)` is an optional helper.
6. Position the zoom with `placeZoom(anchor, size, bounds, opts)`; it is not wired into `CardZoom`. Give anchor and bounds in the same coordinate space (both viewport, or both the container's).
7. Import `kit/card-zoom/index` in node and `kit/card-zoom/ui` for React; the game needs `card-parts`, `glossary` and `plain-text`.

**Common mistakes:**
- Dropping a token or note because it looks empty: a token always stays; only a meta line or labelless block that held only ids is removed by `strip`.
- Anchor in viewport pixels and bounds in container pixels: the preview lands in the wrong place.
- Expecting `placeZoom` to fit a preview larger than the bounds: it sits at the top-left margin.

## The game passes
- `transcribe(source, { icons, syntax?, glossary?, strip? })`. `source`: `title`, `meta?` (kind, number, cost lines), `printed` (`{ label?, text }` per box or side, card-parts' icon markers), `notes?` (errata, the game's rulings: what the engine plays where the print differs), `tokens?` (`{ label, count?, icon? }`). `glossary` is glossary's `buildIndex(entries)`; `strip` is plain-text's `ids.strip`, run over every text, label, icon label and term: nothing is dropped but a meta line, or a block with no label, that held only ids; a token always stays (count and icon too).
- K235 content test: `untranscribed(card, source, opts, ignore?)` lists the string and number fields of the game's card data (path, text) that are in no part of the transcription; expect `[]` (`ignore`: paths such as `id`).
- It returns `{ title, meta, printed, notes, tokens, legend, terms }`. Lines are `Seg[]`: `text`, `term` (`id`), `icon` (`name`, `label`, `known`, `id` of the entry that explains it or null). `legend`: each icon on the card once, in order of first use (tokens included). `terms`: each linked entry once with its `summary` decoded. Only names the glossary has are linked. `zoomLine(text, opts)` decodes one text; `plainSegs(segs)` gives its words.
- `<CardZoom tr icons face? order? slots? words? onTerm? renderIcon? size? cls?>`: `face` (the game's card), then each section with content in `order` (default `SECTIONS`: head, printed, notes, tokens, legend, terms) under a heading from `ZOOM_WORDS` (`words` overrides). `slots[s]` draws a section the game's way, `null` leaves it out. Terms and explained icons are glossary `GlossaryLink`s (`onTerm`, default opens glossary's lookup). `<ZoomLine segs icons ...>` draws one line.
- Closing is the game's: `useZoomEscape(onClose, open?)` is an optional helper (Escape, caught before windows under it).
- `placeZoom(anchor, size, bounds, { gap?, margin?, order?, align? })`: where a zoom or hover preview goes beside the thing it opened from. `anchor` `{ left, top, right, bottom }`, `size` `{ width, height }`, `bounds` the viewport or a container (`{ left?, top?, width, height }`). Tries `order` (default right, left, below, above) and takes the first side with room for the whole preview; none: the side with most room (`fits: false`). Centred on the anchor along the other axis (`align: 'start'`: level with its top), kept inside the bounds by `margin` (default 8; `gap` to the anchor default 12). Returns `{ left, top, side, fits }`. Anchor and bounds must be in the same coordinate space (both viewport, or both the container's). Rounded to whole pixels. When no side fits, the side with the most room among those in `order` wins (any of the four), pushed inside. `zoomRoom(anchor, viewWidth, gap?)` gives the roomier horizontal side and its width. Larger than the bounds: at the top-left margin. Not wired into `CardZoom`; the game applies the position.

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

## Place a preview
```ts
import { placeZoom } from "../kit/card-zoom/index"

const anchor = { left: 100, top: 400, right: 250, bottom: 610 }
const at = placeZoom(anchor, { width: 600, height: 300 }, { width: 1920, height: 1080 }, { order: ["right", "left"], align: "start" })
console.log(at.side, at.left, at.top) // right 262 400
```

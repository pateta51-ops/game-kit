# card-parts
The parts a game builds its own card face from: the layout as the game's data, art with a cache, printed text with SVG icons inline, tokens. No layout or look is fixed here. `index.ts` loads in node; `ui.ts` adds React.


## Rules for agents

**What it does:** The parts a game builds its own card face from: layout as the game's data, art with a cache, printed text with inline SVG icons, tokens at anchors, a fit-the-text size, and a state banner. No layout or look is fixed here.

**You must:**
1. Import node-safe functions from `kit/card-parts/index` and React parts from `kit/card-parts/ui`.
2. Give each card type a `CardLayout` in the card's own units (`w`, `h`, `zones`, `anchors`), and expect `checkLayouts(all)` to return `[]` in a test.
3. Draw a face with `<CardFace layout zones={{ zone: node | (zone, name) => node }} />`; only zones given content are drawn; put `TokenLayer` as a child to go over it.
4. Describe icons as an `IconSet` (`{ name: { label, body?, viewBox?, src? } }`) and write markers as `[[name]]`; run `unknownIcons(texts, icons)` in a content test and expect `[]`.
5. Wrap faces that use art in `<ArtProvider art urls>` (`useArt` outside one throws `no ArtProvider above this card`), and give `ArtImage` a `fallback`.
6. Use `fillImageCache` only when the game has no service worker; a game that installs one precaches faces through offline's `assets`, or the art is stored twice.
7. Fit text with `fitSize` / `useFitText` with a `min`; it never cuts text, and a content test expects `fitReport(...).bad` to be `[]`.
8. Pass the game's own word to `<StateBanner word />` and put it last inside a positioned card; no word means nothing is drawn.
9. Style the `data-part` / `kc-*` hooks and the `--kc-banner-*` variables yourself; the parts are unstyled. Import `looks/icon-glow.css` only if you want the glow.

**Common mistakes:**
- Board-layout zones (`{ r: [x, y, w, h] }`) in a card layout: card zones are `{ x, y, w, h }`.
- A token at an anchor the layout lacks: `placeTokens` lists it in `missing`.
- An unknown icon name in text: it draws as its name in `.kc-unknown` instead of an icon.

## The game passes
- `CardLayout` per card type: `{ w, h, zones: { name: { x, y, w, h, kind?, rotate?, z? } }, anchors?: { name: { x, y, dx?, dy? } } }` in the card's own units (photo pixels, any aspect). `checkLayouts(all)` gives every problem as a line (a test expects `[]`); `mergeLayout(typeLayout, cardOver)` applies one card's tuning.
- `<CardFace layout zones={{ art: <ArtImage url fallback />, text: (zone, name) => <MyText /> }}>`: draws each zone it is given content for (a node, or a function: the slot for the game's own component), sized by percent, in `z` order; `containerType: inline-size`, so text can size in `cqw`. Children (a `TokenLayer`) go over it.
- `<TokenLayer layout tokens={[{ anchor: 'damage', ... }]} render={(t) => <MyCounter />} />`: the n-th token at an anchor sits n steps (`dx`, `dy`) on; a zone name means its centre. `placeTokens` is the same in node and returns unknown anchors in `missing`.
- Icons: `IconSet` = `{ name: { label, body?: '<path .../>', viewBox?, src? } }`; `Syntax` default `[[name]]` with `\` escaping; an optional `separator` (no default, e.g. `:`) lets a marker carry a value: `{gem:2}` with `{`,`}`,`:` is an icon part with `name: 'gem'` and `value: 2` (a number when it parses as one, else the text; `plainOf` writes `gem 2`). Without `separator` a marker holding `:` stays one name. `<IconText text icons syntax? size? renderIcon? strip? />` draws inline SVG at `1em` (follows `currentColor`), an unknown marker as its name in `.kc-unknown`. `strip` = plain-text's `ids.strip` for engine words (printed text never has ids).
- Decoded text (the seam for the zoom, K203): `parseIconText(text, icons, syntax)` gives `Part[]` (`text`, or `icon` with `name`, `label`, `known`); `plainOf(parts)` the words; `unknownIcons(texts, icons)` the names the set lacks (content test: `[]`).
- Art: `<ArtProvider art urls? fromCache?>` gives `useArt<A>()` the game's art object and decodes `urls` ahead; `ArtImage` shows `fallback` until decoded or on error; decoded pictures are kept until the last provider closes (`retainImages`). SVG ids are made unique per icon drawn. `fillImageCache({ store: cacheStorageStore(caches), prefix, urls, fetchImage: fetchImageBlob })` keeps pictures on the device (stops on a full device); `cachedBlobReader(urls, prefix)` is `fromCache` without a service worker. Use `fillImageCache` only without a service worker: a game that installs precaches its faces through offline's `assets`, or the art is stored twice.
- K235: `iconRenderer(icons, cls?, size?)` is glossary's `renderIcon`, so a clause in a prompt title, the log and the zoom draws icons like the face. `fitSize(fits, { min, max, step? })` gives `{ size, fits }`: the largest size that fits, else `min` with `fits: false` (text is never cut); `useFitText(ref, text, opts)` (ui) sets the element's `font-size` that way; `fitReport(entries, fits, opts)` lists the longest text per zone and the zones that overflow at `min` (a content test expects `bad: []`).
- Zones here are `{ x, y, w, h }`; board-layout's are `{ r: [x, y, w, h] }` and its `stageFromLayout` reads only those. A motion to a card zone needs the game's `live` resolver.

## Look
Unstyled: positions only. `cls(part)` gives class names (default `kc-<part>`: face, zone, art, icon, unknown, tokens, token); `data-zone`, `data-kind`, `data-anchor`, `data-icon` mark the parts. A face that is not boxes (STCC's SVG hybrid) uses the layout, text and art parts in its own component.

## Use it in 10 lines
```ts
import { checkLayout, parseIconText, placeTokens, plainOf, type CardLayout } from '../kit/card-parts/index'

const unit: CardLayout = { w: 1170, h: 1635, zones: { art: { x: 0, y: 0, w: 1170, h: 900 }, text: { x: 55, y: 1000, w: 1045, h: 500 } }, anchors: { damage: { x: 100, y: 950, dx: 60 } } }
console.log(checkLayout(unit)) // []
console.log(placeTokens(unit, [{ anchor: 'damage' }, { anchor: 'damage' }]).placed.map((p) => p.x)) // [100, 160]
console.log(plainOf(parseIconText('Pay [[gold]]: draw.', { gold: { label: 'gold', body: '<circle r="5"/>' } }))) // 'Pay gold: draw.'
```

```tsx
import { CardFace, IconText, type CardLayout } from '../kit/card-parts/ui'

const layout: CardLayout = { w: 200, h: 100, zones: { text: { x: 0, y: 0, w: 200, h: 100, kind: 'text' } } }
export const Face = () => <CardFace layout={layout} zones={{ text: <IconText text="Pay [[gold]]" icons={{ gold: { label: 'gold', body: '<circle r="5"/>' } }} /> }} />
```

## State banner (K350)
`<StateBanner word grey? />` (ui): the game's word (never fixed here) lying across a card from bottom-left to top-right, as long as the card's diagonal, turned by atan(h/w) of the card's own box (any shape), letters sized from the word's measured width (any word, any font) so both ends stay inside with a small margin; clipped to the card (`overflow: hidden`, `border-radius: inherit`). Put it last inside the positioned card. `grey` dims the face beneath (backdrop filter). Part: `data-part="state-banner"`, class `kc-state-banner`. Look by CSS variables on the card or above: `--kc-banner-bar`, `--kc-banner-text`, `--kc-banner-edge`, `--kc-banner-font`, `--kc-banner-weight` (font weight, default 700; the fit probe uses the same style, so a heavier weight still fits), `--kc-banner-grey` (a filter). `variant="line"` (default `"bar"`) is only a thin diagonal stroke across the card, no word (`--kc-banner-line`, `--kc-banner-line-width`); `grey` works the same. No word on a bar, nothing; no animation.

```tsx
import { StateBanner } from '../kit/card-parts/ui'

export const Spent = ({ spent }: { spent: boolean }) => (
  <div style={{ position: 'relative', width: 120, aspectRatio: '2 / 3', borderRadius: 8, ['--kc-banner-bar' as string]: '#223' }}>
    <StateBanner word={spent ? 'Spent' : null} grey />
  </div>
)
```

Look file (opt-in, not imported by the component): `looks/icon-glow.css`, a glowing badge on every `[data-icon]`; variables `--kw` (icon colour, set per icon) or `--icon-glow` (default #c9ced8).

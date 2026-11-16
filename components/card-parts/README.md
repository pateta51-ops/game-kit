# card-parts
The parts a game builds its own card face from: the layout as the game's data, art with a cache, printed text with SVG icons inline, tokens. No layout or look is fixed here. `index.ts` loads in node; `ui.ts` adds React.

## The game passes
- `CardLayout` per card type: `{ w, h, zones: { name: { x, y, w, h, kind?, rotate?, z? } }, anchors?: { name: { x, y, dx?, dy? } } }` in the card's own units (photo pixels, any aspect). `checkLayouts(all)` gives every problem as a line (a test expects `[]`); `mergeLayout(typeLayout, cardOver)` applies one card's tuning.
- `<CardFace layout zones={{ art: <ArtImage url fallback />, text: (zone, name) => <MyText /> }}>`: draws each zone it is given content for (a node, or a function: the slot for the game's own component), sized by percent, in `z` order; `containerType: inline-size`, so text can size in `cqw`. Children (a `TokenLayer`) go over it.
- `<TokenLayer layout tokens={[{ anchor: 'damage', ... }]} render={(t) => <MyCounter />} />`: the n-th token at an anchor sits n steps (`dx`, `dy`) on; a zone name means its centre. `placeTokens` is the same in node and returns unknown anchors in `missing`.
- Icons: `IconSet` = `{ name: { label, body?: '<path .../>', viewBox?, src? } }`; `Syntax` default `[[name]]` with `\` escaping. `<IconText text icons syntax? size? renderIcon? strip? />` draws inline SVG at `1em` (follows `currentColor`), an unknown marker as its name in `.kc-unknown`. `strip` = plain-text's `ids.strip` for engine words (printed text never has ids).
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

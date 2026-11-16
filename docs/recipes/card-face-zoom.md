# Build your card face and zoom

Use when a card has to be drawn small (the face) and read in full (the zoom). Components: `card-parts` (layout data, art, text with icons, tokens) and `card-zoom` (the transcription), with `glossary` and `plain-text`. **The game owns its layout and look**: the kit fixes no face, no zone names, no style. A face that is not boxes (an SVG hybrid) uses only the layout, text and art parts in its own component. See `components/reference-game` for the engine side of the same cards.

1. **Layout is data**, one per card type, in the card's own units (photo pixels, any aspect):
   ```ts
   const unit: CardLayout = { w: 1170, h: 1635, zones: { art: { x: 0, y: 0, w: 1170, h: 900 }, text: { x: 55, y: 1000, w: 1045, h: 500 } }, anchors: { damage: { x: 100, y: 950, dx: 60 } } }
   checkLayout(unit) // [] (test: checkLayouts(all) equals []); mergeLayout(typeLayout, cardOver) tunes one card
   ```
2. **Face and tokens** (React, from `ui`): `<CardFace layout zones={{ art: <ArtImage url fallback />, text: (zone, name) => <MyText /> }}>` with `<TokenLayer layout tokens={[{ anchor: 'damage' }]} render={(t) => <MyCounter />} />` as a child. Text sizes in `cqw` (the face is `container-type: inline-size`). `placeTokens(layout, tokens)` is the same in node and returns unknown anchors in `missing`.
3. **Text with icons.** `IconSet = { gold: { label: 'gold', body: '<circle r="5"/>' } }`; text `Pay [[gold]]: draw.`; draw with `<IconText text icons />`. Content test in node: `unknownIcons(texts, icons)` equals `[]`; `plainOf(parseIconText(text, icons, syntax))` gives the words.
4. **Art.** Wrap the screen in `<ArtProvider art urls>`; read with `useArt()`; `ArtImage` shows its `fallback` until decoded. `fillImageCache` / `cachedBlobReader` keep pictures on the device.
5. **The zoom is the full transcription**: words, icons, tokens, glossary links, the engine's reading where it differs.
   ```ts
   const tr = transcribe({ title: 'Scout', printed: [{ text: 'Exhaust: gain [[gold]].' }], tokens: [{ label: 'Damage', count: 2 }] }, { icons, glossary: buildIndex(entries), strip: ids.strip })
   ```
   `<CardZoom tr icons face={<MyFace />} slots={{ ... }} />` draws head, printed, notes, tokens, legend, terms (reorder with `order`, replace a section with `slots`, drop it with `null`). Closing is yours; `useZoomEscape(onClose, open)` is the optional Escape helper.

Pitfalls
- Zone names, aspect and look are yours; copying another game's layout is not a kit use, and there is no default face to find.
- **Release art.** Decoded pictures are kept until the last `ArtProvider` closes (`retainImages`). Keep one provider per screen and let it unmount; a provider that never closes keeps every picture decoded.
- **SVG ids** are made unique per icon drawn. Do not give an icon body ids of your own and reference them from outside, and do not rely on an id being stable between renders.
- **Escape rules.** Icon markers are `[[name]]`, and `\` escapes one. An unknown name draws as its name in `.kc-unknown`; the content test above catches it. `useZoomEscape` is caught before windows under it; do not add a second Escape handler to the same screen.
- Engine words (`notes`, `why`) can hold rule ids: pass `strip`. Printed text never has ids. A token always stays, even with no count.
- Only names the glossary has are linked; add the term to the glossary, not the zoom.

Proof: `checkLayouts` and `unknownIcons` tests in node, a jsdom render of face and zoom for one real card, `npm run check`. The screen text must equal what the engine does (see [card-effect.md](card-effect.md)).

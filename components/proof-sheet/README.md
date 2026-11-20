Review a pack's faces beside their fields, printed words, generated words, and flags.

## Rules for agents

**What it does:** a review page (React, or one static HTML file) that shows each card face beside its fields, printed words, generated words and flags, so a person can check a pack.

**You must:**
1. Pass `cards`, `id`, `name`, `renderFace` (the game's own face renderer, backs and scan overlays included) and `printed` / `fields` from the pack's loader; the sheet draws no face itself.
2. Give a unique `id` per card and a unique id per check; the facet id `flags` is reserved.
3. Style `.proof-card`, `.proof-faces`, `.proof-data` and `.proof-flags > li` in the game: the React view is unstyled.
4. Mount it on a dev route, beside prompt-gallery.
5. For the static export run `node kit/proof-sheet/cli.ts <game-module> <pack> [output.html]` (Node 22.18+); the module's `loadProof(packPath, outputPath)` takes absolute paths and returns the same props, with a server-renderable `renderFace`.
6. Turn on `lazyFaces` for a large pack.

**Common mistakes:**
- A `renderFace` that needs the browser (canvas, window) in the static export: the export renders on the server.
- Reusing a check id, or the id `flags`.
- Reading the sheet's hash view without `viewFromHash` / `viewToHash` when the game has its own router: pass the view in explicitly.

## Use it in 10 lines

```tsx
import { ProofSheet } from "../kit/proof-sheet/ui.ts";

const cards = [{ id: "01", name: "Sample", words: "Example text." }];
declare function Face(props: { id: string }): React.JSX.Element;
export const Proof = () => (
  <ProofSheet
    cards={cards}
    id={(card) => card.id}
    name={(card) => card.name}
    renderFace={(card) => <Face id={card.id} />}
    printed={(card) => card.words}
    fields={[{ label: "Number", get: (card) => card.id }]}
  />
);
```

Pass the faces your game already renders, including backs, scan comparisons, or overlays in `renderFace`. The same card-parts renderer used in play can be used here. Mount the sheet in the game's dev routes alongside prompt-gallery. Pass the records from content-pack or whichever loader your game uses.

- `id` gives a unique key. `group` supplies section headings (combine levels in one label), `groupOrder` sets heading order, and `number` gives natural printed order within each group. Without a number, order is by id. `sorts` adds flat sorts and puts missing values last in either direction.
- `filters` are named facets with one or more values per card. Values within a facet match any selected value, and every active facet must match. Option labels or order can be supplied explicitly. Search matches id, name, number, and any additional strings from `search`, ignoring case and accents.
- `checks` return flags when their predicate is true. Use unique check ids. The built-in flag filter reserves the facet id `flags`. Games can expose scan provenance, missing assets, verification, or other findings through their getters and checks.
- `viewFromHash` and `viewToHash` are pure helpers. The view reads the browser hash and replaces its query without adding history entries. For example, `#/proof?pack=sample&filter.set=a&filter.set=b&q=example` keeps the route and pack query when controls change. `ProofPage` accepts a view explicitly for a game-managed router or static rendering.
- `fields` builds the table. `printed` and `generated` can render formatted words, including the game's inline icons. `data` can provide a JSON detail panel. `children` can add other review sections.
- The React view is unstyled. Style `.proof-card` for side-by-side `.proof-faces` and `.proof-data`, and `.proof-flags > li` for badges. `foldFilters` wraps the controls in a disclosure. Enable `lazyFaces` to mount faces near the viewport for large packs.

## Static export

Run `node kit/proof-sheet/cli.ts <game-module> <pack> [output.html]` with Node 22.18+. The output defaults to `proof/index.html`. The module exports `loadProof(packPath, outputPath)`, with both paths absolute. Return the same props used for the React sheet, synchronously or asynchronously. Load or validate the pack there and supply a server-renderable `renderFace`. The game can compute relative image links from the output path or embed its art. The export includes every face, with basic layout CSS and no client runtime.

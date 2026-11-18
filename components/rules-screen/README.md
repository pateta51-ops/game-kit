An in-app rulebook with heading navigation, ranked word search, glossary links, layered diagrams and reference sheets.

## Use it in 10 lines

```tsx
import { RulesScreen, type Rulebook } from "../kit/rules-screen/ui";

const book: Rulebook = [
  { kind: "h2", id: "start", text: "Start" },
  { kind: "h3", id: "prepare", text: "Prepare" },
  { kind: "p", text: "Place a marker." },
];

export const Rules = () => <RulesScreen book={book} />;
```

## Data and search

- `index.ts` loads in Node. Use `rulebookSchema.safeParse(raw)` to validate JSON, `headingTree(book)` for the contents hierarchy, and `searchRules(book, query)` for ranked direct hits. Every query word must match. Exact text, contiguous phrases, whole words and headings improve rank, with ties in book order.
- `rulesMatching(book, query)` preserves book order with the surrounding headings and the contents of any matching heading. `highlight(text, query)` splits a string into marked and unmarked runs without changing its text. The screen highlights ranked results and links them to the filtered rulebook.
- The ordered blocks are chapters (`h2`), sections (`h3`), prose, lists, credits, tables, figures and sheets. Stable IDs support jumps. Repeated `src` values share the first visible anchor for that source. Pass `target` for router-managed links.
- Pass `glossary` inside a `GlossaryProvider` to use `GlossaryText` (including the provider's icon renderer), `icons` for standalone card-parts icon text, or `renderText` for the game's own markup. The default renderer understands paired double asterisks for bold. Pass `plainText` if custom markup needs its own searchable form.

## Diagrams and sheets

- Each figure has one or more scenes and optional callouts. Coordinates use the scene's own units. Use `area` on scenes and callouts for theme-defined grid arrangement, with reading order in the data for a stacked layout.
- Scenes place face and icon assets by bounds. A face can be rotated, cropped in fractional coordinates or stacked with offset copies. Polygons and zones sit under the assets. Dashed boxes, leader lines, labels, plates and markers sit above them.
- `renderAsset(asset, context)` receives `kind`, `id` and an optional `side`. Supply the game's card-parts face, icon, or sheet scan. Fill the given box inside scenes. `enlargeDiagrams` enables a native modal for each scene. Use the `enlarged` context to provide full-size assets. Sheet sides always enlarge and use the sheet transcript as their accessible description.
- `collapsible` uses native disclosures. A heading's `open` sets its initial state, and a contents jump opens its enclosing disclosures. `words` overrides control labels. Pass game-owned `back` and `actions` to the screens frame.

## Theme

Style by `data-part` on the screen, contents, results, chapters, sections, blocks, diagram cells and callouts. The view provides only positioning and sizing for diagram geometry. Use `--rules-line` and `--rules-area` for diagram strokes and filled zones. Size the enlargement through `data-part="enlarged-content"`.

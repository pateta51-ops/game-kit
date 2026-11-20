An in-app rulebook with heading navigation, ranked word search, glossary links, layered diagrams and reference sheets.

## Rules for agents

**What it does:** An in-app rulebook screen: contents, ranked word search, glossary links, layered diagrams and reference sheets, drawn from a `Rulebook` array.

**You must:**
1. Import the screen from `../kit/rules-screen/ui` and the data helpers (`rulebookSchema`, `headingTree`, `searchRules`, `rulesMatching`, `highlight`) from `index`, which loads in Node; the component needs `glossary`, `card-parts` and `screens`.
2. Validate rulebook JSON with `rulebookSchema.safeParse(raw)` before passing it as `book`.
3. Give every heading or block a link or contents jump must reach a stable `id`; repeated `src` values share the first anchor.
4. Supply `renderAsset(asset, context)` for faces, icons and sheets and fill the box you are given; the default only prints `asset.id`. Set `enlargeDiagrams` to allow a full-size view and give full-size assets for the `enlarged` context.
5. For glossary links render inside a `GlossaryProvider` and pass `glossary`; use `renderText` for the game's own markup and `plainText` so search still reads words.
6. When the game's frame already has a `<main>`, pass `bodyAs="div"`; with `nav`, import `looks/nav.css` for the layout.
7. Style by `data-part` selectors; the view only positions and sizes diagram geometry (`--rules-line` and `--rules-area` colour strokes and zones).
8. Pass the game's own `back` and `actions` to the screens frame.

**Common mistakes:**
- Not passing `renderAsset`: figures show the asset ids as text.
- Custom markup without `plainText`: search matches the markup, not the words.
- Passing `search` and expecting the default input too: `search({ value, onChange, label })` replaces it.

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
- `collapsible` uses native disclosures. A heading's `open` sets its initial state, and a contents jump opens its enclosing disclosures. `words` overrides control labels. `search({ value, onChange, label })` draws the search field instead of the default input (default unchanged). Pass game-owned `back` and `actions` to the screens frame.

## Theme

Style by `data-part` on the screen, contents, results, chapters, sections, blocks, diagram cells and callouts. The view provides only positioning and sizing for diagram geometry. Use `--rules-line` and `--rules-area` for diagram strokes and filled zones. Size the enlargement through `data-part="enlarged-content"`.

## Navigation column

`nav` adds a left column: the search field on top, the section headings below as links that jump to each section, and a body column of at most 80ch. `bodyAs="div"` renders the frame body as a `div` when the game's own frame already has a `<main>`. With neither set the screen is unchanged. At phone widths the column collapses behind a "Contents" button (`data-part="nav-toggle"`, `aria-expanded`; the screen carries `data-nav="open"` or `"closed"`). Import the optional `looks/nav.css` for the layout (breakpoint 40em).

```tsx
import { RulesScreen, type Rulebook } from "../kit/rules-screen/ui";

const book: Rulebook = [
  { kind: "h2", id: "start", text: "Start" },
  { kind: "p", text: "Place a marker." },
];

export const RulesWithNav = () => <RulesScreen book={book} nav bodyAs="div" />;
```

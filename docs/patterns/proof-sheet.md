# Pattern: proof sheet (filters and groups)

Use the [proof-sheet component](../../components/proof-sheet/README.md) for current implementation. This pattern records the source review and the rationale for keeping the review screen separate from gameplay. The game supplies the cards, face renderer and printed references.

## Example (read, never edit)
stcc `Star-trek-captains-chair-game` @ `9fc59643`:
- `src/ui/screens/proofFilters.ts` + `proofFilters.test.ts` (269 lines of tests): filters, sorts, sections.
- `src/ui/screens/proofGroups.ts`: grouping.
- `src/ui/screens/ProofSheet.tsx`: the screen (game-bound).
- `e2e/proof.spec.ts`: end to end.
- Rows-as-data idea: rome `1d0fd2e`.

## What the sheet is
Every card of the real pack on one screen, so the owner checks faces, printed text, generated text (see card-language.md) and numbers against the pictures. It reads the pack only and never touches a game.

## Pure model; the screen only draws
- `ProofView` (in the route): `suits[]`, `sources[]`, `q`, `sort` (`set`, `number`, `name`, `vp`...), `dir`. It lives in the URL so a view can be shared and tested.
- `proofCards(content)`: the cards of the sheet (exclude kinds that are not cards).
- `sourceOf(def)`: the Source a card belongs to (box for commons, `promos`, else its owner deck).
- `matchesSearch(def, q)`: fold accents and case (`normalize("NFD")`, strip U+0300..U+036F, lowercase); matches the name of either face, the printed number, the id.
- `filterCards(cards, view)`: an empty filter keeps everything; Suit, Source and Search combine with AND.
- `sortCards(cards, sort, dir)`: numeric-aware `localeCompare(..., "en", { numeric: true })`; name sort uses `sensitivity: "base"`; ties fall back to name then number; cards without the value sort last whatever the direction.
- `proofGroups(cards)`: group by `box/deck` in a `Map`; deck rank (commons, promos, then each owner), box order from a constant array, printed-number order inside.
- `proofSections(content, view)`: sort `set` gives grouped sections with headings; any other sort gives one flat section (`key: "flat"`).
- Small label helpers: `setTag(def)`, `vpLabel(def)` (printed asterisk kept).

## Rules to carry
- Owner rulings that remove things from the sheet (stcc: mission cards are not cards) live in `proofCards`, in one place.
- Group and filter constants (box order, suit list, source list) are data the game supplies; a kit version takes them as parameters.
- Test the pure functions on the real pack; the e2e only checks that the screen opens, filters and shows each face.

Code nearby: `components/prompt-gallery/` (one state per prompt kind, action coverage) and `components/ui-helpers/`.

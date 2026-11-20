# card-patches

Card data patch layer. The source card data (the dossier transcription) is never edited: corrections live in small files, one per reason (`hidden-fixes`, `reprints`, `abbreviations`, `missing-tags`, `additional-cards`), applied when the data is imported. Pure functions, no packages.

## Rules for agents

**What it does:** Applies small correction files to card data when it is imported, so the source transcription is never edited.

**You must:**
1. Keep one patch file per reason (`hidden-fixes`, `reprints`, `abbreviations`, `missing-tags`, `additional-cards`) and pass them to `applyPatches(source, files, log?)` in the order they should apply; a later file wins on the same field.
2. Use `patch: true` with a `code` to change fields of an existing card; without it the row adds a card.
3. Never edit the source card data; `applyPatches` returns new cards (source order, then added ones) and leaves the input unchanged.
4. Pass a `log` function when a review page needs `{ reason, code, fields }` per row.
5. For a zoomed card, use `errata(source, played)` for printed against played and `rulingsFor(rulings, code)` for rulings keyed by card code.
6. For a check against a community database use `diffCards(ours, theirs, fields, known)` and `cardLookup(cards, standIn)`, so one lost card costs that card, not the game.

**Common mistakes:**
- A `patch: true` row with a code the source lacks: it throws `no card <code>`.
- An added row whose code already exists: it throws `already exists`.
- Fixing a card by hand in the source file: the next import loses it.

```ts
import { applyPatches } from '../kit/card-patches/index';
const cards = applyPatches(source, [
  { reason: 'hidden-fixes', rows: [{ code: '01', patch: true, text: 'Gain 1 gold.' }] },
  { reason: 'additional-cards', rows: [{ code: '90', name: 'Digital card' }] },
], log);
```

- The game imports its JSON files (one per reason) and passes them in the order they should apply; a later file wins on the same field.
- A row with `patch: true` replaces the named fields of the card with that `code`; a missing code throws. A row without it adds a card; a code already present throws.
- Returns new cards in source order, then added ones; the source array and its cards are not changed.
- `log` (optional) receives `{reason, code, fields}` per row, for a review page that shows printed against as-played.

## Zoomed card (K105)

- `errata(source, played, fields?)`: per card and field that differs, `{code, field, printed, played, diff?}`; string fields carry `wordDiff` parts (`same`/`del`/`ins`, spaces kept). Added cards are skipped. Show printed, played or the diff.
- `rulingsFor(rulings, code)`: the `{question, ruling, citation?, date?}` list of a card, newest first. The game keeps rulings in data keyed by code; card names inside them go through the card-link tooltip.
## compare (K109)

- `diffCards(ours, theirs, fields, known)`: unknown / missing ids, field mismatches against a community database, and `staleKnown` (reviewed database-error entries that no longer differ).
- `cardLookup(cards, standIn)`: returns a marked stand-in for a missing id and lists them in `.missing`, so one lost card costs that card, not the game.

## Use it in 10 lines

```ts
import { applyPatches } from '../kit/card-patches/index'

const source = [{ code: '01', name: 'Sword', text: 'Gain 1 gold.' }]
const cards = applyPatches(source, [
  { reason: 'hidden-fixes', rows: [{ code: '01', patch: true, text: 'Gain 2 gold.' }] },
  { reason: 'additional-cards', rows: [{ code: '90', name: 'Digital card' }] },
])
console.log(cards.length) // 2; `source` is unchanged
```

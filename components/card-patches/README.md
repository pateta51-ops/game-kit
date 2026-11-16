# card-patches

Card data patch layer. The source card data (the dossier transcription) is never edited: corrections live in small files, one per reason (`hidden-fixes`, `reprints`, `abbreviations`, `missing-tags`, `additional-cards`), applied when the data is imported. Pure functions, no packages.

```ts
import { applyPatches } from './kit/components/card-patches';
const cards = applyPatches(source, [
  { reason: 'hidden-fixes', rows: [{ code: '01', patch: true, text: 'Gain 1 gold.' }] },
  { reason: 'additional-cards', rows: [{ code: '90', name: 'Digital card' }] },
], log);
```

- The game imports its JSON files (one per reason) and passes them in the order they should apply; a later file wins on the same field.
- A row with `patch: true` replaces the named fields of the card with that `code`; a missing code throws. A row without it adds a card; a code already present throws.
- Returns new cards in source order, then added ones; the source array and its cards are not changed.
- `log` (optional) receives `{reason, code, fields}` per row, for a review page that shows printed against as-played.

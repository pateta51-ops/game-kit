# small-helpers

Four small pure helpers from the outside harvest (K109). No packages; import from `index`.

- `iconHtml(name, word)`: `<span class="icon icon-name">` plus a visually hidden word, so copy, search and text assertions see "credit". `iconText(html)` reads it back as text.
- `runLegalCases(rules, cases)`: setup legality as data. A rule returns `{code, detail}[]`; each rule has a `{valid, invalid, codes}` fixture pair. Returns one line per failure (`[]` in a test). `validateAll` gives every error for a subject.
- `relationIndex(cards, idOf, tables)`: built once; `to(table, id)`, `from(table, id)` (bonded, reprints, required cards...) and `dangling`.
- `keysIn(texts, pattern)` and `missingKeys(emitted, table)`: every text key a string or data names exists in the text table (pattern group 1 is the key).

Not here: the rules, fixtures, field maps and the stand-in card itself; the game supplies them.

## Use it in 10 lines

```ts
import { relationIndex, runLegalCases } from '../kit/small-helpers/index'

type Card = { id: string; needs: string[] }
const index = relationIndex<Card>([{ id: 'a', needs: ['b'] }], (c) => c.id, { needs: (c) => c.needs })
console.log(index.to('needs', 'a'), index.dangling) // ['b'], the ids no card has
console.log(runLegalCases<number>({ positive: (n) => (n > 0 ? [] : [{ code: 'not-positive' }]) }, [{ rule: 'positive', valid: 1, invalid: -1, codes: ['not-positive'] }]))
```

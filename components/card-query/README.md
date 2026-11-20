# card-query

A small card query language (K107): lexer, parser, evaluator. The game supplies its field table. No packages; import from `index`.

## Rules for agents

**What it does:** A small card query language (lexer, parser, evaluator) over a field table the game supplies.

**You must:**
1. Import from `kit/card-query/index`; there are no packages.
2. Give the game's `Field<C>` table: `{ name, aliases?, type, get(card, side) }` with type boolean, number, string, text or list.
3. Compile once with `compileQuery(src, fields)` and reuse the function, or use `filterCards(cards, src, fields)`.
4. Catch `QueryError` (it has `line` and `col`) where a player types the query; it comes from an unknown field, a bad token, an unbalanced bracket or a type mismatch.
5. Ask for the other face with `back:field`; `get` receives `side` `'back'`.

**Common mistakes:**
- `=` is fuzzy (case and accents ignored, contains); use `==` for an exact match.
- A null or missing value fails every comparison except `= null`.
- Comparing a string field to a number: it throws `number expected, got string`, not false.

- `Field<C>`: `{name, aliases?, type, get(card, side)}`; type is boolean, number, string, text or list.
- `compileQuery(src, fields)` returns `card => boolean`; `filterCards(cards, src, fields)`; `parseQuery(src)` gives the tree.
- Operators: `=` fuzzy (case and accents ignored, contains), `==` exact, `!=`, `< <= > >=`, `?` list contains, `& | ! ( )`, `+ - * /`.
- Literals: numbers, `"strings"`, `/regex/flags` (for `=`, `?`), `null`, `true`, `false`; a bare boolean field is true when set.
- Field to field works: `hp + sp < 14`. `back:name = "x"` asks for the other face (`side` is `'back'`).
- A null or missing value fails every comparison except `= null`. Unknown field, bad token or unbalanced bracket throws `QueryError` with `line` and `col`.
- Uses: gallery filter, lookup commands, card test harness ("every card whose text contains X has clause Y"), manifests.

## Use it in 10 lines

```ts
import { compileQuery, filterCards, type Field } from '../kit/card-query/index'

type Card = { name: string; cost: number }
const fields: Field<Card>[] = [
  { name: 'name', type: 'string', get: (c) => c.name },
  { name: 'cost', type: 'number', get: (c) => c.cost },
]
const cards: Card[] = [{ name: 'Axe', cost: 2 }, { name: 'Bow', cost: 4 }]
console.log(filterCards(cards, 'cost < 3 & name = "ax"', fields), compileQuery('cost >= 4', fields)(cards[1]!))
```

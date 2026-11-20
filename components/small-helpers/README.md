# small-helpers

Small pure helpers from the outside harvest (K109). No packages; import from `index`.

## Rules for agents

**What it does:** Small pure helpers with no packages: icon HTML text, data-driven legality cases, a relation index, text-key checks, base-aware asset paths and plural/number formatting.

**You must:**
1. Import from `../kit/small-helpers/index`; use `iconHtml` only for HTML strings, since card-parts `IconText` / `iconRenderer` supersede it.
2. Use `runLegalCases(rules, cases)` in a test and expect `[]`; each rule needs a `{ valid, invalid, codes }` fixture pair, and the game supplies the rules and fixtures.
3. Build `relationIndex(cards, idOf, tables)` once, and read `dangling` to find ids no card has.
4. Build asset URLs with `assetPaths(base, folders, ...)` from `import.meta.env.BASE_URL`, never string-concatenated paths, so a sub-path deployment works; wrap CSS custom-property URLs in `cssUrl`.
5. Use `plural`, `signed`, `listText` and `groupDigits` for number and list text rather than hand-written strings.

**Common mistakes:**
- Hard-coding `/` asset paths: they break under a base path.
- Putting the game's rules or stand-in cards in the helper call: the component holds none.

- `iconHtml(name, word)` (superseded by card-parts `IconText` / `iconRenderer`; keep for HTML strings only): `<span class="icon icon-name">` plus a visually hidden word, so copy, search and text assertions see "credit". `iconText(html)` reads it back as text.
- `runLegalCases(rules, cases)`: setup legality as data. A rule returns `{code, detail}[]`; each rule has a `{valid, invalid, codes}` fixture pair. Returns one line per failure (`[]` in a test). `validateAll` gives every error for a subject.
- `relationIndex(cards, idOf, tables)`: built once; `to(table, id)`, `from(table, id)` (bonded, reprints, required cards...) and `dangling`.
- `keysIn(texts, pattern)` and `missingKeys(emitted, table)`: every text key a string or data names exists in the text table (pattern group 1 is the key).
- `assetPaths(base, folders, {ext, iconFiles})`: base-aware URLs (`face`, `board`, `icon`, `pub`, `of(kind, name)`) from a base such as `import.meta.env.BASE_URL`; `cssUrl(url)` makes a URL absolute for CSS custom properties; `joinBase`.
- `plural(n, one, many?)`, `pluralWord`, `signed`, `listText`, `groupDigits`: number and text format.

Not here: the rules, fixtures, field maps and the stand-in card itself; the game supplies them.

## Use it in 10 lines

```ts
import { assetPaths, plural, relationIndex, runLegalCases } from '../kit/small-helpers/index'

type Card = { id: string; needs: string[] }
const index = relationIndex<Card>([{ id: 'a', needs: ['b'] }], (c) => c.id, { needs: (c) => c.needs })
console.log(index.to('needs', 'a'), index.dangling) // ['b'], the ids no card has
console.log(runLegalCases<number>({ positive: (n) => (n > 0 ? [] : [{ code: 'not-positive' }]) }, [{ rule: 'positive', valid: 1, invalid: -1, codes: ['not-positive'] }]))
console.log(assetPaths('/game/', { face: 'art' }).face('A1'), plural(2, 'boss', 'bosses')) // /game/art/A1.webp 2 bosses
```

# small-helpers

Four small pure helpers from the outside harvest (K109). No packages; import from `index`.

- `iconHtml(name, word)`: `<span class="icon icon-name">` plus a visually hidden word, so copy, search and text assertions see "credit". `iconText(html)` reads it back as text.
- `runLegalCases(rules, cases)`: setup legality as data. A rule returns `{code, detail}[]`; each rule has a `{valid, invalid, codes}` fixture pair. Returns one line per failure (`[]` in a test). `validateAll` gives every error for a subject.
- `relationIndex(cards, idOf, tables)`: built once; `to(table, id)`, `from(table, id)` (bonded, reprints, required cards...) and `dangling`.
- `keysIn(texts, pattern)` and `missingKeys(emitted, table)`: every text key a string or data names exists in the text table (pattern group 1 is the key).

Not here: the rules, fixtures, field maps and the stand-in card itself; the game supplies them.

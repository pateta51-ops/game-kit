# plain-text

The owner's rule "no rule ids on screen" as code: rule, ruling and decision ids (`TURN-07`, `AR-12`, `D-044`) stay in data, engine output and tests, and every line a person reads goes through this filter first. Pure functions, no packages, loads in node.

## Rules for agents

**What it does:** The "no rule ids on screen" rule as code.

**You must:**
1. Build one `ruleIdFilter({ long, short })` from the game's id families (regex sources; a longer name before its prefix).
2. Pass every line a person reads through `ids.strip` where text enters the screen: the store's view and error, the log, rich text; use `plainPrompt` / `plainView` for prompts.
3. Do not draw a line that `strip` turned into `''`.
4. Keep a game test that runs `strip` over the content files and expects no change (printed card text never matches), and one using `forbiddenText(ids.pattern, ...)` with `visibleText(container)`.
5. Run `longSentences` over prompt wording and expect `[]`.
6. For glossary entries use `hideRules` for the `rules` list and `strip` for `summary` and `body`.

**Common mistakes:**
- A `short` family needs 2 to 4 digits, so "A-5" and "R-1" stay; put ids with 1 to 3 digits in `long`.
- A family matches only in its own case (`d-44` stays).


## Filter

```ts
const ids = ruleIdFilter({ long: ['TURN', 'BUILD', 'MAP-(?:AB|CD)'], short: ['AR', 'IR', 'R', 'D'] });
ids.strip('Idle Scout (TURN-06, TURN-09).'); // 'Idle Scout.'
```

- The game passes its id families as regex sources (the list its traceability config already holds). `long`: `FAMILY-n`, 1 to 3 digits and an optional letter (`TURN-07A`). `short`: `FAMILY-nn`, 2 to 4 digits, so "Take A-5 cards" and "Pay 1 R-1" stay. Either may end in `.n` (`RL-029.1`). Put a longer name before its prefix (`SET-OPT` before `SET`). A family matches only in its own case and never after a hyphen or a word character: `d-44`, `PRE-TURN-07` and `COVID-19` stay.
- `strip(text)` removes ids, brackets holding only ids (`(see IR-22)`), the lists between them (`BUY-01 to BUY-04`), and the lead-in before them ("ruled by AR-026 here" gives "ruled here"; also a colon or an empty bracket). A line that was only ids becomes `''`: do not draw it.
- `test` matches one id. `pattern` is its regex source with the edges: use it inside other patterns. `source` is the bare one, and `ruleIdSource(families)` gives it alone.
- `plainPrompt(prompt, ids.strip, keys?)` strips the string fields `keys` (default `label`, `reason`) of each of `prompt.options`; a label that would become empty is kept. `plainView(view, ids.strip, keys?)` does it for `view.prompt` (which may be null). Both return the same object when nothing changed, so a store can call them on every update.
- Call it where text enters the screen: the store's view and error, the log, the rich-text component. Printed card text must never match: keep a test in the game that runs `strip` over its content files and expects no change.

## Check for a test

```ts
const bad = forbiddenText(ids.pattern, String.raw`\bD\d+\b`);
expect(visibleText(container)).not.toMatch(bad);
```

- `CODE_TEXT`: a camelCase identifier, `=`, a section mark with a number (`§4`). `forbiddenText(...sources)` adds the game's own patterns.
- `visibleText(el)`: the element's text plus the `title`, `alt` and `placeholder` attributes of it and of everything inside it. `longSentences(text, max = 20, strip?)`: the sentences over `max` words as `{ sentence, words }`; a test runs it over prompt wording and expects `[]`.

## Not here

`glossary`'s `hideRules` (on `LookupHost` and `EntryBody`) leaves an entry's `rules` list out of the popup. That list is a field, not text; use `hideRules` for it and `strip` for the entry's `summary` and `body`.

## Use it in 10 lines

```ts
import { ruleIdFilter } from '../kit/plain-text/index'

const ids = ruleIdFilter({ long: ['TURN', 'AR'], short: ['R'] })
console.log(ids.test.test('Pay 1 gold (TURN-07)')) // true: a screen text must never match
```

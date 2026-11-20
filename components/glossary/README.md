# glossary

Links every glossary term and icon code in the game's texts to a lookup, and checks the glossary covers what the game shows. The game passes its entries as data and keeps its words, routes and look. Needs `phone-mode` (and so `state-machines`) and the packages `react` and `zustand`. `index.ts` draws nothing and loads in node; `ui.ts` holds the React parts.

## Rules for agents

**What it does:** Links every glossary term and icon code in a game's texts to a lookup, and checks that the glossary covers what the game shows.

**You must:**
1. Install `react` and `zustand`; the component needs `phone-mode`. `glossary.css` is loaded by `GlossaryText`.
2. Pass your entries as data to `<GlossaryProvider entries icon? renderIcon?>` and mount `<LookupHost>` once inside it.
3. Draw text with `<GlossaryText text>`; a link inside a button is `hold` (right-click or long press), elsewhere `click`.
4. Pass `closeOn` (your route) to `LookupHost` so the lookup closes on navigation; `hideRules` keeps rule ids out of the DOM.
5. Add a script that calls `runGlossaryCheck({ entries, texts, ... })` to the check chain; it exits 1 on findings.
6. Run `node kit/glossary/printed.ts --entries ... --source ...` in the check chain so summaries match the printed text.
7. Set `--glo-*` variables for the look.

**Common mistakes:**
- Showing rule ids on screen: use `hideRules`.
- `coverage: true` in `buildIndex` links every name, including `searchAliases` and `plain` entries' names; leave it for the coverage check.
- Expecting a `plain` entry to link in lower case: it links only its names in capitals.


## Matcher (`match.ts`)

- `GlossaryEntry`: `id`, `term`, `aliases?`, `kind?`, `icon?`, `tokens?`, `searchAliases?`, `plain?`, `summary`, `body?` (blank-line paragraphs), `rules?`, `see?`.
- `buildIndex(entries, { coverage?, icon? })`; `matchText(index, text)` gives text, term and icon segments; `linkedIds`, `coveredChars`, `iconEntry`. Longest name first, word boundaries, endings (s, es, d, ed, ing, doubled consonant), names in capitals only as written. Icons are `{code}` or `[[code]]` (or the game's `icon` regex); in an entry's `icon`/`tokens`, `*` is any value and `#` a number.
- Linking index (default): `searchAliases` never link, a `plain` entry links only its names in capitals. `coverage: true` keeps every name.
- `glossaryProblems(entries)`, `searchEntries(entries, query)`, `paragraphs(body)`, `isPrinted`, `nameKey`.

## Check (`check.ts`)

The game's script reads its text sources (printed fields, describe output) and calls `runGlossaryCheck({ entries, texts: [{ where, text, generated? }], iconCodes?, required?, vocab?, headings?, ruleIds?, nothingToLink?, icon? }, { out?, err?, quiet? })`: exit code 0 or 1. Findings: SCHEMA, RULE, ICON (a code of the set or in a text with no entry), REQUIRED (a name that is not one whole entry), HEADING (capitals outside a link), VOCAB (a game word with no entry in the coverage index), LANGUAGE (a generated text that links nothing). `checkGlossary` returns them.

Printed words (`printed.ts`, node only, not in `index.ts`): `node kit/glossary/printed.ts --entries content/glossary.json --source <file or folder> [--source ...] [--icon <regex>] [--strip <regex>]... [--letters <class, default a-z0-9>] [--exempt <field>=<value>]...` in the game's check chain: exit 1 with a `PRINTED` line for each summary or body paragraph that is not in the source documents, icons (default `{code}`, `{code:value}`), case and punctuation aside. `--strip` removes markup from the sources; `--exempt source=arbiter` skips explanations. `printedFindings({ entries, sources, icon?, strip?, letters?, exempt? })` returns the lines.

## UI (`ui.ts`)

- `<GlossaryProvider entries icon? renderIcon?>`: `renderIcon(code, entry | undefined)` draws an icon; without it the entry's term (or the code) stands in. `useGlossary()`.
- `<GlossaryText text onTerm? mode?>`: `mode` default `auto`: a link inside a control (closest `button`, `[role=button]`, `label` or `[data-glossary-hold]`) is `hold`, elsewhere `click`; force either. `click` opens on a press; `hold` opens on right-click or a long press (`HOLD_MS`), a tap presses the control. `<GlossaryLink id>`.
- `<LookupHost closeOn? phone? words? kindTitle? ruleHref? glossaryHref? slideMs? hideRules? frame?>`: mounted once inside the provider. A popover beside the link (`besideAnchor`), or phone-mode's `Sheet` when `phone` (default: phone-mode's layout). Links inside follow, Back returns, Escape, Close or a press outside close. `hideRules` leaves rule ids out of the DOM (also on `EntryBody`). `frame` is a component `({icon, name, children})` that replaces the popover's head and wraps its body and buttons (desktop popover only; `icon` is the entry's `icon` through `renderIcon`). `closeOn`: the lookup also closes when this value changes (the game passes its route or path) and on `popstate` / `hashchange` (no router dependency). Store: `useLookup` (also exported from `ui.ts`), `openEntry`.

## Look

`glossary.css` (loaded by `GlossaryText.tsx`) sets neutral values at zero specificity: `--glo-link`, `--glo-link-line`, `--glo-focus`, `--glo-icon-size`, `--glo-z`, `--glo-scrim`, `--glo-pop-width`, `--glo-pop-pad`, `--glo-pop-bg`, `--glo-pop-text`, `--glo-pop-border`, `--glo-pop-radius`, `--glo-pop-shadow`, `--glo-font`, `--glo-kind`, `--glo-kind-font`, `--glo-kind-opacity`, `--glo-head-font`, `--glo-meta-opacity`, `--glo-btn-h`, `--glo-btn-border`, `--glo-btn-radius`, `--glo-btn-bg`, `--glo-btn-text`, `--glo-btn-primary-bg`, `--glo-btn-primary-text`. The sheet takes phone-mode's `--pm-*`. Classes: `kit-glo-link`, `-link--hold`, `-icon`, `-scrim`, `-pop`, `-sheet`, `-head`, `-kind`, `-term`, `-body`, `-summary`, `-para`, `-rules`, `-rule`, `-see`, `-foot`, `-btn`, `-btn--primary`.

Tests: `glossary.test.ts`, `printed.test.ts` (node), `ui.test.tsx` (jsdom).

## Use it in 10 lines

```ts
import { buildIndex, matchText } from '../kit/glossary/index'

const index = buildIndex([{ id: 'g1', term: 'Shield', summary: 'Blocks one hit.' }])
console.log(matchText(index, 'Gain a Shield.')) // text segments, the term linked to its entry
```

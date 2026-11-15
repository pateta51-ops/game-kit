# glossary

Links every glossary term and icon code in the game's texts to a lookup, and checks the glossary covers what the game shows. The game passes its entries as data and keeps its words, routes and look. Needs `phone-mode` (and so `state-machines`) and the packages `react` and `zustand`. `index.ts` draws nothing and loads in node; `ui.ts` holds the React parts.

## Matcher (`match.ts`)

- `GlossaryEntry`: `id`, `term`, `aliases?`, `kind?`, `icon?`, `tokens?`, `searchAliases?`, `plain?`, `summary`, `body?` (blank-line paragraphs), `rules?`, `see?`.
- `buildIndex(entries, { coverage?, icon? })`; `matchText(index, text)` gives text, term and icon segments; `linkedIds`, `coveredChars`, `iconEntry`. Longest name first, word boundaries, endings (s, es, d, ed, ing, doubled consonant), names in capitals only as written. Icons are `{code}` or `[[code]]` (or the game's `icon` regex); in an entry's `icon`/`tokens`, `*` is any value and `#` a number.
- Linking index (default): `searchAliases` never link, a `plain` entry links only its names in capitals. `coverage: true` keeps every name.
- `glossaryProblems(entries)`, `searchEntries(entries, query)`, `paragraphs(body)`, `isPrinted`, `nameKey`.

## Check (`check.ts`)

The game's script reads its text sources (printed fields, describe output) and calls `runGlossaryCheck({ entries, texts: [{ where, text, generated? }], iconCodes?, required?, vocab?, headings?, ruleIds?, nothingToLink?, icon? }, { out?, err?, quiet? })`: exit code 0 or 1. Findings: SCHEMA, RULE, ICON (a code of the set or in a text with no entry), REQUIRED (a name that is not one whole entry), HEADING (capitals outside a link), VOCAB (a game word with no entry in the coverage index), LANGUAGE (a generated text that links nothing). `checkGlossary` returns them.

## UI (`ui.ts`)

- `<GlossaryProvider entries icon? renderIcon?>`: `renderIcon(code, entry | undefined)` draws an icon; without it the entry's term (or the code) stands in. `useGlossary()`.
- `<GlossaryText text onTerm? mode?>`: `click` opens on a press; `hold` (inside a control) opens on right-click or a long press (`HOLD_MS`), the press still goes to the control. `<GlossaryLink id>`.
- `<LookupHost phone? words? kindTitle? ruleHref? glossaryHref? slideMs?>`: mounted once inside the provider. A popover beside the link (`besideAnchor`), or phone-mode's `Sheet` when `phone` (default: phone-mode's layout). Links inside follow, Back returns, Escape, Close or a press outside close. Store: `useLookup`, `openEntry`.

## Look

`glossary.css` (loaded by `GlossaryText.tsx`) sets neutral values at zero specificity: `--glo-link`, `--glo-link-line`, `--glo-focus`, `--glo-icon-size`, `--glo-z`, `--glo-scrim`, `--glo-pop-width`, `--glo-pop-pad`, `--glo-pop-bg`, `--glo-pop-text`, `--glo-pop-border`, `--glo-pop-radius`, `--glo-pop-shadow`, `--glo-font`, `--glo-kind`, `--glo-kind-font`, `--glo-kind-opacity`, `--glo-head-font`, `--glo-meta-opacity`, `--glo-btn-h`, `--glo-btn-border`, `--glo-btn-radius`, `--glo-btn-bg`, `--glo-btn-text`, `--glo-btn-primary-bg`, `--glo-btn-primary-text`. The sheet takes phone-mode's `--pm-*`. Classes: `kit-glo-link`, `-link--hold`, `-icon`, `-scrim`, `-pop`, `-sheet`, `-head`, `-kind`, `-term`, `-body`, `-summary`, `-para`, `-rules`, `-rule`, `-see`, `-foot`, `-btn`, `-btn--primary`.

Tests: `glossary.test.ts` (node), `ui.test.tsx` (jsdom).

# theme-check

Static check that a game's look lives in its token file. Lifted from Jarl's `scripts/theme-check.ts` (its file mode, made configurable).

## Rules for agents

**What it does:** a static check that a game's look lives in its token file (colours, fonts, radii, shadows, logo, assets), plus browser steps for layout, coverage and the phone font floor, and a dev sheet of the game's parts.

**You must:**
1. Write `theme-check.config.json` (copy `theme-check.config.example.json`) and run `node kit/theme-check/theme-check.ts --config theme-check.config.json` in the game's check chain: exit 0 is clean, 1 findings, 2 usage.
2. Put every colour, font family, radius and shadow in the token file; a radius or shadow elsewhere must be a `var(...)` token (or 0 / none). Fix a finding in the source; turn a rule off in `rules` only when the owner or director says so.
3. Pass files after the flags to check only those (pre-commit style); a path that matches nothing is a `FILE` finding.
4. In e2e run `layoutFindings`, `coverageFindings` and `phoneFontFindings` per screen with the Playwright `page`; assert `problems` is empty and that `pieces` or `rows` holds what the screen should show (an empty screen is clean).
5. Mount `Sheet` only with `dev` true: `isDevMode(undefined, import.meta.env.DEV)` from prompt-gallery.
6. Never edit `kit/` to quiet a finding.

**Common mistakes:**
- Matching is textual (`prop: value`, one declaration a line): a value built in code or split over lines is not seen.
- Checking the token file itself: it is exempt unless `checkTokenFile` is set.
- `layoutFindings` on a screen that has not rendered its pieces yet: nothing measured, nothing found.
- `onTop` on an element with `pointer-events: none`: it is not hit.

`node components/theme-check/theme-check.ts --config theme-check.config.json [--root .]` (exit 0 clean, 1 findings, 2 usage). From code: `themeCheck(root, config)` or `themeFindings(files, config)` return the finding lines.

Config (see `theme-check.config.example.json`): `tokenFile` (exempt), `dirs`, `exts`, `exclude` (regexes), `fontFamilies` (allowed named families), `logoComponent` and `menuFiles` (each must render it).

Findings: COLOR, FONT, SYSTEM_FONT, RADIUS, SHADOW, LOGO. A radius or shadow must be a `var(...)` token (or 0 / none). Matching is textual: it reads `prop: value` in CSS and in tsx style objects, one line per declaration.

Options (all off by default): `menuDirs` (every `.tsx` directly in these folders, outside `menuFiles`, must render `menuComponent`, default `logoComponent`; both names go into a regex, so `(?:Sky)?Logo` works): LOGO. `fontFaces` (`family`, `file`): each `@font-face` in the checked CSS and the token file must be for a listed family and load one of its files, and each family needs one (FONTFACE); a family with several faces (normal and italic) lists one entry per file (K319). `bodyFont: true`: a `body` rule must set `font-family` to a token or an allowed family (BODY_FONT). `looseFont: true`: a `font:` shorthand passes when it ends in a `var(...)` token or an allowed family (`12px var(--f-ui)`). `fontVars` (variable names, `--f-ui`): only these are font tokens, in `font-family`, the body rule and `font:` (`var(--size)` fails). `fontSrcPrefix` (`/fonts/`): an `@font-face` src must end in the prefix and the file. A `menuDirs` folder that is missing or outside `dirs` is a LOGO finding. `assets.licenceHeading: true`: the licence file needs a `## <Family>` line per family. FONTFACE and BODY_FONT are skipped in files mode. `assets.icons` (`dir`, `tokens`, optional `listFile`, `listPattern`): each token needs `<dir>/<token>.svg` with a path, and each token the list file defines (first group of `listPattern` per line, default a table row starting `| [TOKEN]`) must be in `tokens` (ICON); a list file that is absent is not checked. `pathStartsWithM: true` (K182, off by default): each icon's `<path>` `d` must start with `M` or `m` (ICON).

Switches: `rules` (`{ "COLOR": false, "RADIUS": false, "SHADOW": false }`) drops every finding of a rule set to `false`; any rule name works (COLOR, FONT, SYSTEM_FONT, RADIUS, SHADOW, LOGO, FONTFACE, BODY_FONT, FILE, and the asset rules FONT_MISSING, FONT_UNREFERENCED, FONT_LICENCE, SVG, ICON); a rule left out is on. `checkTokenFile: true`: the token file is not exempt, it is checked like any other file (with COLOR, RADIUS and SHADOW still on, its own literals are findings: turn those off, or keep the default).

`bodyFontToken: true` (with `bodyFont`): the body rule's `font-family` must be a single `var(...)` token (one of `fontVars` when set); an allowed family name is a BODY_FONT finding.

Files mode: paths, folders or globs (`*`, `**`, `?`; relative to the root) after the flags, or `themeCheck(root, config, only)`, check only those files: `exts`, `exclude` and the token file still apply, LOGO only for a menu file in the list, a path or glob that matches no file, or lies outside the root, is a `FILE` finding (a typo fails), `node_modules` and dot folders are never walked, and the asset check is skipped.

Assets (optional `assets` in the config, or `assetFindings(root, assets)`): the look's files are in place. `fontDir` with `fonts` (`family`, `file`): FONT_MISSING, and FONT_UNREFERENCED for a font file there outside the list; `licenceFile` must exist and name every family (FONT_LICENCE); each of `svgs` must be an SVG with a path or another shape: circle, rect, ellipse, polygon, polyline, line or use (SVG, K319); each of `files` must exist (FILE).

Browser steps (`layout.ts`, Playwright `page`, typed by shape):
- `layoutFindings(page, { zones, pieces, parts?, rows?, rowBox?, overlapOk?, tolerance? })` (selectors; tolerance in px, default 0.5) returns `{ pieces, rows, problems }`. Each top-level `pieces` element in a `zones` element, its box joined with its `parts` descendants, must lie inside the zone and clear of every other piece; the pieces of a zone that matches `overlapOk` may overlap each other (a fanned hand). Elements with `display: none`, `visibility: hidden` or no box are skipped. Each `rows` element must not be cut (scroll size over client size) and must end inside its nearest `rowBox` ancestor. Assert `problems` is empty and that `pieces` or `rows` is what the screen should hold (a screen with nothing to measure is clean). Names in the lines are `data-testid`, else `aria-label`, else the class.
- `onTop(page, a, b)`: `'a'`, `'b'`, `'none'` (no overlap), `'offscreen'` or `'other:<tag.class>'`: what is hit at the centre of the overlap of `a` and the first `b` it overlaps. It scrolls `a` into view first; `'offscreen'` means the centre is still outside the window. Elements with `pointer-events: none` are not hit: add a style that lets them first.
- From code: `layoutProblems(measured, tolerance)`, `outside(box, zone, tol)`, `overlap(a, b, tol)` are pure, over `{ l, t, r, b }` boxes; `measure` and `topAt` run in the page.

Browser step (`coverage.ts`): `coverageFindings(page, { area?, items?, minSpan?, maxEmpty?, cell? })` returns `{ items, problems }`; pure `coverageProblems({ area, boxes }, spec)`. Content (visible leaf text, images, controls; or the `items` selector) must span `minSpan` (0.7) of the `area` (selector, default the window) in width and height, and no empty block (grid of `cell` px, 16) may exceed `maxEmpty` (0.25) of it. Run it once per screen.

Browser step (`fonts.ts`), the phone font floor (`phoneFontFindings(page, routes, minPx = 26, size = 390x844)` sets the viewport, then runs it): `fontSizeFindings(page, routes, minPx)` from a game's e2e run (Playwright `page`; routes are what `page.goto` takes) visits each route and returns `route: "text" (Npx)` for every visible text node whose computed font size is under `minPx`; empty is clean. Needs a DOM; the static check is unchanged.

Dev sheet (`Sheet.tsx`, K376): the `dev` prop is required and the route renders nothing unless it is true (pass `isDevMode(undefined, import.meta.env.DEV)` from prompt-gallery). A width toggle sets the body to `narrowPx` (390); an entry with `variants: { side: ['basic','advanced'] }` gets a toggle per key and `render(picks)` receives the choice; an index of section links sits above. The filter follows `hashchange`. every component or board view the game registers on one dev page, each in a labelled section (`<h2>` label, then one `<h3>` per state), no look. The game passes `entries` of `{ id, label, render(), states?: { label, render() }[] }`; `states` are further looks (sample props). The filter box matches id or label and is kept in the hash as `q=` (`#/dev/sheet?q=button`, or `#q=button`), read on load and written with `replaceState`; pass `hash` to fix it (tests). A render that throws shows its message in that section only (`sheet-error`). Prompts and endings stay in `prompt-gallery`; this is the theme's parts. Pure helpers in `sheet.ts`: `filterFromHash`, `hashWithFilter`, `filterEntries`. For e2e: `[data-testid="sheet-entry"]` with `data-id`.

## Use it in 10 lines

```sh
node kit/theme-check/theme-check.ts --config theme-check.config.json   # exit 0 clean, 1 findings, 2 usage
```

```tsx
import { Sheet } from '../kit/theme-check/Sheet'
import type { SheetEntry } from '../kit/theme-check/sheet'

const entries: SheetEntry[] = [
  { id: 'button', label: 'Button', render: () => <button type="button">Go</button>, states: [{ label: 'disabled', render: () => <button type="button" disabled>Go</button> }] },
]
export const DevSheet = () => <Sheet dev entries={entries} />
```

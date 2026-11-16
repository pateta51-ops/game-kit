# theme-check

Static check that a game's look lives in its token file. Lifted from Jarl's `scripts/theme-check.ts` (its file mode, made configurable).

`npx tsx components/theme-check/theme-check.ts --config theme-check.config.json [--root .]` (exit 0 clean, 1 findings, 2 usage). From code: `themeCheck(root, config)` or `themeFindings(files, config)` return the finding lines.

Config (see `theme-check.config.example.json`): `tokenFile` (exempt), `dirs`, `exts`, `exclude` (regexes), `fontFamilies` (allowed named families), `logoComponent` and `menuFiles` (each must render it).

Findings: COLOR, FONT, SYSTEM_FONT, RADIUS, SHADOW, LOGO. A radius or shadow must be a `var(...)` token (or 0 / none). Matching is textual: it reads `prop: value` in CSS and in tsx style objects, one line per declaration.

Files mode: paths, folders or globs (`*`, `**`, `?`; relative to the root) after the flags, or `themeCheck(root, config, only)`, check only those files: `exts`, `exclude` and the token file still apply, LOGO only for a menu file in the list, a path or glob that matches no file, or lies outside the root, is a `FILE` finding (a typo fails), `node_modules` and dot folders are never walked, and the asset check is skipped.

Assets (optional `assets` in the config, or `assetFindings(root, assets)`): the look's files are in place. `fontDir` with `fonts` (`family`, `file`): FONT_MISSING, and FONT_UNREFERENCED for a font file there outside the list; `licenceFile` must exist and name every family (FONT_LICENCE); each of `svgs` must be an SVG with a path (SVG); each of `files` must exist (FILE).

Browser steps (`layout.ts`, Playwright `page`, typed by shape):
- `layoutFindings(page, { zones, pieces, parts?, rows?, rowBox?, overlapOk?, tolerance? })` (selectors; tolerance in px, default 0.5) returns `{ pieces, rows, problems }`. Each top-level `pieces` element in a `zones` element, its box joined with its `parts` descendants, must lie inside the zone and clear of every other piece; the pieces of a zone that matches `overlapOk` may overlap each other (a fanned hand). Elements with `display: none`, `visibility: hidden` or no box are skipped. Each `rows` element must not be cut (scroll size over client size) and must end inside its nearest `rowBox` ancestor. Assert `problems` is empty and that `pieces` or `rows` is what the screen should hold (a screen with nothing to measure is clean). Names in the lines are `data-testid`, else `aria-label`, else the class.
- `onTop(page, a, b)`: `'a'`, `'b'`, `'none'` (no overlap), `'offscreen'` or `'other:<tag.class>'`: what is hit at the centre of the overlap of `a` and the first `b` it overlaps. It scrolls `a` into view first; `'offscreen'` means the centre is still outside the window. Elements with `pointer-events: none` are not hit: add a style that lets them first.
- From code: `layoutProblems(measured, tolerance)`, `outside(box, zone, tol)`, `overlap(a, b, tol)` are pure, over `{ l, t, r, b }` boxes; `measure` and `topAt` run in the page.

Browser step (`fonts.ts`): `fontSizeFindings(page, routes, minPx)` from a game's e2e run (Playwright `page`; routes are what `page.goto` takes) visits each route and returns `route: "text" (Npx)` for every visible text node whose computed font size is under `minPx`; empty is clean. Needs a DOM; the static check is unchanged.

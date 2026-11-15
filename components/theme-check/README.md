# theme-check

Static check that a game's look lives in its token file. Lifted from Jarl's `scripts/theme-check.ts` (its file mode, made configurable).

`npx tsx components/theme-check/theme-check.ts --config theme-check.config.json [--root .]` (exit 0 clean, 1 findings, 2 usage). From code: `themeCheck(root, config)` or `themeFindings(files, config)` return the finding lines.

Config (see `theme-check.config.example.json`): `tokenFile` (exempt), `dirs`, `exts`, `exclude` (regexes), `fontFamilies` (allowed named families), `logoComponent` and `menuFiles` (each must render it).

Findings: COLOR, FONT, SYSTEM_FONT, RADIUS, SHADOW, LOGO. A radius or shadow must be a `var(...)` token (or 0 / none). Matching is textual: it reads `prop: value` in CSS and in tsx style objects, one line per declaration.

Browser step (`fonts.ts`): `fontSizeFindings(page, routes, minPx)` from a game's e2e run (Playwright `page`; routes are what `page.goto` takes) visits each route and returns `route: "text" (Npx)` for every visible text node whose computed font size is under `minPx`; empty is clean. Needs a DOM; the static check is unchanged.

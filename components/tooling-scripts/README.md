# tooling-scripts

Small repo scripts a game runs with `npx tsx kit/tooling-scripts/<script>.ts`. Each takes its paths and patterns as flags, or the same names in `--config <json>` (flags win; a repeatable flag is an array). Exit 0 clean, 1 findings, 2 usage or a failed read or write. Each also exports `run(args, io)` and its pure parts. No dependency beyond Node, except the three below that load a package of the game (`sharp`, `playwright`, `esbuild`).

## More scripts (each file's header says what it does)

- `shrink-png.ts` (from Jarl): `--dir <dir> [--max-bytes 1900000] [--colours 256,192,128] [--sharp <module>]`. Re-encodes each PNG over the limit as a dithered palette PNG at the same size; exit 1 when one still does not fit.
- `fonts-fetch.ts`, `woff.ts` (from Rome): `--roles <json> --out <dir> [--force]`. The JSON is `{ roles: [{ role, family, printed, ownerPrefix?, substitute: { family, licence, licenceFile, licenceUrl, files: [{ file, url }] } }], copy?: [{ from, note }] }`. Downloads from the URLs you list (a manual step, never in a check); a `.woff` name packs the TTF with `toWoff(bytes)`; writes `fonts.json` and `LICENSES.md`.
- `mock-capture.ts` (from Jarl and Rome): `--list <json> --src <dir> --out <dir> [--only a,b] [--width 3840] [--height 2160] [--settle-ms 800] [--playwright <module>]`. The list is `[{ name, file, query?, width?, height?, deviceScaleFactor?, browser?, fullPage? }]`; writes `<out>/<name>.png` and `capture-report.json` (errors, failed requests, broken images, fonts, bytes). No callout boards.
- `setup.ps1` (from Jarl): `-Name -RepoUrl -Dir [-Marker package.json] [-NodeMajor 22] [-Need a,b] [-Playwright] [-Python] [-PipModules a,b] [-Build a,b] [-Check check] [-RunnerRepo owner/repo -RunnerLabel x [-RunnerEnv 'K=V']] [-Ready 'text'] [-CheckOnly]`. The owner's Windows PC check-up; ends with a numbered to-do list.
- `dossier-sync.ts` (from Rome): `--source <git checkout> --target <dir> [--exclude <path>]... [--name <text>]`. Replaces the target with the source's tracked files and writes `SYNC.md` with the commit; refuses a source with uncommitted changes.
- `bundle-node.ts` (from Warp's Edge): `--entry <file>... --outdir .bundle/node [--root .] [--target node22]`. Simulator, worker and bench scripts as `.mjs` for plain `node`, without tsx's keep-names cost.

## art-check.ts (from Rome)

`--manifest <json> --sources <dir> --out <dir> --ext webp [--source-id '^(F\d{3})-.+\.png$'] [--need <json array of ids>]... [--max-bytes <n>] [--max-file-bytes <n>]`

The manifest is a record of id to `{ source, sha256, bytes, outSha256? }`: the source file name and its SHA-256, the output's size and (optional) SHA-256. An id's output is `<out>/<id>.<ext>`. Fails when no source matched, a source has no entry, a source changed, an output is missing or differs, an entry has no source, an id in a `--need` list has no output, or a file or the total is over its cap. Group 1 of `--source-id` is the id (default: the file name without its extension); files that do not match are ignored. It does not build the art and does not read pixel sizes.

## text-leak.ts (from Imperium)

`--base <commit> [--repo .] [--exclude <path>]... --source <file or dir>... [--json-keys printed,text] [--n 6]`

Lists the lines added since `--base` that share `--n` or more consecutive words with the private source texts, as `file:line: N words ~ source | "first five words ..."` (never more of the text). A `.json` source gives the strings under `--json-keys` at any depth (all strings without the flag); any other file its whole text. `--exclude` keeps paths out of the diff (the sources themselves). `--diff <file>` reads a saved `git diff -U0` instead of calling git. Exit 2 when the sources give no run of `--n` words. Short functional overlaps are expected: a person judges the list.

## gen-from-table.ts (from STCC and Imperium)

`--plan docs/PLAN.md --heading 'Rulings in effect' --out src/rulings.ts [--name RULINGS] [--check]`

Writes the first table under the first heading containing `--heading` (the first table of the file without it) as `export const RULINGS = [{...}, ...] as const`, or as JSON when `--out` ends in `.json`. Keys are the header cells in lower case with `_` for other characters; code ticks and bold stars are removed from cells; `\|` and a pipe inside a code span do not split a cell. A table with no rows, or two header cells with the same key, is exit 2. `--check` exits 1 when the file differs from what the plan says now (line endings ignored).

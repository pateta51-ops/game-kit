# tooling-scripts

Small repo scripts a game runs with `npx tsx kit/tooling-scripts/<script>.ts`. Each takes its paths and patterns as flags, or the same names in `--config <json>` (flags win; a repeatable flag is an array). Exit 0 clean, 1 findings, 2 usage or a failed read or write. Each also exports `run(args, io)` and its pure parts. No dependency beyond Node.

## art-check.ts (from Rome)

`--manifest <json> --sources <dir> --out <dir> --ext webp [--source-id '^(F\d{3})-.+\.png$'] [--need <json array of ids>]... [--max-bytes <n>] [--max-file-bytes <n>]`

The manifest is a record of id to `{ source, sha256, bytes, outSha256? }`: the source file name and its SHA-256, the output's size and (optional) SHA-256. An id's output is `<out>/<id>.<ext>`. Fails when no source matched, a source has no entry, a source changed, an output is missing or differs, an entry has no source, an id in a `--need` list has no output, or a file or the total is over its cap. Group 1 of `--source-id` is the id (default: the file name without its extension); files that do not match are ignored. It does not build the art and does not read pixel sizes.

## text-leak.ts (from Imperium)

`--base <commit> [--repo .] [--exclude <path>]... --source <file or dir>... [--json-keys printed,text] [--n 6]`

Lists the lines added since `--base` that share `--n` or more consecutive words with the private source texts, as `file:line: N words ~ source | "first five words ..."` (never more of the text). A `.json` source gives the strings under `--json-keys` at any depth (all strings without the flag); any other file its whole text. `--exclude` keeps paths out of the diff (the sources themselves). `--diff <file>` reads a saved `git diff -U0` instead of calling git. Exit 2 when the sources give no run of `--n` words. Short functional overlaps are expected: a person judges the list.

## gen-from-table.ts (from STCC and Imperium)

`--plan docs/PLAN.md --heading 'Rulings in effect' --out src/rulings.ts [--name RULINGS] [--check]`

Writes the first table under the first heading containing `--heading` (the first table of the file without it) as `export const RULINGS = [{...}, ...] as const`, or as JSON when `--out` ends in `.json`. Keys are the header cells in lower case with `_` for other characters; code ticks and bold stars are removed from cells; `\|` and a pipe inside a code span do not split a cell. A table with no rows, or two header cells with the same key, is exit 2. `--check` exits 1 when the file differs from what the plan says now (line endings ignored).

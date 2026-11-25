# art-pipeline
Game-free scripts that get a card game's art from its sources to `public/` with a manifest `tooling-scripts/art-check.ts` verifies. Everything game-specific (ids, URLs, paths, the order of preference) is in JSON config files; each script takes `--config <json>` (paths relative to that file), exits 0 clean, 1 findings, 2 usage or a failed read, and exports `run(args, io)`. Run with plain `node kit/art-pipeline/<script>.ts`.

## Rules for agents

<!-- hooks: written by scripts/catalog.mjs from docs/catalog-notes.json; do not edit -->
**Hooks a game calls:**
- `art-publish`: publish art with filename collision checks and recover interrupted replacement
<!-- /hooks -->

**What it does:** takes a card game's art from its sources to `public/` in steps (fetch, extract, render a PDF, index, publish, cache), each driven by a JSON config, with a manifest the art check verifies.

**You must:**
1. Run each script with plain node: `node kit/art-pipeline/<script>.ts --config <json>` (paths in the config are relative to the config file). Exit 0 is clean, 1 findings, 2 usage or a failed read: read the findings before going on.
2. Keep every game-specific value (ids, URLs, paths, the order of sources) in the config files; never edit the scripts or `kit/`.
3. Run the steps in order: `art-fetch` / `art-extract` / `art-render-pdf` leave pictures and a records file, `art-index` picks one picture per card from the records in the order given, `art-publish` copies them and writes the manifest, then run `node kit/tooling-scripts/art-check.ts` on it. Pass `--need-ids <json array>` from the game's required logical IDs; deriving that list from the generated manifest cannot detect an omitted face.
4. Install the optional packages yourself when you use them: `pdfjs-dist` and `@napi-rs/canvas` for `art-render-pdf`, `sharp` for any format but 8-bit PNG (name it in the config's `sharp`). The kit installs none of them.
5. `art-fetch` goes to the network: run it by hand as a manual step, never in a check or in CI; give it `gapMs` and a `userAgent`, and use `--refresh` only to ask again for remembered misses.
6. Use `art-index --strict` when every card must have art; read `missing` otherwise.
7. When faces are re-encoded to a lossy format, set `quality: { min }` and `maxFileBytes` in the publish config rather than relying on the codec's default; do not lower `min` to make a face fit, shrink the source or raise the cap.
8. Use `art-ci-cache` to key and restore the costly folders on CI; its key comes from the inputs' content.
9. Publish offline, with one writer per configured output set. Filename collisions, empty selections and inputs inside replaced outputs are refused, including filesystem symlink aliases. After an interrupted process, keep its `.publish-state.json` and sibling `.publish-backup`/`.publish-next` paths; once the writer has stopped, run `art-publish --config <same json> --recover` before retrying.

**Common mistakes:**
- A failed fetch item is reported and the run goes on: exit 1 still means something is missing.
- Cropping or converting a non-PNG without `sharp`: the built-in codec reads and writes 8-bit PNG only.
- Running the fetch in a check: it asks the network every time.

Pipeline: `art-fetch` / `art-extract` / `art-render-pdf` each leave pictures plus a records file `{ id: { file, ... } | { miss } }` (files relative to the art root); `art-index` picks one per card from the records in the game's order; `art-publish` copies the chosen pictures to public and writes the manifest; `art-ci-cache` saves and restores the costly folders on CI.

- `art-fetch.ts`: `{ cache, from?, userAgent?, gapMs?, timeoutMs? (600000), retries? (3, doubling `backoffMs` 1000), items: [{ id, source, url, name? }] }`. A URL is `http(s)://`, `file:` or a path under `from` (a local folder). Writes `<cache>/<source>/<name>.<ext>` and `<cache>/<source>.json` (url, sha256, bytes); a failed item is reported (exit 1) and the run goes on; the records file is rewritten atomically after each item; a cached file is hashed again and fetched anew when it differs from its sha256; skips files already there and remembered misses (`--refresh` asks again); at most one request per `gapMs`. Manual step, never in a check.
- `art-extract.ts`: `{ root, from?, source, ext?, sharp?, items: [{ id, from, box?: {x,y,w,h}, rect?: [cell, columns, rows], name? }] }`. A crop box, a cell of a deck sheet, or a whole conversion. The built-in codec reads and writes 8-bit PNG; other formats need the game's `sharp` (module name or path in `sharp`).
- `art-render-pdf.ts`: `{ root, from?, source, pdfjs?, dpi?: 300, format?: "png"|"jpeg", faces: [{ id, pdf, page, region? }] }`. The game installs `pdfjs-dist` and `@napi-rs/canvas`; `region` is in PDF points. 300 dpi of a 2.5 x 3.5 in page is 750 x 1050 px.
- `art-index.ts`: `{ root, ids, order: [{ name, records }], overrides?: { id: source }, never?: { source: [ids] }, degradedMaxSide?, degradedRatio?, out? }`. The first source in `order` with an existing file wins; `overrides` forces a source for a card, `never` forbids one, and a face whose shorter side is under `degradedMaxSide` loses to a later face `degradedRatio` (1.5) times as large. Writes `{ defs, sources, missing, counts }`; `--strict` exits 1 when a card has none.
- `art-publish.ts`: `{ index, root, stage, out, manifest, ext, sharp? }`. Stages each chosen source as `<stage>/<name>.<ext>`, writes `<out>/<name>.<ext>` and the manifest (`source`, `sha256`, `bytes`, `outSha256`, `id`, size); `name` is the id with unsafe characters turned into `_`. Distinct IDs whose names collide (also ignoring case) fail before replacing prior artifacts; existing noncolliding filenames are unchanged. Then `node kit/tooling-scripts/art-check.ts --manifest <manifest> --sources <stage> --out <out> --ext <ext> --need-ids <required logical ids.json>`.
- Quality (publish): `quality: { min, max? }` (or per face `faces: { <id>: { quality, maxFileBytes } }`) with `maxFileBytes` makes a converted face (its source is not already `ext`) encode at the highest JPEG/WebP quality from `max` (100) down to `min` whose output fits the cap; a face that does not fit at `min` fails the run (exit 2) with `<id>: <bytes> bytes at quality <min> is over the cap of <cap> bytes`. Without `quality` a face is encoded as before. The manifest also records `sourceWidth`/`sourceHeight` for `art-check`'s enlarged rule (on by default; entries without sizes are skipped; `--allow-enlarged` turns it off).
- `art-ci-cache.ts key|restore|save`: `{ cache, inputs: [files or folders], paths: [folders to keep], extra?, version? }`. The key is the SHA-256 of every input's path and content; `restore` on a hit copies `<cache>/<key>/` back (`--require`: a miss exits 1); `save` writes a new key folder atomically.

## Recipe: re-encode at quality 90 or more within a cap
The publish config (a test reads and runs this block):
```json recipe-quality
{ "index": "index.json", "root": "art", "stage": "chosen", "out": "public/art", "manifest": "public/art-manifest.json", "ext": "jpg", "sharp": "sharp", "quality": { "min": 90 }, "maxFileBytes": 200000 }
```
Then `node kit/tooling-scripts/art-check.ts --manifest public/art-manifest.json --sources chosen --out public/art --ext jpg --need-ids required-ids.json --max-file-bytes 200000` (also fails a face larger in pixels than its source). `required-ids.json` is the game's selected logical IDs, for example `["a:b", "c"]`, authored independently of the output filenames.

## Publication failure and recovery

All pictures and the manifest are prepared in sibling `.publish-next` paths before replacement. Missing/unreadable sources, encoder failures and byte/quality failures leave the previous release intact. Replacement renames existing targets to `.publish-backup` first; a caught commit failure restores those backups. Obsolete generated files disappear only with a successful replacement. Source pictures are never moved or removed.

The stage and output directories must be distinct and cannot contain one another. The manifest may be inside either directory or separate. Config/index/source inputs cannot be inside paths that publication replaces. These checks resolve filesystem symlinks, including existing ancestors of paths not yet created; separate symlinked inputs and output parents remain supported. Targets and scratch paths cannot overlap the recovery marker or its `.tmp` path, either by spelling or by resolved location. An existing scratch file without a marker is refused for manual inspection rather than overwritten. Keep the same config path, output paths and symlink destinations for recovery.

The `.publish-state.json` beside the config records preparation, replacement or committed cleanup. If a process stops during preparation/replacement, `node kit/art-pipeline/art-publish.ts --config publish.json --recover` restores the old set (or removes newly installed targets that did not previously exist). After a fully committed replacement it finishes cleanup and retains the new set. A failed rollback keeps its marker and remaining backups for another recovery attempt. Do not delete these files by hand. Renames are within each target's filesystem; the separate targets are not one atomic transaction, so publication must not race a running consumer. This recovery covers process interruption and reported filesystem errors, not storage-device failure or power-loss durability.

## Use it in 10 lines
```ts
import { buildArtIndex } from '../kit/art-pipeline/art-index.ts';
import { cellBox } from '../kit/art-pipeline/lib.ts';

// the card's picture comes from the first source that has one; a sheet cell is a box of the sheet
const sizes: Record<string, [number, number]> = { 'web/a.png': [750, 1050], 'scan/a.png': [200, 280] };
const order = [{ name: 'web', records: { a: { file: 'web/a.png' } } }, { name: 'scan', records: { a: { file: 'scan/a.png' }, b: { file: 'scan/b.png' } } }];
const index = buildArtIndex(['a', 'b'], order, { never: { scan: ['b'] } }, (f) => sizes[f] ?? null);
const box = cellBox(4000, 2000, [5, 4, 2]);
void [index.defs, index.missing, box];
// the rest is run from config: node kit/art-pipeline/art-fetch.ts --config art/fetch.json
```

`pdfjs-dist`, `@napi-rs/canvas` and `sharp` are optional packages the game installs (they are listed in `component.json` `packages` the way `tooling-scripts` lists `esbuild`); the kit does not install them. Kit CI covers the PDF path only through the injected renderer (`run(args, io, render)`), and the real pdf.js test is skipped when the packages are absent. `imageSize` reads PNG, JPEG and WebP headers.

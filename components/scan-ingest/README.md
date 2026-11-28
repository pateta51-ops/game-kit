# scan-ingest

Flatbed scans of a game's components to one upright, tightly cropped image per item, plus a review overlay and a
manifest per scan. Python package `scanpipe`: detection (white lid, black or coloured backing), touching split,
deskew and crop, cut-out by colour on a magenta backing (rim, edge unmixing, the shadow a thick piece or a card
casts), scanner tone curve, flags and exit status. It stops at crops and a manifest: the game turns them into its
content pack. Real scans never enter the kit; the tests draw their own sheets.

## Rules for agents

<!-- hooks: written by scripts/catalog.mjs from docs/catalog-notes.json; do not edit -->
**Hooks a game calls:**
- `loadGeometry`: load scan board geometry, retry a failed attempt and cache successful measurements
<!-- /hooks -->

**What it does:** turns flatbed scans of a game's components into one upright, cropped image per item with a review overlay and a manifest (Python `scanpipe`), and, in TypeScript, draws live state on a printed board scan.

**You must:**
1. Install in a venv with Python 3.11+: `pip install -r kit/scan-ingest/requirements.txt`; run from the game's checkout with `PYTHONPATH=kit/scan-ingest python -m scanpipe scan --plugin module:Class --project . <scans>`.
2. Keep the game's knowledge in a `scanpipe.plugins.base.Plugin` subclass in the game's own repository (item sizes, kinds, hooks); the kit has no game names. Test it with `assert problems(MyGame()) == []` (`scanpipe.plugins.contract`).
3. Read the exit status: 1 means an item needs a look (a flag that is not informational, a rejected region, a plug-in problem). Open the review overlay and the manifest before using a crop.
4. Scan the way the plug-in expects (white lid with a black or coloured backing, or magenta for cut-outs); two items that touch go through `scripts/split_touching.py`, run with `python -I`, not a re-scan.
5. Run `python -m scanpipe rescan REVIEW_DIR` to list items worth scanning again; scan again under the same `--name` only with `rescans = True` in the plug-in.
6. Real scans never enter the kit (its tests draw their own sheets); keep the game's plug-in and tools in the game, outside `kit/`.
7. For printed boards (`index.ts`, `ui.ts`) pass the game's scan, box list and state: `ScanBoard` draws the scan and calls `render(id, sizePx)` in each box; frames and colours stay in the game.
8. Tesseract is optional and only for reading print; without it callers get None and one warning.
9. A kind that comes both plain and die-cut in one size: put it in both `cast_kinds` and `silhouette_kinds` (the fit is then skipped on notched and tabbed items, unknown sizes included, `castSkipped` in the manifest), or override `cast_for`; never fit a die-cut card. Such a skipped item has its band taken off its straight sides (`cast_skip_mode = "sides"`, the default; `None` keeps the plain cut); read `cast.removedMm` in the manifest, and `cast.sides` (per side `bandPct` and the `reason` it was or was not trimmed, K793) before changing a threshold.
10. Treat `loadGeometry` returning `null` as an unsuccessful attempt: keep fallback geometry and call again when the image is available. Concurrent calls share one attempt; only successful geometry is cached. A failed optional store read falls back to decoding, and a failed store write leaves decoded geometry usable. Change the key when the scan or its asks change.
11. To say which card a crop shows, give the plug-in `identify_refs` (the game's built card images) or run `python -m scanpipe identify CROPS --refs REFS`; trust `identity.card` only when `held` is empty (the item is flagged otherwise; the CLI exits 1).
12. Trace a map's zone rects with `scripts/trace_zones.py` (marker colours, names and hand rects from the game's config) and merge the JSON with board-layout's `withZones` at content build; never hand-copy rects into code. Pass `--name` so a missed or extra blob exits 1.
13. For a thick piece that came out wrong, read `thickCuts` and `thickPlainMm` in the manifest before changing a size or a mode: they show which cut was nearest and why it was refused.

**Common mistakes:**
- A `--plugin` class that is not a `Plugin` subclass: refused.
- Passing an odd number of scans with `pair_backs = True`: refused (front, back, front, back).
- Treating a `held-` crop as the new crop: a re-scan with a flag that asks for a look replaces nothing.
- Running `split_touching.py` without `python -I` from a folder holding scans.

## Setup

Python 3.11 or later. `pip install -r kit/scan-ingest/requirements.txt` (in a venv). Tesseract is optional, only for
a plug-in that reads print.

## How a game calls it

From the game's checkout, with the component on the path:

    PYTHONPATH=kit/scan-ingest python -m scanpipe scan --plugin tools.ingest.plugin:MyGame --project . scans/*.tif
        [--name b001-s01-a ...] [--turn 0|90|180|270|auto ...] [--dpi 600] [--tone none] [--review DIR] [--out DIR]

`--plugin module:Class` is imported from where the command runs. Exit status 1 when an item needs a look (a flag
that is not informational, a rejected region, a problem the plug-in reports).

## The plug-in

A subclass of `scanpipe.plugins.base.Plugin`, kept in the game's repository:

- data: `item_sizes_mm` (kind: short, long), `shaped_kinds`, `thick_kinds`, `printed_edge_kinds`, `cast_kinds`,
  `corner_radius_mm`, `card_kind`, `size_tolerance`, `out_dpi`, `jpeg_quality`;
- hooks: `classify(w_mm, h_mm)`, `orient(crop, kind) -> Orientation(turn, confident, why)`, `default_out(project)`,
  `file_for(out_dir, name, ext)`, `cast_for(kind, silhouette, crop)`, `preflight(project, names, scans)`, `finish(project, out_dir, manifests)`.

A `thick_kinds` item (K792) is cut twice: by the colour rule (backing-hued or grey dark pixels, or in
`printed_edge_kinds` the red ramp and the near-black cut side) and with the shadow taken as the backing darkened (BGR
within 8 degrees of the backing's: a black, red or coloured piece is not). The cut nearest the kind's size wins, in
printed_edge mode a one-sided one first; the manifest's `thickCut` (`colour` or `tinted`) says which. A piece darker
than the sheet and of its hue is taken for shadow by both: its plain cut is kept and flagged `UNKNOWN_SIZE`.
K794: each cut is also tried without a mark lighter than the backing that touches the piece and is under a quarter of
it (`+dropLight` in `thickCut`; never a cut smaller than the kind), and in printed_edge mode a wide shadow may take more
than a fifth of the plain cut: the pixel share beyond the kind's size, at most 0.2 more, and only when what is removed
is mostly the backing darkened. The manifest records every candidate (`thickCuts`: mode, cut, size, kind,
one-sidedness, plausible) and the plain cut's size (`thickPlainMm`).

`tests/fake_game.py` is a small example. `--plugin` refuses a class that is not a `Plugin` subclass, and reports an
error in its constructor as one line. A game checks its own plug-in in a test:

    from scanpipe.plugins.contract import problems
    assert problems(MyGame()) == []

## Reading print (optional)

`scanpipe.tess` finds and runs Tesseract (`TESSERACT_CMD`, then the PATH, then the Windows install folders); without
it every caller gets None and one warning. `scanpipe.orient` has what any game's `orient` hook can use:
`osd_rotation(crop)` (Tesseract's turn of a whole face, with its confidence), `ROTATIONS` and `page_flip` (the other
face's turn when an item is flipped like a page). Reading a game's printed codes or back designs stays in the game.

## Sleeved cards and die-cut silhouettes (optional, off by default)

- `unsleeve = True`: on a light backing, a region the size of a clear sleeve around the card (`card_kind`) is cut to
  the card inside it (`scanpipe/sleeves.py`), with flag `SLEEVE_TRIMMED`. A sleeve is at least
  `sleeve_min_short_mm` wide or `sleeve_plain_long_mm` (lo, hi) long; left None, they follow the card's size.
- `silhouette_kinds`: the die-cut outline of these kinds is read (`scanpipe/silhouette.py`) and recorded as the item's
  `silhouette` (shape notched / tabbed / plain / round / irregular, notch and tab, face, rotate, confidence,
  variant). When the plug-in's `orient` is not confident and the silhouette is (high or medium), its turn is used.
  `silhouette_spec` overrides `silhouette.DEFAULT_SPEC`: canonical notch and tab sides, `notchCentre`, `bevel`,
  `notchVariants`, and `names` (the game's word for each shape).
- A kind in both `cast_kinds` and `silhouette_kinds` (K789) has its silhouette read on the plain cut first (shadow
  and all), and skips the cast-shadow fit when that shape is notched or tabbed: the fit's rounded rectangle would fill
  a notch with backing. Plain, round, irregular and unknown shapes keep the fit. A skipped fit keeps the plain cut and
  its silhouette (flags included) and is recorded as the item's `castSkipped` (the reason); a fitted crop has its
  silhouette read again. Hook `cast_for(kind, silhouette, crop) -> bool` decides instead: called for each cast kind
  tried (every one for an item of unknown size), `silhouette` None for a kind not in `silhouette_kinds`.
- K791, cast mode "sides" (`cast_skip_mode = "sides"`, the default): where the fit is skipped on a notched or tabbed
  item, the dark red band it casts is taken off its straight sides only (`cast.trim_sides`). Each side is a line
  fitted to its outer edge pixels, leaving out the notch's and the tab's rows and the tab's columns (from the
  silhouette's extents). A side is trimmed when its outer 0.5 mm is more than 12 % dark red (r-g > 45, r-b > 15,
  r < 190), its dark red run is at least 0.25 mm wider than the opposite side's (a cast shadow falls away from the
  lamp; a printed dark red rim is on every side, so only the difference is taken), and the crop is larger than the
  kind's size on that axis by half that width or more; the alpha is then cleared that wide inside the line. The owner's
  measure (`cast.side_bands`, outer 0.5 mm over 12 % and 0.5-1.5 mm in under 5 %) is reported per side. The tab's
  columns and the notch keep their outline as the plain cut read it (the band inside a notch and above a tab stays).
  After a trim the silhouette is read again on the final crop (notchSpan, tabX, the turn). The manifest records
  `cast: {mode: "sides", removedMm: {top, right, bottom, left}}` beside `castSkipped`. It is the default because it
  changes a crop only where the band is found, and only on die-cut items that had no clean-up at all;
  `cast_skip_mode = None` keeps the plain cut as before K791. Plain cards keep the fit, unchanged.
- K793: the notch's rows are left out of the notched side only. A band standing out of a side's line on a tenth of its
  rows or more (beside a notch or a tab) is measured on those rows, against its own line (`part`). A side whose dark
  red run reaches 1.5 mm is print and is never trimmed. A side the width rule refuses is trimmed by its soft run when
  that is `SOFT_MIN_PX` (5) or more and the opposite side's is not (a shadow falls one way; a printed gradient is on
  every side): the soft run is the leading 2 px means each `SOFT_STEP` (B+G+R) and `SOFT_CH` per channel darker one
  pixel in, read on the scan's own pixels before the cut-out repaints the edge. The size rule takes the plug-in's
  `cast_size_tol_mm` off its margin (the crop larger than the kind's size by half the band, less the tolerance).
  `cast.sides` records per side `bandPct`, `runPx`, `oppositePx`, `softPx`, `part` and `reason`.

## Backs, descreen, re-scans and pack entries (optional, off by default)

- `pair_backs = True`: the scans are given as front, back, front, back... (an odd count is refused). A back scan has
  every item flipped in place like a page; its items are matched to the front's by centre, then by size for one
  that moved (`scanpipe/pairs.py`), and their crops renamed to the front's name plus `back_suffix` (default `-b`).
  The front item records `back` and `pairDistancePx`, the back item `pairOf`; flags `PAIRED_FAR`, `NO_BACK_FOUND`,
  `A_B_SIZE_MISMATCH`, `NO_FRONT_MATCH`. `--name` and `--turn` go to the fronts only.
- `descreen_mm` (e.g. 0.05): the crops are blurred by a Gaussian of this sigma before downscaling, which removes the
  print's halftone dots (`images.descreen`); the manifest records `descreenMm`.
- `rescans = True`: scanning an item again under the same `--name` replaces its earlier crop: the earlier manifest's
  item gets `replacedBy`, the new one `replaces` (`scanpipe/rescan.py`). A re-scan with a flag that asks for a look
  replaces nothing: it is written as `<name>.held-<scan>` with `heldFor`, and the earlier crop stays. Crops are written
  to `<out>/.staging` and moved only after `write_entries`, so an error there leaves the earlier crops in place.
  One run may scan a name twice: the later scan replaces (or is held for) the earlier one the same way.
  Without `rescans`, a back crop never overwrites one of another run (flag `BACK_NAME_TAKEN`, it keeps its own name).
  `python -m scanpipe rescan REVIEW_DIR
  [--write RESCAN.md]` lists the items still worth scanning again (off the glass, or a flag that asks for a look),
  by sheet and row and column; exit status 1 when there is one.
- Hooks `entry(item, back, manifest) -> dict | None` and `write_entries(project, out_dir, entries) -> problems`: the
  game turns each crop (with its paired back) into its content-pack entry, and writes them after the run. With
  `rescans` every item no re-scan replaced is passed, otherwise the run's items.

## Which card a crop shows (optional, off by default, K784)

`scanpipe/identify.py` matches each face on its own against the game's built card images: a perceptual hash
(16 x 16, on a 512 px thumbnail over grey 128) at the 4 quarter turns against every reference face and generic back,
then SIFT (3000 features, grey, long side 900 px, equalised) with a RANSAC homography (6 px) on the 10 nearest by
hash of each kind (fronts, own backs, generic backs); SIFT features of the references are kept for the last `cache`
(64); the score is the inlier count. The numbers are `identify.PARAMS`; a plug-in changes them with `identify_params`.

- `Refs(fronts, backs=None, generic=None, back_map=None, family=None, variants=None, params=None)`: fronts and own
  backs by card id, generic back designs by design id (dicts of images or files, a folder, or a list; id = file
  stem; two files with one id are refused), `back_map` card -> design, `family` card -> key (die-cuts of one card), `variants` card -> silhouette variant.
- `identify(crop, refs, item=None)`: `ref`, `face` (front, back or generic), `turn` (clockwise, to read like it),
  `inliers`, `runnerUp`, `runnerUpInliers`, `confidence`, `generic` (nearest design by hash, bits, margin),
  `ambiguous` and `held` (why). Identified: at least 120 inliers and 1.4 times the next best; the next best skips
  the same family's other die-cuts, and a generic back after a generic back. Cards sharing art (a family with
  `variants`) take the variant from the item's silhouette, only after a confident match; none confident: held,
  `variantUnread`.
- `check_pair(front_crop, back_crop, refs, items)`: one face confidently card X, the other must fit X's other face:
  its own image by at least 40 inliers (measured on demand), or its generic design, the nearest back by hash by 4
  bits or clearly picked by SIFT (40 inliers and 1.4 times any other design). `matches` True, False (the faces
  disagree, or show two cards) or None (nothing identified, no other face known), `held`, `total` inliers.
- `dedupe(manifests)`: the same card in two items of a run keeps the one with more front inliers (both faces' inliers
  break a tie); the other is held. Items a re-scan replaced or holds are left out (it runs after the re-scan plan).
- Plug-in: `identify_refs` (None: off), `identify_back_refs`, `identify_generic_backs`, `back_map`, `identify_family`,
  `identify_variants`, `identify_params`. Each item records `identity` (with `pair_backs`, the front holds the pair
  check and the back its own face). Items cut off at the scan's edge or under half the smallest kind's area are
  not matched (`skipped`). Flags: `IDENTITY_AMBIGUOUS`, `VARIANT_UNREAD`, `BACK_IDENTITY_MISMATCH` (on the front),
  `IDENTITY_DUPLICATE`.
- `python -m scanpipe identify CROPS... --refs FRONTS... [--backs ...] [--generic ...] [--min-inliers 120]
  [--json OUT]`: one line per crop; exit status 1 when one is ambiguous.

## Two items scanned touching

    python -I kit/scan-ingest/scripts/split_touching.py SCAN OUT_A OUT_B h|v x0 y0 x1 y1
    python -I kit/scan-ingest/scripts/split_touching.py SCAN OUT_A OUT_B point x y

Splits a magenta scan along the backing gap between two items (or takes one token out), so no re-scan is needed;
then run `scanpipe` on both files.

## Tracing icons, emblems, logos and map regions to SVG (optional)

`scanpipe/vector.py`, run as `scripts/vtrace.py` (adds `potracer` and `pymupdf` to requirements). No game names,
colours, icon lists or paths: a game passes them as arguments from its own config.

    python kit/scan-ingest/scripts/vtrace.py trace CROP.png... --out OUT_DIR|OUT.svg
        [--box x0,y0,x1,y1] [--mode threshold|quantise] [--level N] [--invert] [-k 4] [--colours "#111,#c33"]
        [--fill "#231f20"] [--upscale 4] [--blur 0.5] [--min-area 0.002] [--drop-border] [--keep-light] [--no-trim]
        [--sym 4m --centre x,y] [--engine vtracer --speckle 8 --color-precision 6 --layer-difference 12] [--tolerance 0.25] [--alphamax 1.0] [--turdsize 4] [--precision 2]
    python kit/scan-ingest/scripts/vtrace.py retrace A.svg... --out DIR|OUT.svg --tolerance 2 [--res 8]
    python kit/scan-ingest/scripts/vtrace.py proof CROP_DIR SVG_DIR --out proof.png [--cell 256] [--report fid.json]
    python kit/scan-ingest/scripts/vtrace.py bw SCAN.png|BOOK.pdf --out DIR [--level N] [--dpi 300] [--pages 3 4]

- `trace`: crop, Lanczos upscale, optional blur, then a dark-ink mask (Otsu or `--level`) or k-means colours (one
  stacked layer per colour, the paper-white one dropped), specks and edge shapes cleaned, potrace curves, an even-odd
  path per layer. The viewBox is trimmed to the shape unless `--no-trim`. `--sym N` / `Nm` averages the ink over N
  rotations (and mirrors) about the centre first, to fill what print hides. `--engine vtracer` (adds `vtracer`) is a
  colour trace that keeps subtle gradients; k-means plus potrace flattens them.
- `retrace`: rasterises each fill colour of an existing SVG alone and traces it again at the new tolerance; layer
  order, colours and viewBox stay; a higher `--tolerance` gives fewer points.
- `proof`: a sheet with every source crop beside its rendered SVG, and with `--report` each pair's mean difference
  and ink IoU. A trace made by `trace` carries `data-offset` (where its trimmed viewBox sits in the crop), so trimmed
  or not it is compared in place; an SVG from elsewhere is stretched to the crop.
- `bw`: every pixel 0 or 255, for an image or each PDF page; a `source.sha256` stamp skips a current render.

In Python: `from scanpipe import vector as v` (`trace_array`, `retrace_svg`, `render_svg`, `fidelity`,
`proof_sheet`, `render_bw`, `symmetrise`).

## Printed boards with live state (TypeScript, K373)

`index.ts` (pure) and `ui.ts` (React). A game passes its scan, its box list and its state; no game's frames or colours
are here (sources in component.json).

- `measure.ts`: pixel tests (`hsv`, `hueTest`, `nearTest`), `findBlobs` (isolated solid boxes of one colour: integral
  image, ring test, grow), `measureBoxes(w, h, rgba, specs)` for a list of `BoxSpec` (id, test, region, size, ratio,
  usual place), `findRows` (colour rows in an asked order, or null), `firstRun`, `rowFraction`, `measureRgba`, and
  `loadGeometry(url, key, asks, store?)` (concurrent calls share one canvas decode; successful geometry is cached per key and an optional store keeps it across reloads; `null` is not retained, so a later call retries).
- `board.ts`: `planOverlay(list, geometry)` (found boxes covered by 4 %, the usual places before measuring, the boxes
  the scan lacks in `missing` so the game draws its own face), `toScreen`, `normalise`, `boxStyle`, `pointStyle`,
  `boxWithin`, `trackPoint`; die-cut pieces: `clipPathOf`, `trimOutline`, `mmOf`, `mmStyle`, `boardMm`, `skewOf` and
  `uprightStyle` (a tilted sheet stood upright), `uniformOutlines` (one typical outline per die-cut shape).
- `ScanBoard` draws the scan `width` px wide and puts `render(id, sizePx)` in each box (`data-scan-box`); `boardMm` sets
  `--mm` (px per mm) so a `Piece` inside is drawn at its true size, cut to its outline. Style `data-part="scan-board"`,
  `scan-piece`. The finite supply of pieces is in token-bag (`supply.ts`).
- Left in the games: card frames and box colours, the zoom views and pile volume. Sleeve inserts (inserts under a
  die-cut host, their tabs, the notch) are card-attachments `SleeveStack` (K721), built on `clipPathOf` and `boxStyle`.

## Playmats, tone profile (Python, K373)

- `scanpipe/playmats.py`: `check(mats)` (spaces running off the image, ids twice), `shape_problem(mat, w, h)` (the
  image is not the shape the spaces were measured on), `find_image(folder, name)`; `detect_boxes(ink, size)` finds the
  printed spaces as ground enclosed by ink (`ink_by_ground` samples the ground), `rows(boxes)` groups them, and
  `fit_track(points, numbers, n)` fills a numbered (zigzag) track's hidden spots by a line.
  `detect_boxes(ink, size, bars=(across, down, thick), edge=True)` (K433) finds spaces from bars on LCARS-style mats: open-sided
  panels between thick bars, labels in bar gaps, panels running to the edge (`edge`: the image border counts as ink;
  also usable on boxed mats); STCC's 24x14 in LCARS mats (7350 px wide): `size=(0.08, 1), ratio=(0.2, 6),
  bars=(0.02, 0.006, 0.004)` finds all 8 Captain and 9 Market panels. Boxed mats keep `close` (e.g. 6 for cards, 2 for wide areas).
- `scanpipe/tone.py`: `profile(img)` (black point, median, white point per channel), `fit(flats, references, name)`
  (a non-decreasing per-channel curve from items scanned both ways), `save`, `apply_curve`, `delta_e`.
- Outline tracing: `silhouette.outline_of(mask)` (above).

## Zone rects of a map or board scan (Python, K427)

`scanpipe/zones.py`, run as `scripts/trace_zones.py`: the scan's zones as board-layout's `ZoneLayout` JSON,
`{ "w", "h", "zones": { id: { "r": [x, y, w, h] } } }` (top-left corner, width, height). No game names, colours or
paths: a game passes them as flags or in a `--config` JSON (keys `colours`, `names`, `zones`, `tol`, `min_area`,
`prefix`, `size`, `close`; flags win).

    python -I kit/scan-ingest/scripts/trace_zones.py SCAN --out OUT.json [--config cfg.json]
        [--colour "#dc1e1e"]... [--name id]... [--tol 40] [--min-area 0.0005] [--prefix zone] [--size 1 1] [--close 5] [--overlay O.png]

- Marker blobs: each pixel within `tol` (per channel) of a `colours` entry; blobs under `min_area` of the scan
  dropped; bounding rects in reading order (rows top to bottom, then left to right), named by `names` in that order
  (a different count exits 1 and writes nothing), else `prefix1..N`.
- Each pixel goes to its nearest listed colour only; gaps up to `close` px inside a marker (a printed label, a JPEG
  fringe) are closed first (default 5, 0 off). Rows group by the running mean of their centres, so a skewed scan
  keeps its order.
- Hand rects: `zones` in the config, `[x, y, w, h]` or `{ "c": [cx, cy], "s": [w, h] }` (`[w]` for a square; corner
  `cx - w // 2`) in scan px, win over a found blob of the same id; with no `colours`, `names` is not checked. A rect
  off the scan exits 1; a bad config, colour or hand rect prints one line and exits 2, as does a scan it cannot read.
- `size W H` rescales to the game's units (`1 1`: fractions of the scan, 4 decimals); default scan px. `--overlay`
  draws the rects and ids on the scan for a look.
- At content build the game merges the file with board-layout's `withZones`:

      const t = JSON.parse(text) as ZoneLayout;
      const L = withZones(base, Object.fromEntries(Object.entries(t.zones).map(([k, z]) => [k, z.r])));

In Python: `from scanpipe import zones` (`find`, `trace`, `layout`, `overlay`, `main`).

## Tests

    cd components/scan-ingest && OMP_THREAD_LIMIT=1 python -m pytest tests -q

Run by the kit CI (job `pytest scan-ingest`, in a venv), about 2 minutes. The OCR tests skip when Tesseract is absent.

## Use it in 10 lines

```sh
PYTHONPATH=kit/scan-ingest python -m scanpipe scan --plugin tools.ingest.plugin:MyGame --project . scans/*.tif
```

```ts
import { hueTest, planOverlay, type BoxSpec, type Geometry } from '../kit/scan-ingest/index'

const specs: BoxSpec[] = [{ id: 'score', test: hueTest([340, 20], [0.45, 1]), region: { x: 0.5, y: 0, w: 0.5, h: 0.3 }, size: [0.06, 0.14], usual: { x: 0.8, y: 0.1, w: 0.1, h: 0.1 } }]
export const plan = (g: Geometry | null | undefined) => planOverlay(specs, g) // boxes to draw, and the ones the scan lacks
```

```tsx
import { ScanBoard, type Box } from '../kit/scan-ingest/ui'

export const Board = ({ score, boxes }: { score: number; boxes: Record<string, Box> }) => (
  <ScanBoard src="/board.webp" scanW={2400} scanH={1600} width={1200} boardMm={600} boxes={boxes} render={(id) => (id === 'score' ? <b>{score}</b> : null)} />
)
```

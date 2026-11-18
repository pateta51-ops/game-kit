# scan-ingest

Flatbed scans of a game's components to one upright, tightly cropped image per item, plus a review overlay and a
manifest per scan. Python package `scanpipe`: detection (white lid, black or coloured backing), touching split,
deskew and crop, cut-out by colour on a magenta backing (rim, edge unmixing, the shadow a thick piece or a card
casts), scanner tone curve, flags and exit status. It stops at crops and a manifest: the game turns them into its
content pack. Real scans never enter the kit; the tests draw their own sheets.

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
  `file_for(out_dir, name, ext)`, `preflight(project, names, scans)`, `finish(project, out_dir, manifests)`.

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
  Without `rescans`, a back crop never overwrites one of another run (flag `BACK_NAME_TAKEN`, it keeps its own name).
  `python -m scanpipe rescan REVIEW_DIR
  [--write RESCAN.md]` lists the items still worth scanning again (off the glass, or a flag that asks for a look),
  by sheet and row and column; exit status 1 when there is one.
- Hooks `entry(item, back, manifest) -> dict | None` and `write_entries(project, out_dir, entries) -> problems`: the
  game turns each crop (with its paired back) into its content-pack entry, and writes them after the run. With
  `rescans` every item no re-scan replaced is passed, otherwise the run's items.

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

## Tests

    cd components/scan-ingest && OMP_THREAD_LIMIT=1 python -m pytest tests -q

Run by the kit CI (job `pytest scan-ingest`, in a venv), about 2 minutes. The OCR tests skip when Tesseract is absent.

## Use it in 10 lines

```sh
PYTHONPATH=kit/scan-ingest python -m scanpipe scan --plugin tools.ingest.plugin:MyGame --project . scans/*.tif
```

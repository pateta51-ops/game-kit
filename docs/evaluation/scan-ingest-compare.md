# K164 scan-ingest: scanning-pipeline against the two games' ingest

Read 15 Nov 2026. Games read at origin/main. Sizes are lines/bytes counted on those files.
Last changes: scanning-pipeline 16 Oct (`9ec2378`); Unstoppable tools/ingest scan code 14 Oct (`38bb97c`, `a5c0a38`, D-162; detect.py last 7 Oct `0fda06a`); Imperium scan code 14 Oct (`5abd5d2`, D-183), later ingest commits to 18 Oct (`05f841a`) are pack/PDF/commons sets, not scanning.

## 1. Is scanning-pipeline up to date?

Mostly yes for scanning, no for Unstoppable's sleeves, and it is not a replacement for either game's whole ingest.

Imperium: scanning-pipeline is a superset of imp_ingest detect.py/images.py (nothing defined in the game's detect.py is missing; scanpipe adds `coloured_backing`, `faint_cue`, `rotate_any`, `flatten`, `resize_to_dpi`, key.py, cast.py, tone.py). Imperium's own D-183 (`5abd5d2`, 14 Oct) already moved its scans to scanpipe; `imp_ingest scan` stays as the white-lid fallback.

Unstoppable does not use scanpipe (no reference to it). Its key.py/tone.py are the older magenta cut-out that scanpipe ported on 14 Oct and then improved (decontaminate, one_sided, plausible_shadow, cast shadow geometry). So scanpipe is ahead on cut-out. Unstoppable has no scanpipe plug-in (only `imperium` and `under_falling_skies`).

Game has, scanpipe lacks:
- Clear-sleeve detection: `unsleeve`, `_card_in_sleeve`, `sleeve_sized`, `_component_at` in ufp_ingest/detect.py (`4b5a820`, `3d1b8ef`, 7 Oct); test_sleeves.py (10.8 KB).
- Die-cut silhouette reader: silhouette.py (18 KB), tests test_silhouette*.py, `0fda06a` tokens taken whole (scanpipe has test_tokens, partly covers).
- Perceptual hash / pairing of a card moved when flipped (images.py phash, `0f884f0`), re-scan bookkeeping (rescan.py, `f7a7a3e`, `864206c`; Imperium rescan.py too), progress/ledger, share zips, descreen (images.descreen, key.descreen_bgra; tests test_descreen.py), WebP save, `load_crop` with alpha.
- Imperium: orient.py (OCR reading of codes/upright, tests test_orient.py), tess.py, split_touching.py script and test, PDF import (pdf.py), TTS import, test_detect_edge_cases.py, pinned requirements (`bda0788`, CNT-15). scanpipe's imperium plug-in runs Tesseract itself (OMP_THREAD_LIMIT fix, `4cbdb9f`).
- Tests with no scanpipe counterpart: detect edge cases, sleeves, descreen, split_touching, rescan, pairing, pipeline end-to-end on synth cards.

scanpipe has, games lack: cast.py (card cast-shadow fit, 35 KB), key.decontaminate edge unmixing, Bot State chart kind, black-backing support, `--dpi` per face, flags/exit status, manifest tone, review overlay with exit rules, CI on self-hosted runner.

## 2. Game-independent core vs game-specific

Core (identical in all three, from the same ancestor):
- Scan reading and DPI (images.py, detect.load), background model, card/item detection, touching split, size matching (detect.py 1159 lines, 57 KB).
- Deskew, crop, perspective warp (detect/pipeline.py).
- Edge and colour cleanup: key.py (31 KB) magenta cut-out, rim, decontaminate; cast.py shadow geometry; tone.py + tones/*.json (Canon TR4700 curve, scanner-specific, not game-specific).
- Descreen and perceptual hashing (games only, images.py).
- Naming by slot, review overlays/manifest, flags (review.py, flags.py, pipeline.py).
- CLI (`__main__.py`).
- OCR orientation helper (Tesseract call) in the Imperium plug-in and imp_ingest orient.py/tess.py: generic mechanism, game-specific words.

Game-specific:
- Plug-ins: item sizes, shaped/thick/cast kinds, orientation rules, output folder, preflight/finish (plugins/imperium.py 21 KB, under_falling_skies.py).
- Schemas (pack, transcript, text, bot, playmats), expected_counts.json, describe/validate/build/audit/commons_sets/codes/scope/rulebook/tts/pdf, Unstoppable DSL, story, playmats, cutouts, ledger. All of this builds the content pack and belongs in the game, not the kit.
- Counts and sizes (Bot State 80.4 x 120.7, market board 3 parts, etc.).

Note: "pack output" is not in scanpipe; it stops at crops plus a manifest. Games turn that into a pack.

## 3. Suggested layout

components/scan-ingest/
- component.json: source scanning-pipeline @ `9ec2378` (plus the Unstoppable sleeve code, source named), needs: none.
- scanpipe/ (rename `scan_ingest`): detect, key, cast, tone, images, review, flags, pipeline, __main__, tones/, plugins/base.py.
- plugins: the kit has only `base.py` and a fake plug-in used in tests. Each game keeps its plug-in in its own repo (`tools/ingest/plugin.py` or a data file) and passes `--plugin module:Class` (small CLI addition; today plug-ins are a registry inside the package, which names games, so `imperium.py` and `under_falling_skies.py` must leave the component).
- Optional data plug-in: a JSON/YAML with item_sizes_mm, kinds, cast/thick lists, so simple games need no Python.
- Hooks games fill: `classify`, `orient`, `file_for`, `preflight`, `finish`. Games' pairing, pack build, validate stay in the game.
- Later: sleeve and silhouette as opt-in modules (`sleeves.py`, `silhouette.py`) with plug-in flags `unsleeve`, `silhouette_kinds`.

Python and deps: Python 3.11 minimum (scanpipe CI 3.11; Imperium recommends 3.13, pins need 3.12+); opencv-python-headless, numpy, Pillow, scikit-image, scipy, pytest; add imagehash only if pairing/phash moves in. Pin versions as Imperium does. Heavy: OpenCV, scikit-image and scipy wheels (about 150 MB installed); CI run about 2 minutes. Tesseract is an optional system program (apt install tesseract-ocr; the self-hosted runner has it or the OCR test skips). No GPU.

Size: core 2579 lines (about 145 KB). Plug-in contract plus fake plug-in about 5 KB. Tests now 1631 lines, about 70 KB (cast shadow, magenta, black backing, tokens, flags); synthetic cards drawn in tests/synth.py (5 KB), no scan files. Whole scanning-pipeline repo is 726 KB. No test file in either game's ingest tests exceeds 200 KB. Scans stay private: tests must use synthetic images only; real scans never enter the kit.

## 4. Batch split

1. K164a core move, 2 to 3 hours of worker time: copy detect, key, cast, tone, images, review, flags, pipeline, base plug-in, CLI (about 2500 lines); `--plugin module:Class` loading; fake game plug-in; port the tests that do not name Imperium (cast, magenta, black, tokens, flags, about 1300 lines); component.json; kit.lock. Size M.
2. K164b contract tests and the Imperium case: run Imperium's plug-in and its tests unchanged against the component from the game's side (the proof; it stays in the game); add detect_edge_cases, split_touching, descreen, end-to-end pipeline tests on the fake game (about 600 lines of ports). Size M.
3. K164c sleeve and silhouette opt-in modules from Unstoppable (about 500 lines of detect code, silhouette.py 18 KB, tests about 25 KB), with the plug-in flags; Unstoppable gets its own plug-in. Size M, risk medium (detect.py is intertwined with `unsleeve`).
4. K164d optional: pairing/phash, descreen and re-scan bookkeeping as a separate small module (about 700 lines) plus the data-file plug-in. Size S to M. Skip if no new game scans cards in sleeves or flips.

Open question for the owner: Unstoppable's ingest is behind scanpipe on cut-out; moving it to the kit component would update it (not part of K164).

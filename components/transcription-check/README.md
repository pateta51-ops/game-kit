# transcription-check

Every printed item (card, tile, board) is transcribed twice, independently, then the owner checks it against the physical item. Nothing enters the real pack before that. Node only (reads files); no packages.

## Use it in 10 lines

```ts
import { writeFileSync } from 'node:fs';
import { transcriptionCheck, type Transcript } from '../kit/transcription-check/index';
declare const mySchema: { parse: (x: unknown) => Transcript }; // the game's schema
const tc = transcriptionCheck({ root: 'content/real', items: ['sky-1-easy', 'sky-1-hard'], parse: mySchema.parse });
writeFileSync('content/real/PROGRESS.md', tc.progressMarkdown());
tc.check();                                          // writes DIFF.md, exit code 1 while a difference is open
tc.verify(['sky-1-easy'], '2026-11-16');             // owner said "verified"
const gaps = tc.gate();                              // [{ id, message }]: required items not verified
if (gaps.length) throw new Error(gaps.map((g) => `${g.id}: ${g.message}`).join('\n'));
```

- Layout under `root`: `a/` is A, `b/` is B (names via `dirA`, `dirB`), `pictures/<id>.*` the pictures (`pictureDir`), `VERIFIED.json` the ledger (`ledger`).
- A file is `{ id, source: { transcriber: 'A'|'B', from, picture?, session? }, flags: string[], data }`. `parse` is the game's schema (throw on a bad file); without it only that shape is checked. B must be written without seeing A: another session or agent.
- `diff()` compares `data` field by field (`jsonDiff`). A difference is resolved when an A flag starting `NOTE:` (`noteFlag`) names its path as a whole token (`n.first` does not resolve `n`); the picture wins.
- `verify(ids, date)` writes one SHA-256 of A, B and the picture to the ledger, and refuses while B is missing or a difference is open. Any later edit to A, B or the picture changes the hash: `gate()` reports it again.
- `gate()` is for the content check and the real-pack build: run it before assembling the pack from A.
- Not here: reading the pictures, the proof sheet page, and building the pack (the game's).

## Face fit check and tuning tools

Printed text a game places on a card face must fit its box at a pixel floor. Game-free: field names, boxes, fonts and floors come from the game.

```ts
import { faceFitCheck, wrapMeasure } from '../kit/transcription-check/index';
const measure = wrapMeasure((text, size) => text.length * size * 0.5, 1.2); // or a canvas measureText
const issues = faceFitCheck({ floor: 12, measure, faces: [{ id: 'card-1', fields: [{ name: 'body', text: 'Some words', box: { w: 300, h: 60 }, size: 14 }] }] });
if (issues.length) throw new Error(issues.map((i) => `${i.id}.${i.field}: ${i.message}`).join('\n'));
```

- `faceFitCheck` reports each card and field with `below-floor` (size under `floor`: a number, a per-field-name record, or the field's own `floor`) or `overflow` (the measured width or height exceeds the box). `measure(text, size, font, maxWidth)` returns the wrapped `{ w, h }`; `wrapMeasure` builds one from a one-line width function.
- `face-tools/` (Python 3.11+, numpy and Pillow, `requirements.txt`; run from that folder; tests `pytest`): `measure.py` (ink box and text lines of named regions on a rendered face image), `fontfit.py` (largest size at which wrapped text fits a box; `size_from_ink`), `autotune.py` (fit every field of a faces JSON, exit 1 listing each card.field that cannot fit at the floor), `cropsheet.py` (the same crop of many images on one sheet with a labelled grid, for heads or sides by eye). For a plain screenshot contact sheet use `tooling-scripts/contact-sheet.ts`.

Compare a render with a reference picture (a photo or scan of the printed face), then judge the result:

```ts
import { judgeFace, type DiffResult } from '../kit/transcription-check/index';
declare const diff: DiffResult; // face-tools/align.py output for one face
const { failures, warnings } = judgeFace({ diff, policy: { tolerance: 6, minNcc: [['^icon', 0.3], ['.*', 0.5]], textElement: '^line' } });
```

- `face-tools/align.py` (`compare`): per named box, the offset (dx, dy), NCC and scale of the render's content found in the reference within a search radius (default 12 px; per-pattern `radii`, `scales` 0.8-1.2); text matched by strokes (`grad`), shapes by blurred luminance (`lum`); `edge` marks a match at the search edge, which `trust()` refuses. Also `ncc_all`, `best_shift`, `smooth1d`, `edge`, `runs`.
- `judgeFace` (`face-judge.ts`): the game's patterns and numbers come in the policy. Offsets over `tolerance` (6 px), matches at the search edge and NCC under the least (`minNcc`, `minNccSmall` for a scaled reference) are warnings; an unmatched text element, a missing element, data or font issues, text past its box and a line that breaks elsewhere than the reference fail the face. The word check compares in hundredths. `faceFitCheck` takes a `tolerance` in px.
- `autotune.py` also has position rounds: `tune_round` (corrections clamped to 6 px a round, rounded to half pixels, weak and edge matches ignored), `fit_lines` (least squares for first baseline, line pitch, paragraph gap) and `median_by` (one median per token).
- `calibrate.py`: per element kind, the NCC of correct matches against wrong ones (the same element matched where another of its kind lies); suggests a least NCC between them, or null where they overlap.
- `cropsheet.py` exists beside `tooling-scripts/contact-sheet.ts` because that one lays whole screenshots out in a browser; this one crops the same region (a head, a side edge) of every image and draws a labelled grid over it, with Pillow only.

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

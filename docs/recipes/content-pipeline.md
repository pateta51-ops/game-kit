# Content pipeline: from printed items to game data

1. **Scan:** `scan-ingest` (flatbed scans to one upright image per item).
2. **Transcribe twice**, independently; `transcription-check` diffs the two and the owner checks the physical item. Nothing enters the real pack before that.
3. **Patch, never edit:** corrections go in `card-patches` files, one per reason; the source stays as transcribed.
4. **Load as a checked pack:** `content-pack` `load` / `loadText` (CSV or JSON) with one zod schema per record kind; it refuses duplicate ids, dangling references, schema failures and unknown verbs, all problems at once. Load at start-up and in a test, so a bad file fails CI.
5. **Glossary:** `glossary` links terms and icon codes in shown text; `checkGlossary` fails when the game shows a word it does not cover.
6. **Show it:** `card-zoom` shows the full transcription ([card-face-zoom.md](card-face-zoom.md)); effects are tested on real cards ([card-effect.md](card-effect.md)).

Proof: the pack loads (`loadOrThrow` in a test), `transcriptionCheck` clean, `checkGlossary` clean, patch log in the PR.

# Content pipeline: from printed items to game data

1. **Scan:** `scan-ingest` (flatbed scans to one upright image per item).
2. **Transcribe twice**, independently; `transcription-check` diffs the two and the owner checks the physical item. Nothing enters the real pack before that.
3. **Patch, never edit:** corrections go in `card-patches` files, one per reason; the source stays as transcribed.
4. **Glossary:** `glossary` links terms and icon codes in shown text; `checkGlossary` fails when the game shows a word it does not cover.
5. **Show it:** `card-zoom` shows the full transcription ([card-face-zoom.md](card-face-zoom.md)); effects are tested on real cards ([card-effect.md](card-effect.md)).

Proof: `transcriptionCheck` clean, `checkGlossary` clean, patch log in the PR.

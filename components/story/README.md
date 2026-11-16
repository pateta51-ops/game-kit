# story

Story as data only (flavour: no rule lives in it; a missing line never blocks play). Release 1.0: no animation, no sound. Needs the package `react` for the sheet. `index.ts` draws nothing and loads in node; `ui.ts` holds the React part. Ideas from the write-ups `docs/evaluation/outside/story-campaign-*.md`; code written fresh.

## Data (`story.ts`)

- `Story` = `{ speakers: {id, name, kind?}[], scenarios }`. `Scenario` = `{ id, title, slots?, stages?, sheet }`.
- `slots`: named lists of beats: `intro`, `win`, `loss`, `teaser`, `recap`. `stages`: beats by stage number.
- `sheet`: the scenario story sheet, parts in reading order (`before`, `after`), each `{ id, title?, beats }`.
- `Beat` = `{ id?, lines, picture?, kind?, data? }` (`kind`/`data` stay open for a question beat, a page tree, panels). `Line` = `{ speaker?, text, fallback? }`. `Picture` = `{ file?, note }`.

## Functions

- `resolveLine(story, line, inPlay)`: a named character not in play reads as a narrator line with `fallback`; no fallback drops the line. `resolveBeat`.
- `slotBeats(story, scenarioId, slot | { stage }, inPlay)`: resolved beats, empty ones left out.
- `visibleParts(scenario, reached)`, `sheetView(story, scenarioId, reached, inPlay)`: parts up to the furthest reached one; later parts hidden. The sheet can be reopened at any time (the game keeps `reached`).
- `pictureView(picture, exists)`: the file when it exists, else the text note.
- `storyProblems(story)`: unknown or reserved speaker, duplicate ids.

## UI (`ui.ts`)

`<StorySheet story scenarioId reached inPlay fileExists? renderFile? />`: draws the visible parts; a picture without its file shows its note.

## Look

`story.css` (loaded by `StorySheet.tsx`) at zero specificity: `--story-font`, `--story-text`, `--story-bg`, `--story-pad`, `--story-gap`, `--story-head-font`, `--story-name`, `--story-narrator-style`, `--story-note-border`, `--story-note-opacity`. Classes: `kit-story`, `-part`, `-title`, `-beat`, `-pic`, `-note`, `-line`, `-narrator`, `-name`.

Tests: `story.test.ts` (node), `ui.test.tsx` (jsdom).

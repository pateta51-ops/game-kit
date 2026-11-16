# story

Story as data only (flavour: no rule lives in it; a missing line never blocks play). Needs the package `react` for the views. `index.ts` draws nothing and loads in node; `ui.ts` holds the React part. Ideas from `docs/evaluation/outside/story-campaign-*.md`; code written fresh.

## Data (`story.ts`)

- `Story` = `{ speakers: {id, name, kind?}[], scenarios }`. `Scenario` = `{ id, title, slots?, stages?, sheet }`; `slots`: `intro`, `win`, `loss`, `teaser`, `recap`; `stages`: beats by number; `sheet`: parts `{ id, title?, beats }` in reading order.
- `Beat` = `{ id?, lines, picture?, kind?, data? }`. `Line` = `{ speaker?, text, fallback? }`. `Picture` = `{ file?, note }`.
- `resolveLine`/`resolveBeat(story, x, inPlay)`: a named character not in play reads as narrator with `fallback`; none drops the line. `slotBeats`, `visibleParts`, `sheetView(story, scenarioId, reached, inPlay)`, `pictureView(picture, exists)` (file, else the note), `storyProblems`.
- `<StorySheet story scenarioId reached inPlay fileExists? renderFile? />`.

## Page (`page.ts`, `PageView.tsx`)

`{id, entries}`, a tree of text keys: `text` (`{vars}`), `header`, `list`, `card`, `icon`, `footnote`, `mod` (`resolution`, `interlude`, `boxed`), `branch`. `pageView(page, texts, log, overlay?)`: the first branch case whose `when` holds is `applied`; `overlay` marks lines `changed`. `pageProblems`. `<PageView page texts log overlay? renderCard? renderIcon? />`.

## Panel reader (K154, 1.1, opt-in; `panels.ts`, `PanelReader.tsx`)

`PanelSheet` = `{ id, picture: {file?, note, w, h}, beats, credit? }`; `PanelBeat` = `{ rect (picture pixels), caption?, lines?, sfx?, wideOnly?, narrowOnly? }`. `framing(rect, area, page, margin = 0.04)`, `dualFraming(rect, {wide, narrow}, page)` (one rectangle, two framings), `camera`, `beatsFor(beats, aspect)`, `moveMs(reduced)`, `readerStep(reader, count, 'next'|'back'|'skip')`, `keyAction(key)`, `earnedStories(all, unlocked)` (Extras list), `panelProblems`.
`<PanelReader sheet area aspect? story? reduced? onDone labels? fileExists? renderFile? />`: tap or Next, Back, Skip, arrow keys, Enter, Esc; `reduced` (default: the media query) cuts, no tween.

## Event splash (K155, 1.1, opt-in; `splash.ts`, `SplashView.tsx`)

`splashFor(events, lookup, shown, keyOf?)`: the first event not in `shown` whose `lookup` gives a `Splash` `{ title?, picture?, line, note? }`, as `{ key, splash }`; the game adds `key` to `shown`. `splashAutoCloseMs(reduced)`: 4000, null under reduced motion. `<SplashView splash onClose reduced? />`: tap, any key or 4 s.

## Beats as engine questions (K153, opt-in; `beats.ts`, needs `engine-core`)
`AskBeat` = a `Beat` with `id`, `ask?` (`read`, `choose` `{choices: {id, label, enabled?, why?}}`, `card` `{cards: {id, faceDown?}, min?, max?}` (a face-down card is offered as `down:<index>`; `realPicks` reads it back), `character` `{characters, min?, max?}`) and `split?` (lines per part). Spread `storyHandlers({ story, inPlay?, answered? })` into the handlers and `ctx.then(storyTask(scenario, beatId))`: each part is a prompt (`read` until the last part, then the beat's question; the prompt carries `story: {scenario, beat, part}`), so it saves, replays and undoes like play and a save resumes at the part reached; `answered(ctx, task, picks)` applies the last answer. `beatQuestion(story, task, inPlay)` gives the screen its part's lines, `ask`, `part`/`of`; `beatProblems`.

## Look

`story.css` at zero specificity: `--story-font`, `-text`, `-bg`, `-pad`, `-gap`, `-head-font`, `-name`, `-narrator-style`, `-note-border`, `-note-opacity`, `-splash-bg`, `-invalid-opacity`, `-changed`, `-box-border`, `-interlude-style`. Classes `kit-story*`, `kit-page-*`, `kit-panel*`, `kit-splash*`.

## Use it in 10 lines

```ts
import { speakerName, type Story } from '../kit/story/index'

const story: Story = { speakers: [{ id: 'ann', name: 'Ann' }], scenarios: [] } // the game's story as data
console.log(speakerName(story, 'ann'), speakerName(story, 'narrator')) // Ann narrator
```

# tutorial

The tutorial engine for any `GameRules<G>` game: a script format, headless play of a script on a seed, the lock that allows only the scripted answer, the phase table and session, the check, the readable script document, a seed search; and, in `ui.ts` (React), the narration panel and the highlight. Needs `engine-core`, `state-machines` and the packages `zod` and `react`. `index.ts` draws nothing and loads in node.

## Rules for agents

**What it does:** The tutorial engine for any `GameRules` or engine-port game: a JSON script format, headless play of a script on a seed, the answer lock, the session machine, the check, a readable script document, a seed search, plus the narration panel and highlight.

**You must:**
1. Needs `engine-core`, `state-machines` and the packages `zod` and `react`; import `index` in Node and `ui` for the panel and highlight.
2. Write the script as JSON and load it with `parseScript` (it returns every problem as `path: message`); give each step a unique `id`, a `narration` (with `noBareNumbers` set, a digit outside `{{tokens}}` is `BARE_NUMBER`) and a `do` of `move`, `next` or `auto`.
3. Give `TutorialGame` (or `TutorialPort` for an engine port) `rules`, `content`, `gameRules`, `options(seed)`, and `human`, `findOption`, `optionWords`, `eventWords` when options are not plain ids.
4. Add a `tutorial:check` script that calls `tutorialCheck(game, script, options, io)`; exit 1 means the script no longer plays (`NO_PROMPT`, `WRONG_SEAT`, `NO_SUCH_OPTION`, `DISABLED_OPTION`, `ILLEGAL`, `MISSING_EVENT`, `UNCOVERED`, `UNTESTED`, `NO_END` ...).
5. Lock the UI with `lockAt` and `lockPrompt`: only the scripted answer is allowed, Undo and Redo are off during the lesson and everything is free after the last step.
6. Use `actionsBefore` and `stepAt` to resume the right step after an undo or reload.
7. Mount `<TutorialPanel>` and `<TutorialHighlight>`; mark target elements `data-tutorial-target="<id>"` (or pass `find`), pass `side` to the panel and `docked` to both when it is docked, shrinking the game screen with `--tut-reserve`.
8. Set `--tut-*` variables on `:root`; give e2e `playTutorialE2E` and waits on `data-step`.
9. Write narration with the game's words; the owner approves the generated `scriptDoc`, so regenerate it and run its `--check`.

**Common mistakes:**
- Editing the script without re-running `tutorial:check`: a move that is no longer legal fails the check, not the screen.
- Targeting ids the game never marks: the highlight shows nothing.

## Script (`parseScript`)

JSON: `seed`, optional `title`, `steps`, optional `end` (matched against `state.result`). A step: `id` (unique), `narration`, `targets` (highlight target ids, the game's own spelling), `do`, optional `asks` (the words of "The tutorial asks for …"), `expect` (events that must happen, in order; an object matches when its fields match), `items` (what the step teaches).

`do` is one of `{ kind: 'move', choose: [refs], prompt? }` (one locked answer), `{ kind: 'next' }` (explains only), `{ kind: 'auto', moves: [[refs], …] }` (Next plays these answers by itself). A ref is an option id unless the game's `findOption` reads it.

`actionsBefore(script, i)` and `stepAt(script, actions)`: the step a game is at from its number of answers (undo, resume).

## The game's part (`TutorialGame<G>`)

`rules`, `content`, `gameRules`, `options(seed)`. Optional: `human(state)` (is the open prompt the player's), `promptKind(state)`, `findOption(state, ref)`, `ordered(state)` (answer order matters), `optionWords(state, id)`, `eventWords(state, event)`, `same(state, want, actual)` (e.g. a card instance against its definition id).

K390: a game with its own engine passes a `TutorialPort<G>` instead: engine-core's `EnginePort` (`start(seed)`, `apply`, `settle`, `prompt`, `events`, `result`) with the same optional hooks. `startRun`, `playStep`, `playScript`, `scriptedIds`, `missingEvents`, `lockAt`, `lockPrompt`, `refusal`, `tutorialCheck` and `stepHeadings` take either (`TutorialEngine<G>`); `run.actions` are `PortAnswer`s (the port's prompt ids). `searchSeeds`, `buildScript`, `answerWords`, `lineDump`, `scriptLine` and `driverLine` take either too (K400; a port's `SeedLine.actions` are `PortAnswer`s).

## Use

- `playScript(game, script, { seed?, items?, evidence?, requireEnd?, noBareNumbers?, stopOnFailure? })`: every problem in one sentence. Step failures name the step, what was expected and what happened: `NO_PROMPT`, `WRONG_SEAT`, `WRONG_PROMPT`, `NO_SUCH_OPTION`, `DISABLED_OPTION`, `ILLEGAL`, `MISSING_EVENT`; then `UNCOVERED`, `UNTESTED` (a tagged item with none of its `evidence` event types expected), `BARE_NUMBER` (a digit outside `{{tokens}}`), `NO_END`, `NOT_OVER`, `END`. `stopOnFailure: false` and `seed` serve a seed search.
- `lockAt(game, script, stepIndex, state)`: `option(id)`, `button('undo' | 'redo' | 'next' | other)`, `accepts(action)`, `answer`, `asks`, `problem`, "Step N of M". Undo and Redo are off; any other control stays free. After the last step everything is free. `lockPrompt(prompt, lock)` disables the other options with the reason; `refusal(lock, action)`.
- `TUTORIAL_MACHINE` (`kit.tutorial`: off, guided, closing, closed) and the session: `startTutorial`, `stepDone`, `stepBack`, `leaveTutorial`, `closeTutorial`, `playFree`, `lockedStep`.
- `tutorialCheck(game, script, options, io)`: exit code 0 or 1 for a game's `tutorial:check` script.
- `scriptDoc(script, { title, source, intro?, names?, heading?, items? })`, `stepHeadings(game, script, heading(state))`, `writeDoc(io, path, text, check)`: the generated document for the owner's approval and its `--check`.
- `searchSeeds({ seeds, play, accept(events, line), want?, score?, keep? })`: the seeds whose line the game's predicate accepts, else the best by `score`. `play` is `scriptLine(game, script)` (the script on the seed) or `driverLine(game, choose(state, seed), maxActions?)` (the game's driver from the setup); `seedRange(prefix, from, count)`.
- Building a script (`build.ts`): `buildScript(game, line.actions, plan, { seed, title?, keep?(event), strip?(event) })` writes the script from a seed's line of play (`driverLine(...)(seed)`) and the game's narration: each `StepPlan` (`id`, `n`, `auto?`, `narration`, `targets?`, `items?`) takes the next `n` answers (0: Next; `auto` or `n` over 1: played on Next), its `asks` from `optionWords`, its `prompt` from `promptKind`, its `expect` from the events `keep` passes, as `strip` writes them; it throws when the steps do not take the whole line. `answerWords(game, script, words?)`: each step's answers in the words on screen (`optionWords`, then `words`, e.g. icon tokens to glossary names); pass them to `scriptDoc` as `played` and "The player" reads them. `lineDump(game, seed, actions, where?(state))`: a line in words, answer by answer with its options and events, for reading a seed before writing narration.
- End to end (`e2e.ts`, no Playwright import): `playTutorialE2E(page, script, { answer(page, choose, step, n), before?, timeout?, over?, from? })` waits for each step on the panel's `data-step` (`stepSelector(n)`), presses its Next (`NEXT`) on Next and auto steps, hands a move step to the game's `answer` (how its controls are pressed), then waits for the `over` words (default `PANEL_WORDS.over`; false skips). `page` needs only Playwright's `waitForSelector` and `click`.
- `placePanel(targets, { w, h }, area, gap?)`: the panel's top-left above, below, right or left of the targets, never on one.

Mount (`ui.ts`): `<TutorialPanel lock phase title? text? words? outro? onNext onBack? onLeave onClose docked? side? button?>{extras}</TutorialPanel>`: "Step N of M", the narration through the game's `text` renderer, Next on an explaining step, "Your move:" and `lock.asks` on a move step, Close while closing, Hide/Show. `words` replaces any of `PANEL_WORDS`. `side` (`'top' | 'bottom' | 'left' | 'right'`) docks the panel on that window edge and, while it shows, sets `data-tut-side` and `--tut-reserve` (its height, or width on left and right) on `<html>`: the game shrinks its screen with e.g. `html[data-tut-side='right'] .screen { right: var(--tut-reserve, 0px) }`; pass `docked` to the highlight too. `button` is the game's own button component for every panel button (`TutorialButtonProps`: `kind` next, back, close, leave or fold, `onClick`, `disabled`, `title`, `children`, and `data-tutorial-next` to spread onto its element). `<TutorialHighlight targets find? panel? area? gap? docked? root? version? />`: marks the elements of the step's target ids (default `[data-tutorial-target~="<id>"]`), shades the window with holes over them and the panel, draws a leader, and places the panel with `placePanel` (`position: fixed`); `docked` (the phone) only marks and scrolls the target into view; `scroll={false}` marks without scrolling (K393: a fitted stage must not move). `stage={() => el}`: when the panel sits inside a CSS-scaled box (a fitted stage), it is placed in that box's own units (window rects divided by its measured scale, from its corner), clear of the targets. `<TutorialPanel pacing onSkip>`: while the game's paced steps play (no prompt yet) Next stays usable on an explaining or auto step and calls `onSkip` (the game's skip-pacing) instead of `onNext`; without `onSkip`, or on a move step, Next keeps the lock's verdict (disabled). The stage scale is measured per axis.

- Coach (`coach.ts`): `nextTip(tips, events, state, seen, inLesson?)` is the first unseen `Tip` (`id`, `title`, `text`, `when(events, state)`, `situational?`, `targets?`) the last action made relevant; situational tips wait out a guided lesson. `suggest(coach, state)`: the move the game's driver picks (`coach.choose`) in words with reasons and places to spotlight (`coach.explain`, `maxWhy` default 4), on any pack. `seenStore(key, storage?)`: seen tip ids per browser.

## Look
`tutorial.css` (loaded by the panel) defines neutral `--tut-*` variables at zero specificity; set them on `:root` or an ancestor: `--tut-panel-bg`, `-text`, `-border`, `-shadow`, `-width`, `-radius`, `--tut-font-body`, `--tut-font-heading`, `--tut-text-size`, `--tut-count-text`, `--tut-button-bg`, `--tut-button-text`, `--tut-link`, `--tut-shade`, `--tut-target-ring`, `--tut-arrow`, `--tut-z`, `--tut-side-max` (the height limit docked top or bottom, default 45vh). Classes: `kit-tutorial-panel`, `-target`, `-shade`. Tests: `tutorial.test.ts`, `seed.test.ts`, `build.test.ts`, `ui.test.tsx` (jsdom), on the engine-core fake counter game.

## Use it in 10 lines

```ts
import { parseScript } from '../kit/tutorial/index'

const script = parseScript({ steps: [] }) // the script from JSON, or every problem as path: message
console.log(script)
```

```tsx
import { TutorialPanel, TutorialHighlight } from '../kit/tutorial/ui'
import type { TutorialLock, TutorialPhase } from '../kit/tutorial/index'

declare const lock: TutorialLock
declare const phase: TutorialPhase
export const Tour = ({ close }: { close: () => void }) => (
  <>
    <TutorialPanel lock={lock} phase={phase} onNext={() => undefined} onLeave={close} onClose={close} />
    <TutorialHighlight targets={['end-turn']} />
  </>
)
```

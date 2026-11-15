# tutorial

The tutorial engine for any `GameRules<G>` game: a script format, headless play of a script on a seed, the lock that allows only the scripted answer, the phase table and session, the check, the readable script document, a seed search; and, in `ui.ts` (React), the narration panel and the highlight. Needs `engine-core`, `state-machines` and the packages `zod` and `react`. `index.ts` draws nothing and loads in node.

## Script (`parseScript`)

JSON: `seed`, optional `title`, `steps`, optional `end` (matched against `state.result`). A step: `id` (unique), `narration`, `targets` (highlight target ids, the game's own spelling), `do`, optional `asks` (the words of "The tutorial asks for …"), `expect` (events that must happen, in order; an object matches when its fields match), `items` (what the step teaches).

`do` is one of `{ kind: 'move', choose: [refs], prompt? }` (one locked answer), `{ kind: 'next' }` (explains only), `{ kind: 'auto', moves: [[refs], …] }` (Next plays these answers by itself). A ref is an option id unless the game's `findOption` reads it.

`actionsBefore(script, i)` and `stepAt(script, actions)`: the step a game is at from its number of answers (undo, resume).

## The game's part (`TutorialGame<G>`)

`rules`, `content`, `gameRules`, `options(seed)`. Optional: `human(state)` (is the open prompt the player's), `promptKind(state)`, `findOption(state, ref)`, `ordered(state)` (answer order matters), `optionWords(state, id)`, `eventWords(state, event)`, `same(state, want, actual)` (e.g. a card instance against its definition id).

## Use

- `playScript(game, script, { seed?, items?, evidence?, requireEnd?, noBareNumbers?, stopOnFailure? })`: every problem in one sentence. Step failures name the step, what was expected and what happened: `NO_PROMPT`, `WRONG_SEAT`, `WRONG_PROMPT`, `NO_SUCH_OPTION`, `DISABLED_OPTION`, `ILLEGAL`, `MISSING_EVENT`; then `UNCOVERED`, `UNTESTED` (a tagged item with none of its `evidence` event types expected), `BARE_NUMBER` (a digit outside `{{tokens}}`), `NO_END`, `NOT_OVER`, `END`. `stopOnFailure: false` and `seed` serve a seed search.
- `lockAt(game, script, stepIndex, state)`: `option(id)`, `button('undo' | 'redo' | 'next' | other)`, `accepts(action)`, `answer`, `asks`, `problem`, "Step N of M". Undo and Redo are off; any other control stays free. After the last step everything is free. `lockPrompt(prompt, lock)` disables the other options with the reason; `refusal(lock, action)`.
- `TUTORIAL_MACHINE` (`kit.tutorial`: off, guided, closing, closed) and the session: `startTutorial`, `stepDone`, `stepBack`, `leaveTutorial`, `closeTutorial`, `playFree`, `lockedStep`.
- `tutorialCheck(game, script, options, io)`: exit code 0 or 1 for a game's `tutorial:check` script.
- `scriptDoc(script, { title, source, intro?, names?, heading?, items? })`, `stepHeadings(game, script, heading(state))`, `writeDoc(io, path, text, check)`: the generated document for the owner's approval and its `--check`.
- `searchSeeds({ seeds, play, accept(events, line), want?, score?, keep? })`: the seeds whose line the game's predicate accepts, else the best by `score`. `play` is `scriptLine(game, script)` (the script on the seed) or `driverLine(game, choose(state, seed), maxActions?)` (the game's driver from the setup); `seedRange(prefix, from, count)`.
- `placePanel(targets, { w, h }, area, gap?)`: the panel's top-left above, below, right or left of the targets, never on one.

Mount (`ui.ts`): `<TutorialPanel lock phase title? text? words? outro? onNext onBack? onLeave onClose docked?>{extras}</TutorialPanel>`: "Step N of M", the narration through the game's `text` renderer, Next on an explaining step, "Your move:" and `lock.asks` on a move step, Close while closing, Hide/Show. `words` replaces any of `PANEL_WORDS`. `<TutorialHighlight targets find? panel? area? gap? docked? root? version? />`: marks the elements of the step's target ids (default `[data-tutorial-target~="<id>"]`), shades the window with holes over them and the panel, draws a leader, and places the panel with `placePanel` (`position: fixed`); `docked` (the phone) only marks and scrolls the target into view.

## Look
`tutorial.css` (loaded by the panel) defines neutral `--tut-*` variables at zero specificity; set them on `:root` or an ancestor: `--tut-panel-bg`, `-text`, `-border`, `-shadow`, `-width`, `-radius`, `--tut-font-body`, `--tut-font-heading`, `--tut-text-size`, `--tut-count-text`, `--tut-button-bg`, `--tut-button-text`, `--tut-link`, `--tut-shade`, `--tut-target-ring`, `--tut-arrow`, `--tut-z`. Classes: `kit-tutorial-panel`, `-target`, `-shade`. Tests: `tutorial.test.ts`, `seed.test.ts`, `ui.test.tsx` (jsdom), on the engine-core fake counter game.

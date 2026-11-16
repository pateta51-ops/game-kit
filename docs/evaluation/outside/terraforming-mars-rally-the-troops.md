# Outside survey: Terraforming Mars and Rally the Troops (15 Nov 2026)

Read-only. Nothing was run or built. Clones deleted afterwards.

## Sources and licences

| Repo | Got from | Licence (LICENSE file read) |
|---|---|---|
| terraforming-mars | github.com/terraforming-mars/terraforming-mars | GPL-3.0. Idea only, write new, never paste. |
| RTT server | **Not the URL given.** `github.com/rally-the-troops/server` does not exist; the author's own host `git.rally-the-troops.com/common/server` answers 401 (password). Used the public mirror `github.com/rzymek/rally-the-troops` (pushed 15 Nov 2026, describes itself as a mirror of the author's server repo). | ISC, with a note that the licence covers the platform software and not the game titles. Code may be lifted with the notice. |
| RTT module: Paths of Glory | github.com/rally-the-troops/paths-of-glory (the only module in the GitHub organisation). Card-driven, point-to-point map. | No LICENSE file. README: source copyright Nathan Forget and Tor Andersson. Idea only. |
| RTT module: Imperial Struggle | github.com/Cattlesquat/Imperial-Struggle (third-party module, uses the current framework and `world.js`) | No LICENSE file. Idea only. |
| RTT module: Lew Morski | github.com/rzymek/rtt-lew-morski (third-party, TypeScript + Vite, hex map) | No LICENSE file. Idea only. |
| rtt-fuzzer | github.com/MischaU8/rtt-fuzzer | ISC. |

Not obtained: any of Tor Andersson's own block or hex modules (Julius Caesar, Andean Abyss, Wilderness War and the rest sit behind the 401). The block-game and COIN patterns are therefore not covered.

## What I read, and what I did not

Read (body, or the stated lines):
- TM: `src/server/deferredActions/{Priority,DeferredAction,DeferredActionsQueue,PriorityQueue,RunNTimes}.ts`; `src/server/PlayerInput.ts`; `src/server/inputs/{OrOptions,SelectSpace}.ts`; `src/common/inputs/InputResponse.ts`; `src/server/behavior/Behavior.ts`, `Countable.ts` (first 35 lines), `Executor.ts` (first ~60 of 790 lines); `src/server/boards/{Space,BoardBuilder,TharsisBoard,PlacementType,SerializedBoard}.ts`, `Board.ts` (first 260 of 445 lines + method list), `MarsBoard.ts` (method list + `getAvailableSpacesForType`); `src/common/logs/{LogMessageData,LogMessageDataType,Log}.ts`; `src/server/logs/{MessageBuilder,LogMessageBuilder}.ts`; `src/client/components/PlayerInputFactory.vue`, `SelectSpace.vue` (first 120 lines), `Board.vue` (first 45 lines); `src/server/cards/base/{Birds,ArtificialLake}.ts` and their specs; `src/common/cards/CardRequirementDescriptor.ts`; `src/server/cards/requirements/CardRequirements.ts` (first 45 lines); `src/server/cards/render/CardRenderer.ts` (first ~80 of 716 lines); `tests/{TestingUtils,TestGame,assertions}.ts`, `tests/testing/EmptyBoard.ts`, `tests/cards/{CardMetadata,ICard}.spec.ts`; `src/server/tools/README.md`, `check_locales.ts`, `export_card_rendering.ts` (first 30 lines); `src/tools/translation_audit.ts` (first 50 lines); `CLAUDE.md` (first 65 lines); grep hits only for solo, undo and serialize in `Game.ts`, `Player.ts`, `database/GameLoader.ts`.
- RTT server: `LICENSE`, `NOTES.md`, `docs/index.md`, `docs/tips.md`, `docs/module/{fuzzer,guide,library,rules,script}.md`, `docs/module/world.md` (first ~250 of 441 lines), `docs/overview/module.md` (lines 60-329), `docs/server/toolbox.md`, `public/common/framework.js` (first 620 of 921 lines), `tools/fuzz.js`, `tools/parse-layout.js` (head and emit part), `tools/new-layout.js` (head), `bin/rtt-patch`, `bin/rtt-undo`, `bin/rtt-test`; function lists only of `public/common/client.js` and `replay.js`.
- Paths of Glory: `rules.js` view, action, movement-state, log, undo excerpts (about 400 of 10861 lines); `data.js` head and section list; `play.js` `on_log` and `escape_text`.
- Imperial Struggle: `world.js` function list, `world` object, `begin_update`/`end_update`, `_layout_stacks`; grep of `rules.js` for framework use.
- Lew Morski: file tree, `src/rules/game/hex.ts` (first 70 lines), `src/encapsulation.check.ts`.
- rtt-fuzzer: README (first 45 lines).

Not read: TM `Game.ts`/`Player.ts` bodies, `src/server/automa/` (MarsBot solo opponent), the 790-line Executor past its start, the card render client, `LogPanel`, the wiki; RTT `server.js`, `docs/overview/{architecture,database}.md`, `client.js`/`replay.js` bodies, the second half of `world.md`; `rzymek/rally-the-troops-module` (the TypeScript helper package) was not cloned. In game-kit I read `README.md`, the harvest section of `docs/PLAN.md` and the file names under `components/`; I did not open `engine-core/steps.ts`, `undo.ts`, `state-machines` or `sim-pool/fuzz.ts`, so the findings marked "compare first" may partly exist already.

## Findings worth taking

### 1. Map layout drawn in Inkscape, extracted as data (rects + edges)
- Repo: RTT server (ISC, liftable).
- What: `new-layout.js` writes a blank SVG with the map picture as backdrop. A person draws a labelled rect or circle per space and a path per connection. `parse-layout.js` emits `layout = { name: [x,y,w,h] }` (grouped by `<g>` label) and `edges = [name1, name2, x1,y1,x2,y2]`, matching each path end to the nearest node and an unlabelled box to the nearest text.
- Files: `tools/parse-layout.js`, `tools/new-layout.js`.
- Why: one drawing gives both the click areas and the adjacency list for any point-to-point or area map; no hand-typed coordinates. Fits a scan-based board directly.
- Size: S (316 + 71 lines, plain Node, no dependencies). New component, e.g. `board-layout`.
- Maturity: used across the author's published modules; caveat stated in the file: no SVG transforms allowed.

### 2. "World" registry: things (space, piece, marker, card, stack) keyed by (type, id), highlighted straight from the legal-action list
- Repo: RTT server docs (ISC) + `world.js` as copied into Imperial Struggle (no licence: rewrite).
- What: `define_space/piece/marker/card/stack/layout_track/layout_grid` create one element per thing with behaviours (`.action()`, `.stackable()`, `.animate()`, `.tooltip()`, `.layout(rect)`). Each update is `begin_update()`, `populate(parent, child)` calls from the view, `end_update()`. `end_update` gives a thing the class `action` when `view.actions[type]` contains its id, lays out stacks, and animates position changes it remembered in `begin_update`.
- Files: `docs/module/world.md`; `Imperial-Struggle/world.js` lines 83-135 (world object, Thing), 392-560 (define_*), 567-680 (populate, update_*), 903-986 (begin/end_update).
- Why: this is the generic board UI the kit lacks: space and piece selection, highlight, and movement animation with no per-game click wiring. As React: a `<Board layout>` with `<Space id>`, `<Piece id>`, `<Stack>` that read legal actions from context.
- Size: M to L (1506 lines of DOM code to re-think for React).
- Maturity: `world.md` itself marks several behaviours WIP (`.button()`, `.static_child()`, `update_style`); "recent modules" only.

### 3. Stack layout for pieces sharing a space
- Repo: Imperial Struggle `world.js` (idea), described in RTT `docs/module/world.md`.
- What: a stack has a collapsed offset (dx, dy), an expanded offset (major/minor dx, dy), a wrap count, a threshold under which it is always expanded, and gravity. It expands on click or focus, is raised with z-index, and is clamped so the splayed pieces stay inside the board padding.
- Files: `world.js` lines 743-806 (`_layout_stacks`), 708-742 (focus/blur), `define_stack` line 437.
- Why: every counter-on-map game needs it; about 60 lines of arithmetic.
- Size: S. Part of finding 2.

### 4. Legal actions as one table `{ verb: [ids] | 0 | 1 }`
- Repo: RTT server (ISC).
- What: a state's `prompt()` calls `action("space", s)`, `action("piece", p)`, `button("pass", enabled)`. The result is the only description of what is legal. The UI highlights from it, `send_action` refuses anything not in it, the fuzzer enumerates it, and the replay tools validate stored moves against it. A disabled button is `0`, so "shown but barred" is in the same table.
- Files: `public/common/framework.js` (`action`, `button`, `exports.view`, `exports.action`); `docs/overview/module.md` (`send_action`, `action_button`); `tools/fuzz.js` `list_actions`; `bin/rtt-patch` `is_valid_action`.
- Why: the shape is what makes findings 2, 7 and 8 generic. K80 and K88 concern the same list; this gives its simplest form for board games (verb = thing type, noun = thing id).
- Size: S (pattern note, or an adapter in `engine-core`).

### 5. Nested state stack with local scopes, and flow written as a short script
- Repo: RTT server (ISC).
- What: states are objects `{ prompt(), <verb>(arg), _begin, _resume, _end, inactive }` in a table `P`. `call(name, env)` pushes, `goto` replaces, `end(result)` pops and hands the result to the caller as `L.$`. The stack is a linked list stored inside the game state (`G.L`), so it is saved, undone and replayed with everything else. Sequence of play is a Tcl-like script (`for G.round in 1 to 5 { call movement_phase }`) compiled to an instruction list with a program counter in the scope; a 1000-step cap throws "runaway script".
- Files: `public/common/framework.js` lines 1-250 (call/goto/end, `_run`), 250-470 (`_parse`, compile); `docs/module/rules.md`, `docs/module/script.md`. Imperial Struggle `rules.js` has 26 such scripts (lines 2189, 2200, 2478, 3386...).
- Why: shared sub-flows (take losses from battle or from attrition) are called from anywhere and return to the caller; the whole turn structure is readable in 15 lines. Compare first with `engine-core/steps.ts` and `state-machines`.
- Size: M. The script compiler uses `eval`; in TypeScript use an array of step functions or a typed step list instead of the text language.
- Maturity: solid in the current framework; Paths of Glory still uses the older flat `states[game.state]` style, so not every module has it.

### 6. Undo rules, and a fuzz check that enforces them
- Repo: RTT server (ISC); Paths of Glory (idea).
- What: `push_undo()` is the first line of each player action handler; the snapshot stores the log length, not the log. The stack is cleared when the active player changes (framework, automatically) and by hand before a die roll, a card draw or any reveal (62 `push_undo`, about 12 `clear_undo` sites in Paths of Glory). The fuzzer fails a run with `BadUndo` if, after an action, the undo stack is non-empty and the random seed or the active player changed.
- Files: `public/common/framework.js` (`push_undo`, `pop_undo`, `clear_undo`, end of `exports.action`); `tools/fuzz.js` lines around `BadUndo`; `paths-of-glory/rules.js` 10352-10395 and the `clear_undo()` sites (2832, 2927, 3220, 4663...).
- Why: K108 has the "randomness bars undo" flag; the `BadUndo` invariant is the missing test that proves no undo can re-roll a die. One comparison per step in `sim-pool`.
- Size: S.

### 7. Fuzzer checks beyond "it crashed"
- Repo: RTT server `tools/fuzz.js` (ISC), rtt-fuzzer (ISC).
- What: (a) dead end: no action offered except undo; (b) a prompt starting `TODO:` is a failure; (c) `MAX_STEPS` and a wall-clock timeout per game; (d) on a crash the same input is replayed in a diagnostic mode that keeps a copy of the state before the failing action, and the dump holds setup, state and replay; (e) the module's `assert(state)` hook runs after every action (Paths of Glory checks stacking limits, opposing sides in one space, trench levels); (f) `globalThis.RTT_FUZZER` lets rules skip parts; (g) "breakpoint": throw `"STOP"` at the rule you want to look at and the fuzzer hands you an importable game sitting exactly there; (h) input can be a byte buffer, so a coverage-guided fuzzer (jazzer, jsfuzz) can drive it and keep a corpus.
- Files: `tools/fuzz.js` (all 272 lines), `docs/module/fuzzer.md`, `paths-of-glory/rules.js` 10851-10860 (`assert_state`), `rtt-fuzzer/README.md`.
- Why: (e) and (g) are the valuable ones for board games: map invariants checked on every random step, and late-game fixtures for free. Compare with `sim-pool/fuzz.ts` first; K101 covers render-on-every-step and the one-answer replay.
- Size: S each.

### 8. Replay every stored game against the current rules, with a path diff
- Repo: RTT server (ISC).
- What: `rtt-test` replays each stored game from its action list through the current `rules.js`, checks each stored action is still legal, then diffs the final state against the stored one by path (`- G.location[12] = 4`, `+ G.location[12] = 5`). Result: three lists, CRASHED, DIVERGED (a stored move is no longer legal), CHANGED (same moves, different state). `rtt-patch` rebuilds a game's state and snapshots from its replay after a fix; `rtt-undo` is "delete the last N replay rows, then patch".
- Files: `bin/rtt-test` (198 lines, `object_diff`), `bin/rtt-patch` (357 lines), `bin/rtt-undo`.
- Why: the three-way verdict and the path diff are a better report for `replay-cli` goldens than a digest mismatch (K81). Patching live saves is out of scope while the no-save-fixing rule holds.
- Size: S (the diff and verdicts); patching: not now.

### 9. Log markup: line prefixes plus inline tokens that light up the map
- Repo: RTT server docs (ISC); Paths of Glory (idea).
- What: rules write plain strings. A line prefix sets the kind (`.h1`, `.h2`, `>` indent, `!` alert, `#ap` opens a coloured group box closed by a blank line). Inline tokens `s12`, `P34`, `c5`, `W4` are replaced on the client by the space, piece, card name or a die face; hovering a name highlights the space or piece on the map or shows the card, clicking scrolls to it. Helpers: `escape_tip_light/class/clone`, `escape_dice`, `escape_icon`, `update_log_boxes/open_log_box/close_log_box`.
- Files: `docs/module/world.md` ("Log & Prompt", "Log group boxes"); `paths-of-glory/rules.js` 10649-10715; `paths-of-glory/play.js` `on_log`, `escape_text`, `sub_space_name` (379-410), `on_focus_space_tip` (361-375).
- Why: K86 and K106 cover structured entries and card links. New for boards: space and piece references that highlight and scroll the map, and group boxes for a battle or an activation. The same tokens work in prompts.
- Size: S, as an addition to K86/K106. Keep K86's data entries; do not copy the string encoding.

### 10. Board model: spaces as data, row builder, adjacency computed once, named placement kinds
- Repo: Terraforming Mars (GPL: idea only).
- What: a `Space` is a plain record (id, x, y, type, bonus, tile, owner). A board is declared row by row (`builder.row(r => r.land(STEEL).ocean().volcanic())`); the base class computes hex neighbours once into a map (`getAdjacentSpaces`, plus a clockwise variant that keeps the holes). Cards never filter spaces themselves: they name a placement kind (`'land' | 'ocean' | 'city' | 'isolated' | 'away-from-cities' | 'volcanic'...`) and `getAvailableSpacesForType` returns the legal spaces. Tests use an `EmptyBoard` fixture and `assertPlaceTile(player, input, type)`.
- Files: `src/server/boards/Space.ts`, `BoardBuilder.ts`, `Board.ts` (lines 42-135), `TharsisBoard.ts`, `PlacementType.ts`, `MarsBoard.ts` (118-135), `tests/testing/EmptyBoard.ts`, `tests/assertions.ts`, 15 board specs under `tests/boards/`.
- Why: "named placement kind in card data, one resolver in the board" keeps board rules out of the card language. Pairs with finding 1 (edges from the drawing instead of hex arithmetic).
- Size: M (new `board-model` component: spaces, adjacency, placement-kind resolver, fixture).
- Maturity: mature, about 6700 server tests by the repo's own count; but `Board.ts` mixes in expansion-specific costs (Ares), so take the shape, not the class.

### 11. Closed set of prompt kinds with a typed renderer registry
- Repo: Terraforming Mars (idea only).
- What: every question is one of about 20 input types (`and`, `or`, `option`, `amount`, `card`, `space`, `player`, `resource`...). Each has `toModel()` (what the client sees), `process(response)` (validates against what was offered, throws `InputError`) and a nested response type with a guard that rejects unknown fields. `OrOptions.reduce()` collapses zero or one option. The client maps type to component in one record checked with `satisfies`, so a new type without a component fails to compile. `SelectSpace` just carries the legal space ids; the board highlights them and asks to confirm.
- Files: `src/server/PlayerInput.ts`, `src/server/inputs/OrOptions.ts`, `SelectSpace.ts`, `src/common/inputs/InputResponse.ts`, `src/client/components/PlayerInputFactory.vue`, `SelectSpace.vue`.
- Why: `and`/`or` composition and a `space` kind are what a board game adds to card prompts; the exhaustive registry belongs in `prompt-gallery`.
- Size: M. Compare with the kit's prompt model first.
- Not to copy: inputs hold callbacks (`andThen(cb)`), which cannot be serialised; the kit's reducer needs the continuation as data.

### 12. `canExecute` derived from the same behaviour data as `execute`, with soft warnings
- Repo: Terraforming Mars (idea only).
- What: 618 of about 1100 card files declare `behavior: {...}`; 220 add a hand-written `bespokeCanPlay`/`bespokePlay`. One `Executor` has `canExecute(behavior)` and `execute(behavior)`. `canExecute` also attaches warnings to the card (`maxtemp`, `maxoceans`): playable, but part of it will do nothing. Counts are data (`Countable`: per tag, per city, per resource here).
- Files: `src/server/behavior/Behavior.ts`, `Countable.ts`, `Executor.ts` (start), `src/server/cards/base/Birds.ts`, `ArtificialLake.ts`.
- Why: the warning-on-the-card idea is the part beyond K91 (does-nothing check): show it on the card before the player commits.
- Size: S (pattern note for the card language).

### 13. Small ones
- **Module-boundary check at type level** (Lew Morski, idea): a file of imports each under `@ts-expect-error`; if an internal path ever becomes importable, `tsc` reports the unused directive. `rtt-lew-morski/src/encapsulation.check.ts`. Useful for "UI never touches the engine" freezes. S.
- **`query` channel** (RTT, ISC): `exports.query(state, role, what)` returns derived data on demand (supply lines, discard contents) instead of bloating every view. `docs/overview/module.md`, `framework.js` `exports.query`. S.
- **Rule-violation panel** (Paths of Glory, idea): the view carries `violations: check_rule_violations()` and supply warnings; the client lists them with space and piece links instead of blocking the move. `rules.js` view (467-570), `play.js` `update_violations`. S.
- **Array-as-set and array-as-map helpers** (RTT, ISC): sorted arrays with `set_add/has/delete`, `map_get/set`, so state stays plain JSON and deterministic. `docs/module/library.md`. S; only if `engine-core` lacks them.
- **Card tests** (TM, idea): `cast(input, SelectSpace)` to assert the kind of the open prompt and narrow its type in one call; `churn(action, player)` = defer, drain the queue, return the next prompt; table-driven `runs`. `tests/TestingUtils.ts`, `tests/cards/ICard.spec.ts`. S; K102 covers the rest.
- **Whole-catalogue consistency test** (TM, idea): one spec loops every manifest and checks face metadata against behaviour (a card with victory points must show them). `tests/cards/CardMetadata.spec.ts`. S; close to K83.
- **Asset and layout rules of thumb** (RTT, ISC): map at 75 dpi, 2x above 97 dpi, counters at 2x when zoomable, breakpoints at 400/800 px width and 600/800 px height. `NOTES.md`. Pattern note only.

## Not worth taking

- **TM deferred-action queue as built.** The mechanism (priority, then insertion order, optional per-player drain) is 140 lines and sound, but the `Priority` enum is a list of individual cards (`PHARMACY_UNION`, `OLYMPUS_CONFERENCE`, `ROBOTIC_WORKFORCE`), the queue special-cases one action class by `instanceof`, and entries are closures, so the queue cannot be saved or replayed. K94's priority table already holds the useful idea. Files: `src/server/deferredActions/Priority.ts`, `DeferredActionsQueue.ts`.
- **TM card-face render DSL** (`CardRenderer.builder`, 716 lines). The owner's games show the real card scans; it also returns an empty root on the live server, so it is a build-time export, not a runtime check.
- **TM solo mode.** No design: `isSoloMode()` is tested inline in about 20 places in `Game.ts` and about 40 card and helper files. The MarsBot automa folder was not read.
- **TM saving and undo.** Hand-written `serialize`/`deserialize` per class, a full snapshot per save id, undo = reload an earlier snapshot (`GameLoader.restoreGameAt`, `undoCount`). The kit's plain state and action history are already better.
- **TM i18n tooling** (`check_locales.ts`, `translation_audit.ts`): one-language games.
- **TM log builder.** Typed parts (`${0}` placeholders with player, card, space, resource data) are good, but K86 already specifies entries as data; only the `SPACE` part type is new, and finding 9 covers it.
- **RTT script language as text.** Compiled with `eval`, untyped, errors at load time; take the stack and step list, not the syntax.
- **RTT `rtt-patch` on live games, snapshots table, viewpoints, chat, notepad, tournaments, server.** Multiplayer or save-fixing work.
- **Paths of Glory `rules.js` as a model.** 10861 lines in one file, older flat state style, view built by hand field by field. Good for examples of where undo is cut, not for structure.

## Maturity, plainly

- TM: large, long-lived, heavily tested, GPL. Its good parts for us are shapes (board model, prompt algebra, behaviour/canExecute pairing); its engine is class- and callback-based and does not fit a pure reducer.
- RTT framework and tools: small, deliberately plain JavaScript, one main author, proven on dozens of published games; documentation is honest and partly unfinished (`guide.md` steps 1-2 say TODO, `world.md` marks WIP items). The tools (fuzz, test, patch, parse-layout) are the most directly reusable code found in either project, and ISC.
- `world.js` and the TypeScript module helper are newer and less settled than the rules framework.

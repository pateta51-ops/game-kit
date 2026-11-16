# The game store

One store holds the history and answers every prompt; screens only read the view and call `answer`, `undo`. The reference game's store still loops `appendAction` itself and will move to this pattern later; follow this page, not its store.

1. **History** is engine-core's (`undo.md`): the store keeps `history`, never a copy of the state. Undo takes back one step (one click), via `undoStep`.
2. **Answers** go through `answerWithForced(RULES, history, action, CONTENT, forced, { seat })`: the click and the forced answers after it are one undo step. At the start of the game, or when the turn reaches this seat, call `sendForced`. Code: [prompts.md](prompts.md) step 5.
3. **Paced steps.** The returned `events` go to paced-view `pushSteps` once; the screen shows the folded view until the queue is empty. To skip pacing, pass paced-view's `instant` callback to `pushSteps` (see components/paced-view/README.md).
4. **Autosave** after each accepted answer, through `saves` (`AUTO` slot); save the history, so undo survives a reload ([saves-settings-frame.md](saves-settings-frame.md)).
5. **The opponent's seat.** When the open prompt's `seat` is the opponent's, the store asks the opponent driver for a choice from that seat's own view (`view(state, seat)`, never the full state) and answers it as that seat, paced like the player's so the player sees it. Drivers: [ai-opponent.md](ai-opponent.md).
6. **Stale clicks:** compare the answer's prompt id with the open one and drop a mismatch.

Proof: tests for undo of a click with forced answers, a stale id, and save then load.

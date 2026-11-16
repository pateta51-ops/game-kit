# engine-core: debug edits (K100, opt-in)

Sources: ArkhamHorror `Debug*` messages and MarvelChampions card edits (halogenandtoast, no licence: ideas only); netrunner `commands.clj` (MIT: the verb list).

- A game opts in with `GameRules.debug` (a table of verbs, `{}` for the kernel verbs only) and `action: AnswerAction | DebugAction` in its `GameTypes`. Unset: `applyAction` refuses every debug edit.
- `DebugAction` = `{ kind: 'debug', verb, args? }` goes through `applyAction` like an answer, so history, undo, steps, saves and replay record it. `validateAction` checks the shape only.
- Kernel verbs: `set` `{ path, value, min?, max? }` writes a number at a state path through `own` (clamped; refuses kernel keys and a path that is not a number); `force` `{ values, name? }` queues results for the next `ctx.rng.int(max, name)` calls (an unnamed entry takes any call; clamped to `0..max-1`; the rng words do not move; kept in `state.forced`, removed when used up); `close` drops the open prompt and its resume task, then runs the stack.
- A game verb `(ctx, args) => string | undefined` writes the draft (summon a card, move it, set a status); words refuse it. It may not schedule tasks while a prompt is open.
- An edit keeps the open prompt as it was; a refused edit throws `IllegalActionError` (`DEBUG_REFUSED: ...`) and changes nothing; kernel edits emit no events and a game verb's events carry `debug: true`, so a log can skip them.
- A forced roll does not move the rng words, so `preview`'s hidden-information stop and the `randomWords` undo bar do not fire on it.
- `validateAction(state, action, game)` refuses a debug edit as `applyAction` does (without `game`, always refused).
- `debugVerbs(game)` lists the verbs for a console (`debug-console`).

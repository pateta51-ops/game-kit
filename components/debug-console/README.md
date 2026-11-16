# debug-console

A console line for the engine-core debug edits (K100). Needs `engine-core`. Tests: `console.test.tsx`.

- `parseDebug(line, verbs, params?)` -> `DebugAction` or `{ error }`. `verbs` is `debugVerbs(game)`. Syntax (slash optional): `/set path.to.number value [min] [max]` (numeric path parts are indexes), `/force n [n ...] [name=roll]`, `/close`, `/<game verb> key=value ...`; `params` names positional tokens per verb (`{ summon: ['card'] }` makes `/summon 9` mean `card=9`). Values read as JSON when they parse, else as text; quote text with spaces (`to="hand zone"`).
- `<DebugConsole verbs params? send className? />` (`ui.ts`): one input; Enter parses and calls `send(action)`, which applies it through the game's store (so it is recorded like an answer) and returns the refusal words or nothing; the last 50 lines show above the input, refusals marked; Up recalls the last command.
- The game decides where it is mounted (dev builds, a key) and which verbs it adds (summon, move, status).

## Look

`debug.css`: `--dbg-bg`, `--dbg-text`, `--dbg-error`, `--dbg-font`, `--dbg-z`.

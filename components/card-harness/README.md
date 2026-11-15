# card-harness

Card tests on real cards. Test code only; the engine imports nothing here but `createProbe`.

- **Probe** (`createProbe<D>()`): the engine calls `probe.note(d)` (or `note(() => d)`) where it settles a choice without asking. Off in the game.
- **Scenario** (`new Scenario(game)`): the game passes a `ScenarioGame<G, W, D>` over engine-core's `GameRules<G>`: `rules`, `content`, `start()` (the state to build on), `put(s, card, where)` (a new instance, its id) and its `probe`. Then `put`, `set`, `run(...tasks)`, `answer(...picks)`, `options`, `offered`, `events`, `notes`, `observe(read, fn)`. The rules' invariants run on the built position (`{ validate: false }` to skip).
- **Delivery** (`new Delivery(game)`): the game passes a `DeliveryGame`: `load(state)` into its own session, `dispatch(picks)` through the table's path returning the settings' answers, `prompt()`, `probe`, `silentNote`, `silentAuto`. `silentChoices()` lists viewer decisions nobody was asked.
- **Inventory** (`runInventory(input, out, check, io)`): `input.pieces` is the game's language as data, `{ kind, id, cite?, cards? }` of any kind (ops, dice patterns, formulas); `clauses` the distinct printed clauses by id and card ids (never text); `tests` from `testFiles(root, dirs)`; `baseline` the `kind:id` allowed uncited. A piece is cited by a test file matching a `cite` regex (default: its id as a word) or naming one of its cards (`directOnly` turns that off). Exit 1 when the report is stale (with `check`), a piece is uncited, or the baseline lists one cited or gone.
- **literalsOf(file, type, prop?)** (`./literals`, needs `typescript`): string literals of a type, or of one property of each union member, to build the piece list from the game's types.
- **Checks**: `describeCheck(cards, describe, validate?, tokens?)` (generated reading equals the printed text word for word, `[TOKENS]` both ways); `conforms<Same<A, B>>()` (schema type equals engine type, at compile time); `report(name, errors, log)` gives the exit code.

Known bugs are pinned as `it.fails('EXPECTED FAILURE: …')`.

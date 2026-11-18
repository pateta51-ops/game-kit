# card-harness

Card tests on real cards. Test code only; the engine imports nothing here but `createProbe`, and card-language imports the pure `strictProblems` from `strict.ts`. Not here: `validateEffect` in card-language checks one effect at run time, `strictProblems` checks a whole grammar in a test.

- **Probe** (`createProbe<D>()`): the engine calls `probe.note(d)` (or `note(() => d)`) where it settles a choice without asking. Off in the game.
- **Scenario** (`new Scenario(game)`): the game passes a `ScenarioGame<G, W, D>` over engine-core's `GameRules<G>`: `rules`, `content`, `start()` (the state to build on), `put(s, card, where)` (a new instance, its id) and its `probe`. Then `put`, `set`, `run(...tasks)`, `answer(...picks)`, `options`, `offered`, `events`, `notes`, `observe(read, fn)`. The rules' invariants run on the built position (`{ validate: false }` to skip).
- **Engine port** (K390): a game with its own engine passes a `ScenarioPort<G, W, D>` instead: engine-core's `EnginePort` (`content`, `start()`, `apply(s, answer)` returning the state or an `Error`, `settle(s)`, `prompt(s)` with options as `{ id, enabled, why? }`, `events(s)` the whole log, optional `invariants(s, content)`, `options(s)`, `put(s, card, where)`, `push(s, tasks)` for `run`) plus `probe` and `effects`. `G` is any `PortTypes` (`state`, `prompt`, `event`, `task`, `content`); prompt ids may be strings. Every Scenario method works the same; `run()` with tasks needs `push`.
- **Delivery** (`new Delivery(game)`): the game passes a `DeliveryGame`: `load(state)` into its own session, `dispatch(picks)` through the table's path returning the settings' answers, `prompt()`, `probe`, `silentNote`, `silentAuto`. `silentChoices()` lists viewer decisions nobody was asked.
- **Inventory** (`runInventory(input, out, check, io)`): `input.pieces` is the game's language as data, `{ kind, id, cite?, cards? }` of any kind (ops, dice patterns, formulas); `clauses` the distinct printed clauses by id and card ids (never text); `tests` from `testFiles(root, dirs)`; `baseline` the `kind:id` allowed uncited. A piece is cited by a test file matching a `cite` regex (default: its id as a word) or naming one of its cards (`directOnly` turns that off). Exit 1 when the report is stale (with `check`), a piece is uncited, or the baseline lists one cited or gone.
- **Printed lines** (K83): `lines` `{ id, records }` each owned by a record or in `openLines`; `records` `{ id, verb }` checked against `routes`; all fail `runInventory`. `clauseIds([{ kind, text }])` (K26): `kind-` plus the shortest unique word prefix.
- **literalsOf(file, type, prop?)** (`./literals` or `./literals/index`, needs `typescript`): string literals of a type, or of one property of each union member, to build the piece list from the game's types. K392: `literalsOf(file, type, { keys: true })` or `keysOf(file, type)` gives the sorted property names of an untagged union (`{ gain: number } | { draw: Draw }`); a member with several keys contributes all of them.
- **Inventory `titleOnly: true`** (default off): a piece with no `cite` and a clause count as cited only by an id in a test title (`it`/`test`/`describe`), not one in a comment.
- **Scenario `{ from: { state, events } }`**: starts from a built state and its events; the state is trusted, not validated unless `validate` is on.
- **Checks**: `describeCheck(cards, describe, validate?, tokens?)` (generated reading equals the printed text word for word, `[TOKENS]` both ways); `conforms<Same<A, B>>()` (schema type equals engine type, at compile time); `report(name, errors, log)` gives the exit code. `Is<z.infer<typeof S>, T>` is `Same<DR<..>, T>` (`DR` = deep readonly), for readonly game types.
- **parseCsv(text)**: RFC 4180 reader (quotes, doubled quotes, CRLF or LF); rows as header-keyed string records, blank lines dropped.
- **Strict checks** (`new Scenario(game, { strict: true })`): `script([picks], �)` answers the prompts that open next; `check(label, fn)` fails mid-run naming label and step; `done()` fails on a leftover scripted answer, an open prompt (strict), or equal entries in the game's optional `effects(state)`. Strict `answer` with no open prompt throws.
- **Ability trace** (`traceAbilities(registry, field = 'effects')`): pass `.registry` (the game's ability or card record, wrapped) as the content; `considered` holds ids looked up, `resolved` ids whose `field` was read to run. `expectResolved(trace, ...ids)` fails a test whose card never ran, saying looked up or never reached; `clear()` between parts.
- Walking the whole registry (`Object.values`, hashing, validation) through `.registry` marks every id looked up, and run if it reads `field`: trace only the content the engine reads to play.

- **K102 helpers**: a refused `answer` prints the open prompt and offered options (`open()`); `noPrompt()`; `changed([[label, read, delta]], fn)` lists every pair off; `literal()` or `scenarioLiteral(state, events)` gives a `{ from }` literal to paste; `withRewind(fn)` runs a branch and restores; `rulingGroups(describe)` gives `errata` and `faq` wrappers.
- **Record renderer** (K78, `renderRecords({ lines, records, templates })`): each printed line `{ id, text, open? }` followed by its records in English, one template per record `kind` (or `verb`); `say` renders nested pieces. A piece with no template prints `[render-gap kind: {json}]`, a field its template never read `[also {...}]`; `note(r)` adds a `note:` line, `kindOf`/`lineOf`/`idOf` read other shapes. Returns `text` for a reading judge (ok / wrong / ambiguous / render-gap per line), `lines` with each reading's `gaps`, and `stray` records naming no line.
- **Spec rows** (K77, `cardSpecs(name, game, rows, { describe, it })`): a row `{ line, name?, layout, act, expect }`; the game's `SpecGame` gives `records`, `play(layout, act, records, lenient)` and `check(result, e)` (a message or undefined). Two tests per row: it holds, and it fails with its line's records removed (`withoutLine`; `lenient` there: skip an answer nobody asks for). `specCoverage({ records, rows, titles?, exempt? })` gives `missing` lines (no row, no test title starting with the id) and `stale` exemptions.
- **Strict validator** (K97, `strictProblems(grammar, def, optOuts?)`): the grammar is data, `{ tag?: 'op', nodes: { kind: { keys, required?, binds?, scopes?, reads?, note? } }, ref?, given? }`; fails non-JSON values, unknown kinds, unknown keys (`wrong-place` when another kind owns the key), missing keys, a variable read before it is bound (`binds`: for later steps; `scopes`: for its children only). Opt-outs are data `{ rule, path?, citation }`; uncited or matching nothing fails. `grammarReference(grammar)` writes the workers' reference from it; `nodesOf(file, type, tag)` (`./literals`) reads kinds and keys from the engine's union, throwing when the anchor is gone.

- **cast** (K124): `sc.cast('kind')` returns the open prompt narrowed to that `kind`, or throws naming the kind found.
- **Round trip** (K114): `roundTripCards(game, [{ card, where, task? }])` puts each card in a minimal state; problems where the state is not plain JSON (`diffPaths`) or play from the JSON copy differs. `[]` passes.

Known bugs are pinned as `it.fails('EXPECTED FAILURE: …')`.
- **Content gate** (K169, `contentGate(input, log)`): the game script passes `packs` (`validate()` issues; warnings fail unless `allowWarnings`), `broken` packs each with the `code` and `severity` it must report, `generated` files compared with `readGenerated` ("stale: run `regenerate`"), and `features` `{ required, used }` (`requireAll` fails on an unused one). Returns `{ failed }`.

## Use it in 10 lines

```ts
import { Scenario } from '../kit/card-harness/index'
import { DICE_GAME } from '../kit/card-harness/fake/dice' // yours: a ScenarioGame over your GameRules

const sc = new Scenario(DICE_GAME).set((s) => void (s.dice = [2, 2, 5]))
const [twin] = sc.put('hand', 'twin') // a real card of your catalogue, in your hand
sc.run({ kind: 'play', card: twin as string })
console.log(sc.s.score, sc.events.map((e) => e.type)) // assert on state, events, options(), answer(...)
```

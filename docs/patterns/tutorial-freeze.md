# Pattern: tutorial freeze

Kit part: K15 (tutorial engine, base stcc; stage 4). The freeze step is welded to each game's engine and content: pattern only (SELECTION.md, "In-game helpers").

## Example (read, never edit)
- stcc `Star-trek-captains-chair-game` @ `9fc59643` (C:\projects\Star-trek-captains-chair-game): `src/tutorial/freeze.ts` (`freezePack`, `cutPack`, `neededCode`, `namedBy`); also `src/tutorial/{scenario,hash,registry}.ts` (names only) and `scripts/tutorial-freeze.ts` (not read).
- warps `warps-edge-fan-prototype` @ `2af6937`: `scripts/tutorial-freeze.ts` (refreeze rules, exit codes; ported from stcc).
- jarl `6f006a2` has no freeze: live content plus a seed.

## Why
The tutorial shows the text the owner approved. Live content may change after approval, so the script's content is pinned: the scenario plays on a frozen cut of the pack, and a later change to live printed text never alters what the tutorial says. Pictures stay live by card id.

## Pieces
1. **Scenario**: the setup (seats, decks, options, seed) the tutorial starts from, and one function that turns it into game options for a given pack id.
2. **`cutPack(live, scenario)`**: copy from the live pack exactly what the scenario can touch (the cards of its decks, both seats' leader cards, the AI's charts, tokens of those cards), then close over references with a queue: every card a copied definition names, until nothing new is named. `structuredClone` each copy; keep printed text with name, traits, suit and score.
2b. A missing id throws `FREEZE_SCENARIO: the live pack has no <what>`.
3. **`neededCode(pack)`**: walk the cut pack with a visitor and collect the ids of `custom` handlers and modules (code cannot be frozen). Store them in `needs`; loading checks the registry has them.
4. **`freezePack`** proves itself: (a) the frozen pack loads with no error (references resolve, customs and modules registered); (b) the game set up from it equals the game set up from the live pack, compared by state hash with the pack id blanked (`FREEZE_DIFFERS` if a card was left out). It throws all problems together (`FREEZE_INVALID`).
5. **Record** (`frozen.json`): `format`, `version`, `scenario`, `frozenOn`, `source { packId, version, dbSha, contentHash }`, `contentHash`, `textHash` (hash of the printed text), `needs`, `pack`.
6. **Check**: the record's `source` hash against live content: a drift is reported, never silently followed; the text hash catches edits to the frozen file.

## Script `tutorial:freeze` (warps)
`--dir <folder>` writes `frozen.json` after proving the script plays on that content, and refuses to overwrite an existing one. `--refreeze --decision docs/decisions/<file>.md` overwrites only when that file is a `.md` in `docs/decisions/`, has a line `Refreeze: <scenario id>`, says "owner", and has a file-name date after the freeze it replaces. Exit 0 written, 1 refused or the script does not play, 2 bad usage or missing file. IO is injected (`Io`) so tests need no disk.

## Kit version
The game supplies the scenario type, the list of what to copy, and the reference walker. The kit supplies the closure queue, the prove step, the record, the refreeze rule and the CLI.

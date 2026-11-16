# engine-core: randomness

## Non-deterministic play: recorded entropy

`AnswerAction` has an optional `reseed: RngWords`. When present, the kernel replaces `state.rng` with those words before the answer resolves; when absent nothing changes (saves, replays and goldens stay byte for byte the same). The words are part of the recorded action, so `replay`, `createSave`, `restoreSave` and `redo` reproduce the same game. `validateAction` refuses malformed words (`BAD_RESEED`). `freshWords()` (app side, uses `crypto.getRandomValues`; the kernel stays pure) returns four 32-bit words; the game's app decides when to attach `reseed`, e.g. `{ ...answer, reseed: freshWords() }`. `undo` is unchanged.

## Random: named override, undo bar (K108)

- `ctx.rng.int(max, name?)` and `shuffle(xs, name?)` take an optional name. In a test, `setRngOverrides({ add: (max) => 1 })` makes every call with that name return the forced value without touching `state.rng`; unnamed and unlisted calls stay seeded. `setRngOverrides(null)` clears it. Test code only.
- `GameRules.randomWords` (optional): when set, an action that changed `state.rng` bars Safe undo with that text, like a reveal (`randomReason`); Free allows it and, by step, marks `peeked`. Unset: nothing changes. Source: boardgame.io `MockRandom` and the random plugin's `isUsed`.

# achievements

The catalogue as data, achievements as pure functions over finished-game summaries, and the small summary written when a game ends. Nothing earned is stored, so a new definition applies to old games. Needs `play-stats`: the summary is a play-stats record and its store is `createPlayStats` (play-stats holds no summary of its own, only the game's fields). No packages; draws nothing (release 1.0: no motion, no sound). Tests: `achievements.test.ts`. K161 (feats inside a game) and K162 (screens) extend it.

## Summary

`GameSummary` = `{ id, at, v, result, lossReason?, rounds, counts, sets, practice? }`. `makeSummary(s)` sets `v` (`SUMMARY_VERSION`, 1; a field added later bumps it, older rows read as they are). `counts` are named numbers, `sets` named lists of keys (heroes, scenarios won). `createSummaryStore({ key, ... })` is `createPlayStats` with `validSummary` and latest-first order; the other play-stats options pass through. `record()` once when the game ends, `remove()` on an Undo past the end.

## Catalogue

`AchievementDef` = `{ id, name, text, family, points, checklist?, measure(games) }`; `measure` gives `{ current, target, done? }`. Builders: `countGames(pred, target)`, `bestCount(value, target)`, `checklist(keys, itemsOf)` ("win with every character"; give the same keys as `checklist` on the def so a screen can tick them).

## Reading

- `evaluate(defs, games)`: a `Status` per def (`earned`, `current`, `target`, `done?`); practice games never count.
- `newlyEarned(defs, before, after)`: ids earned by the newest game, for a call-out.
- `byFamily(defs, statuses)`: earned, total and points per family, for a list screen.

The game keeps its definitions' words, the meaning of its summary fields and its screens.

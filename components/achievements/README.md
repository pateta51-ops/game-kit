# achievements

The catalogue as data, achievements as pure functions over finished-game summaries, and the small summary written when a game ends. Nothing earned is stored, so a new definition applies to old games. Needs `play-stats`: the summary is a play-stats record and its store is `createPlayStats` (play-stats holds no summary of its own, only the game's fields). No packages; draws nothing (release 1.0: no motion, no sound). Tests: `achievements.test.ts`. K161 (feats inside a game) extends it.

## Summary

`GameSummary` = `{ id, at, v, result, lossReason?, rounds, counts, sets, practice? }`. `makeSummary(s)` sets `v` (`SUMMARY_VERSION`, 1; a field added later bumps it, older rows read as they are). `counts` are named numbers, `sets` named lists of keys (heroes, scenarios won). `createSummaryStore({ key, ... })` is `createPlayStats` with `validSummary` and latest-first order; the other play-stats options pass through. `record()` once when the game ends, `remove()` on an Undo past the end.

## Catalogue

`AchievementDef` = `{ id, name, text, family, points, checklist?, measure(games) }`; `measure` gives `{ current, target, done? }`. Builders: `countGames(pred, target)`, `bestCount(value, target)`, `checklist(keys, itemsOf)` ("win with every character"; give the same keys as `checklist` on the def so a screen can tick them).

## Reading

- `evaluate(defs, games)`: a `Status` per def (`earned`, `current`, `target`, `done?`); practice games never count.
- `newlyEarned(defs, before, after)`: ids earned by the newest game, for a call-out.
- `byFamily(defs, statuses)`: earned, total and points per family, for a list screen.

The game keeps its definitions' words, the meaning of its summary fields and its screens.

## Screens (K162, `ui.ts`, static)

`<AchievementList defs statuses words? />`: by family (earned / total, points), a row each with name, text, bar, "3 / 5", the checklist ticked; a locked row shows its text (how to earn it) and `words.locked`. It is a panel with no tab frame: put it in the campaign log's tab when `campaign` exists. Look: `achievements.css`, `--ach-*` variables.
`toastFor(defs, newlyEarned ids, { off, silent, holdMs })`: one `Toast` `{ ids, count, name, holdMs }` for all earns of a game, or null. `firstRun(storage, key)` is true once (pass as `silent`, so an old history is not announced). `toastSettings` is a settings section (toggle, hold 3/5/8 s); `toastSettingsWith({ title, toggle, hold, seconds })` words it. `<AchievementToast toast line? onClose? words? />`: centred; the game removes it after `holdMs`. Motion with 1.1, sound with 1.2.

## Feats inside a game (K161, `feats.ts`)

The game gives `track(event)` -> `{ counts?, seen? }` deltas; no engine import. `FeatState` (`emptyFeatState`, `feedFeats(st, ev, track)`) is plain data: keep it in the game state so Undo rewinds it. `detectFeats(defs, st, ev, owned)` with `FeatDef` `{ id, name, text, family, points, test(st, ev) }`: ids earned now. `createEarnStore(storage, key)`: `award(ids)` stores new ids once (after the save; returns the new ones); `tick(listId, keys)`/`ticks` fill a checklist across games; none of it is in the game state. `calloutsFor(before, game, { streakAt?, record? })`: first defeat, win streak, new record as `{ kind, n }` for the game to word (a streak fires once at `streakAt`, then only when it beats the best streak); `<FeatCallout text onClose? words? />` centres one.

## Use it in 10 lines

```ts
import { countGames, evaluate, makeSummary } from '../kit/achievements/index'

const defs = [{ id: 'win3', name: 'Winner', text: 'Win 3 games', family: 'wins', points: 5, measure: countGames((g) => g.result === 'win', 3) }]
const games = [makeSummary({ id: 'g1', at: 1, result: 'win', rounds: 5, counts: {}, sets: {} })]
console.log(evaluate(defs, games)) // [{ id: 'win3', earned: false, current: 1, target: 3 }]
```

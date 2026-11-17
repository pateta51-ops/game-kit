# Recipes

Short task guides for agents. Each names the components, the order, and the check that proves it. Component facts live in [CATALOG.md](../CATALOG.md) and each README; these pages never repeat them. Start at [AGENTS.md](../../AGENTS.md). In a game these pages are `kit/recipes/` and a component's README is `kit/<name>/README.md`.

## Paths

**Building a new game:** [new-game](new-game.md) (choose, scaffold, pull) → [game-systems](game-systems.md) (which component for flow, triggers, timing, data, opponent, campaign, screens) → the recipe of each system below → [simulations](simulations.md) → [agent-workflow](agent-workflow.md) (checks, `finish`, done).

**Working on a game batch:** `node kit/kit.mjs search <word>` → the recipe below → the README → build → `node kit/kit.mjs finish --comment` ([agent-workflow](agent-workflow.md)). The kit lacks something: "Kit gap" in the PR. A newer kit is needed: [upgrade-kit](upgrade-kit.md).

**Changing the kit:** [AGENTS.md](../../AGENTS.md) "Change the kit" → [agent-workflow](agent-workflow.md) (id, worktree, checks, finish) → the component's README and tests.

## Task → recipe → components

| Task | Recipe | Components |
|---|---|---|
| Start a new game on the kit | [new-game.md](new-game.md) | scaffold (`kit.mjs new`), the base set |
| Map each game system to its component | [game-systems.md](game-systems.md) | all below; reference-game |
| Rounds, turns and phases | [turn-flow.md](turn-flow.md) | turn-flow, engine-core |
| Timing windows, replacement, durations, state checks, triggers | [timing.md](timing.md) | engine-core (`timed.ts`) |
| Add a card-language effect or card trigger and test it on real cards | [card-effect.md](card-effect.md) | card-language, card-harness |
| Content: scans, transcription, checked data pack, patches, glossary | [content-pipeline.md](content-pipeline.md) | scan-ingest, transcription-check, content-pack, card-patches, glossary |
| The game store: history, undo, forced answers, autosave, opponent seat | [game-store.md](game-store.md) | game-store, prompt-host, paced-view |
| Add an AI opponent (rule-based, one `Bot`, K200 tuner, learned) | [ai-opponent.md](ai-opponent.md) | opponent, sim-pool, learned-opponent |
| An official solo automa (deck, priority table, difficulty) | [automa.md](automa.md) | automa, game-store |
| Run simulations, fuzz, bands, balance report | [simulations.md](simulations.md) | sim-pool, perf |
| Menu, set-up, saves, settings and app-frame wiring | [saves-settings-frame.md](saves-settings-frame.md) | screens, saves, settings, app-frame, resolution-frame |
| Show the engine's questions (prompt host) | [prompts.md](prompts.md) | prompt-host |
| Card table: zones, hand, piles, drag | [card-table.md](card-table.md) | card-zones, card-hand, card-pile, drag-drop |
| Board pieces: counters, flights, tracks, market, player board, attachments, bag, target arrow | [board-pieces.md](board-pieces.md) | counter, track, market-row, … |
| Build a card face and its zoom | [card-face-zoom.md](card-face-zoom.md) | card-parts, card-zoom |
| Dice (tray, odds, 3D) | [dice.md](dice.md) | dice-tray, dice-odds, pieces-3d |
| Phone mode | [phone-mode.md](phone-mode.md) | phone-mode |
| 1.1 effects, 1.2 sound, 1.3 voice | [effects-sound-voice.md](effects-sound-voice.md) | effect-library, sound-player, voice |
| Tutorials | [tutorial.md](tutorial.md) | tutorial |
| Replay and debug tools | [replay-debug.md](replay-debug.md) | replay-cli, debug-console |
| Upgrade a game's kit tag | [upgrade-kit.md](upgrade-kit.md) | `kit.mjs outdated`, `pull`, `check --source` |
| Work as an agent (worktree, ids, checks, briefs, finish, done) | [agent-workflow.md](agent-workflow.md) | `kit.mjs`, `scripts/agent.mjs` |

All of these are wired together in `components/reference-game`, a small generated card game that is the kit's contract test: read its README and `template/` to see the pieces fit.

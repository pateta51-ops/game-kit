# Recipes

Short task guides for agents. Each names the components, the order, and the check that proves it. Component facts live in [CATALOG.md](../CATALOG.md) and each README; these pages never repeat them. Start at [AGENTS.md](../../AGENTS.md).

| Task | Guide |
|---|---|
| Start a new game on the kit | [new-game.md](new-game.md) |
| Add a card-language effect and test it on real cards | [card-effect.md](card-effect.md) |
| Add an AI opponent (rule-based, K200 tuner, learned) | [ai-opponent.md](ai-opponent.md) |
| An official solo automa (deck, priority table, difficulty) | [automa.md](automa.md) |
| Run simulations and sanity bands | [simulations.md](simulations.md) |
| Timing windows and triggers | [timing.md](timing.md) |
| Rounds, turns and phases | [turn-flow.md](turn-flow.md) |
| Saves, settings and app-frame wiring | [saves-settings-frame.md](saves-settings-frame.md) |
| Phone mode | [phone-mode.md](phone-mode.md) |
| 1.1 effects, 1.2 sound, 1.3 voice | [effects-sound-voice.md](effects-sound-voice.md) |
| Tutorials | [tutorial.md](tutorial.md) |
| Replay and debug tools | [replay-debug.md](replay-debug.md) |
| Show the engine's questions (prompt host) | [prompts.md](prompts.md) |
| Build a card face and its zoom | [card-face-zoom.md](card-face-zoom.md) |
| Dice (tray, odds, 3D) | [dice.md](dice.md) |
| Card table: zones, hand, piles, drag | [card-table.md](card-table.md) |
| Board pieces: counters, flights, tracks, market, player board, attachments, bag, target arrow | [board-pieces.md](board-pieces.md) |
| The game store: history, undo, forced answers, autosave, opponent seat | [game-store.md](game-store.md) |
| Content: scans, transcription, patches, glossary | [content-pipeline.md](content-pipeline.md) |
| Upgrade a game's kit tag | [upgrade-kit.md](upgrade-kit.md) |
| Work as an agent in this repo (worktree, ids, finish) | [agent-workflow.md](agent-workflow.md) |

All of these are wired together in `components/reference-game`, a small generated game that is the kit's contract test: read it to see the pieces fit.

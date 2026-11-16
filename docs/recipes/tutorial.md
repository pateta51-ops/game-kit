# Tutorials

Component: [`tutorial`](../../components/tutorial/README.md) (needs `engine-core`, `state-machines`). Pattern: [tutorial-freeze.md](../patterns/tutorial-freeze.md).

1. **Script as JSON**: `seed`, `title`, `steps` (`id`, `narration`, `targets`, `do`, `asks`, `expect`), `end`. `do` is `move` (one locked answer), `next` (explain only) or `auto` (Next plays these answers). Load with `parseScript`; it returns every problem as `path: message`.
2. **Game adapter** (`TutorialGame`): rules, content, how to find an option by ref (`findOption`), the highlight target ids in the game's own spelling.
3. **Play it headless**: `playScript(game, script)` plays every step on the seed and reports the first failure (`formatFailure`). Put it in the game's check so a rules change that breaks the tutorial fails CI.
4. **Lock**: `lockAt` / `lockPrompt` allow only the scripted answer; `refusal` is the message.
5. **Find a seed** whose line of play fits the script with the seed search; build the script from a seed's line of play with the build tooling (K36); the readable script document lists each step's answers in on-screen words.
6. **UI**: `TutorialPanel` and `Highlight` (React, `ui.ts`); a docked side with a reserved-space CSS variable shrinks the screen beside the panel.
7. Words shown are the game's printed words; no rule ids on screen (`plain-text`).

Proof: `playScript` green, the script document reviewed, an e2e run through the real UI (`e2e.ts`).

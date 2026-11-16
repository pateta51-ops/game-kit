# Start a new game on the kit

1. **Find components.** `node ../game-kit/kit.mjs search <word>` or read [CATALOG.md](../CATALOG.md). Every game starts with `engine-core` (it is the engine), `state-machines`, `app-frame`, `settings`, `saves`, `sim-pool`, `card-harness` (tests on real cards).
2. **Pull the tooling first** (these shape the check chain): `plan-checker`, `repo-gate`, `traceability`, `check-runner`, `ci-templates`, `bundle-size`, `lint-preset`, `theme-check`, `plain-text`.
   ```bash
   node ../game-kit/kit.mjs pull ../game-kit <tag> engine-core sim-pool saves settings app-frame
   node kit/kit.mjs check
   ```
   `pull` adds each component's `needs`. Commit `kit/`. Never edit it (see [AGENTS.md](../../AGENTS.md)).
3. **Write the game's engine** against `engine-core`: a `GameTypes` bundle and one `GameRules<G>` (`handlers`, `blank`, `setup`, `contentHash`, optional `stamp`, `invariants`, `revealWords`). The model to copy is `components/engine-core/fake/counter.ts`. Import from `index.ts` only.
4. **Wire the check chain** with `check-runner`: lanes for lint, types, tests, `kit.mjs check`, `repo-gate`, `traceability`, `bundle-size`. CI comes from `ci-templates` (`ci.config.json`, `render.mjs`), never hand-written.
5. **Add the sim module** (`simGame` for `sim-pool`) as soon as one prompt can be answered, so fuzz catches engine bugs from day one ([simulations.md](simulations.md)).
6. **Screens**: `app-frame` routes, `settings` schema, `saves` over engine-core's save file ([saves-settings-frame.md](saves-settings-frame.md)). The look comes from the director's wireframes and the game's token file, never from guesses.
7. **Rules and looks are never decided by you.** Ask the arbiter or director session, or write the question in the PR.

Proof it works: `node kit/kit.mjs check`, then the game's own `npm run check` on the self-hosted runner.

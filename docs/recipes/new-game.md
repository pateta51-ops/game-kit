# Start a new game on the kit

1. **Start in one step:** `node ../game-kit/kit.mjs new <dir> <id> "<Name>"` registers the port block, writes the repo, pulls the kit, makes the first commit and creates the private GitHub repo with delete-branch-on-merge; re-running skips what is done, `--no-remote` skips git and GitHub; `--existing` is for a repo that already has files and history: it writes only new files, lists any clash and writes nothing, and commits nothing. Then commit `ports.json` and `docs/PORTS.md` in game-kit. Steps 3-4 below are then partly done: only add what `new` did not.
2. **Find components.** `node ../game-kit/kit.mjs search <word>` or read [CATALOG.md](../CATALOG.md). Every game starts with `engine-core` (it is the engine), `game-store` (one `defineGame` object, one store: [game-store](game-store.md)), `state-machines`, `app-frame`, `settings`, `saves`, `sim-pool`, `card-harness` (tests on real cards).
3. **Pull the tooling first** (by hand only if not using `new`; these shape the check chain): `plan-checker`, `repo-gate`, `traceability`, `check-runner`, `ci-templates`, `bundle-size`, `lint-preset`, `theme-check`, `plain-text`.
   ```bash
   node ../game-kit/kit.mjs pull ../game-kit <tag> engine-core sim-pool saves settings app-frame
   node kit/kit.mjs check
   ```
   `pull` adds each component's `needs`; a game holds one kit tag (a later `pull <tag>` moves all of it; `outdated` shows what changed). Commit `kit/`. Never edit it (see [AGENTS.md](../../AGENTS.md)).
   **Ports** (by hand, if not using `new`): take the game's port block: `node ../game-kit/tools/game-server/server.mjs add <id> "<Name>" <repo path>`. Set vite `server.port`, `preview.port` and the Playwright port to what it prints; commit `ports.json` and `docs/PORTS.md` in game-kit. Never invent a port ([PORTS.md](../PORTS.md)).
4. **Write the game's engine** against `engine-core` (`new` leaves a stub `GAME_DEF = defineGame(...)` in `src/engine/rules.ts`, a store in `src/ui/store.ts`, one screen in `src/ui/App.tsx`: replace the stub, keep the shape): a `GameTypes` bundle and one `GameRules<G>` (`handlers`, `blank`, `setup`, `contentHash`, optional `stamp`, `invariants`, `revealWords`). The model to copy is `components/engine-core/fake/counter.ts`. Import from `index.ts` only.
5. **Wire the check chain** with `check-runner`: lanes for lint, types, tests, `kit.mjs check`, `repo-gate`, `traceability`, `bundle-size`. CI comes from `ci-templates` (`ci.config.json`, `render.mjs`), never hand-written.
6. **Add the sim module** (`simGame` for `sim-pool`) as soon as one prompt can be answered, so fuzz catches engine bugs from day one ([simulations.md](simulations.md)).
7. **Screens**: `app-frame` routes, `settings` schema, `saves` over engine-core's save file ([saves-settings-frame.md](saves-settings-frame.md)). The look comes from the director's wireframes and the game's token file, never from guesses.
8. **Rules and looks are never decided by you.** Ask the arbiter or director session, or write the question in the PR.

Proof it works: `node kit/kit.mjs check`, then the game's own `npm run check` on the self-hosted runner.

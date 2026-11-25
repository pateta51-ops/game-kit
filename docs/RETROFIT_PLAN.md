# Retrofit plan (15 Nov 2026)

**Historical rollout schedule. The standing retrofit policy is in the repository README.** For current implementation, see [the upgrade recipe](recipes/upgrade-kit.md).

Status: approved by the owner, 15 Nov 2026. All seven games are active. No Fable workers: Sonnet for routine work, Opus at medium effort for engine work.

Scope: the recommended retrofit only. Old games take the kit's tooling; the kit takes what the old games do better. Engines and card code stay as they are. Presentation is retrofitted since 18 Nov 2026 (section "Motion retrofit" below).

Games: Jarl, Rome, EBR, Warp's Edge, STCC, Unstoppable, Imperium. Each batch pulls the newest kit tag (v0.21.0 on 15 Nov 2026).

## Part A - harvest into the kit (first)

Owner, 15 Nov 2026: enrich the kit first, then retrofit the games.

1. One read-only review per game compares its `origin/main` with every kit component and lists what the game has that the kit lacks or does worse (`docs/evaluation/harvest/<game>.md`). The games have not moved since the 14 Nov selection, so the reviews start from `docs/evaluation/` and look at what was not taken.
2. The candidates are merged into rows in `docs/PLAN.md` with source game and commit. Size S and M are built at once, one worker batch per component, the usual way; size L waits for the owner.
3. A tag after the last batch. The retrofits pull that tag.

Known today:
- Unstoppable: its browser-synth sound recipes as a no-files fallback (noted in the evaluation, not taken); `enumerateAnswers` (already row K25).
- Warp's Edge: motion and sound work merged after the 14 Nov selection.
- STCC and EBR: every-card test tooling beyond what `card-harness` took.

Each RT batch adds what it still finds.

## Part B - tooling into the games (after Part A)

Components, none of which imports game code: `plan-checker`, `traceability`, `repo-gate`, `check-runner`, `ci-templates`, `bundle-size`, `theme-check`.

| Batch | Game | Size | Why this place in the order |
|---|---|---|---|
| RT1 | Jarl (pilot) | S | most of these components were lifted from Jarl, so the swap is nearly a no-op and proves pull, lock and `kit check` in an old repo |
| RT2 | Rome | M | same engine line as Jarl, quiet repo |
| RT3 | EBR | M | check-runner and bundle-size came from EBR |
| RT4 | Warp's Edge | M | engine frozen: tooling only touches scripts and CI |
| RT5 | STCC | M | largest check chain; its runner names go in as data; adversarial review before merge |
| RT6 | Unstoppable | M | weakest tooling, so the largest gain, and the most likely to turn red (see below) |
| RT7 | Imperium | M | added by the owner; the batch reads the game first |

After RT1 the owner sees what changed and what it cost, and says go or stop for the rest.

**One batch does this:**
1. Read the game's check chain, CI workflow and its own copies of the seven tools on `origin/main`.
2. `node C:/projects/game-kit/kit.mjs pull C:/projects/game-kit <tag> <components>` into `kit/`.
3. Point the game's `package.json` scripts and CI at `kit/`; delete the game's own copies and their tests.
4. Keep what is the game's own as data: runner names, size limits, rule-id ranges, extra lanes (for example Unstoppable's Python job).
5. Add `node kit/kit.mjs check` to the check chain.
6. Gate: the game's full gate green on its own runner, once, at merge.

**When the kit's version is stricter and the game turns red:** the worker lists the failures and stops. A handful of S fixes outside the engine go in the same pull request. Anything in the engine, or more than that, goes to the owner: fix the game, or set the rule to the game's old level in its data.

**When the game's tool does something the kit's does not:** it becomes a row in Part A, the kit gains it by addition, and the game pulls the new tag. The kit copy is never edited in the game.

`theme-check` is pulled only by a game whose colours and fonts already sit in a token file; otherwise it is skipped and noted.

## Part B result (16 Nov 2026, kit v0.22.0)

All seven merged. A game took a kit tool only where it was at least as strict as its own.

| Game | From the kit | Kept its own |
|---|---|---|
| Jarl | plan-checker, traceability, repo-gate, ci-templates | theme check |
| Rome | plan-checker, repo-gate, ci-templates | traceability |
| EBR | check-runner, bundle-size, plan-checker | traceability |
| Imperium | plan-checker, bundle-size, ci-templates (gate slot) | traceability |
| Warp's Edge | plan-checker, ci-templates (gate slot) | repo gate, traceability |
| STCC | plan-checker, ci-templates (gate slot) | bundle size, traceability, repo gate, check runner |
| Unstoppable | repo-gate, ci-templates | plan checker, traceability, bundle size |

## Part C - second pass (owner, 15 Nov 2026: "go on wave 3")

Wave 3 (K67 to K74 in `docs/PLAN.md`) gave the kit's tools the options the games' own tools had; tag v0.25.0. Each game then pulls that tag and replaces a tool it kept, one pull request per game, under the Part B rule: the kit's tool goes in only when, with the game's options, it passes and fails what the game's own does. A tool that still differs stays, and the difference is a new row.

Result (16 Nov 2026, all seven at v0.25.0):

| Game | Newly from the kit | Still its own (row in `docs/PLAN.md`) |
|---|---|---|
| Jarl | workflows rendered from `ci.config.json`, the kit's full gate | theme check (K135) |
| Rome | traceability | - |
| EBR | - | traceability (K136) |
| Imperium | - | traceability (K136) |
| Warp's Edge | traceability | repo gate (K137) |
| STCC | bundle-size | traceability (K136), repo gate (K137), check runner (K138) |
| Unstoppable | traceability, bundle-size | plan checker (K139) |

Only Jarl's workflows could be rendered from the templates (K141). The third pass is Part E.

## Part D - Under Falling Skies (assessed 16 Nov 2026, kit v0.33.0)

The eighth game, a solo game (no opponent AI: the aliens are engine rules). Read on `origin/main` 07238a4 (12 Oct 2026, the self-hosted CI merge); no open pull request. Phases 0 to 10 merged; Phase T (real tiles) under way; Phase 11 waits for it. Its two-player-only kit items (search driver, versus-Claude, Rust tooling) do not apply.

**Its tooling today:** `npm run check` is a plain `&&` chain (lint, typecheck, `test -- --coverage`, `content:validate`, `trace`, `sim:smoke`, `plan:check`, build). `plan:check` is a Node wrapper around an older `plancheck.py` (254 lines, no session plan). `trace` is its own 55-line check. No repo gate, no size gate, no theme check, no full gate. `ci.yml` runs on pull requests and by hand only (decision 041), on `[self-hosted, linux]` (decision 043): `npm run check`, Playwright's Chromium (no `--with-deps` on the self-hosted PC), `npm run e2e`, the Playwright report uploaded on failure.

**Kit to game** (each kit tool tried on the game's files where it could run without installing):

| Component | Decision | Why |
|---|---|---|
| `plan-checker` | Pull | A superset of the game's copy. On the game's plan: the game's copy finds 221 ids, the kit's 230, both OK; the kit's needs `--sessions-optional` (the plan has no session plan) |
| `traceability` | Keep own until K172 | The kit's is stricter in two ways (it also reads the §3.18 interpretation table, so `IR-32` has no test title; it can check the 109 scenarios) but lacks the game's rule that every engine handler file in `src/engine/phases`, `rules`, `abilities` cites a rule id. With the config in step 9 the kit's finds exactly `IR-32` |
| `repo-gate` | Pull | The game has none |
| `check-runner` | Pull | All failures in one run instead of the first; same checks |
| `ci-templates` | Pull for the full gate and the runner scripts; `ci.yml` stays the game's until K141 | The kit's `ci.yml` runs only `npm run check` and moves e2e to the full gate, looser per pull request than the game's (check and e2e on every pull request) |
| `bundle-size` | Pull | The game has none |
| `theme-check` | Not pulled, noted | Its tokens sit in `src/ui/theme/tokens.css`, but 28 lines in 10 `.tsx` files hold colour literals (board glyphs, effects, die faces): the Part B rule skips it |
| `lint-preset`, `e2e-helpers`, `tooling-scripts` | N/A | Engine lint (a red finding would need engine edits), test helpers the game has its own of, manual tools; pulled when a game plan asks |
| `engine-core`, `sim-pool`, `replay-cli`, `perf`, `card-harness`, `card-patches` and the rest | N/A | Engine, card code and presentation are not retrofitted |

**Game to kit:** rows K172 and K168 to K170 in `docs/PLAN.md` (wave 5): the per-file citation rule; the two-transcription and owner-verification pipeline of Phase T; the content gate's broken-pack, stale-file and feature-coverage checks; the coach (first-time tips and driver suggestions with reasons). Its browser-synth sound is already noted under Part A (Unstoppable); its proof sheet is the existing pattern.

**Privacy guard found** (owner, 16 Nov 2026: removed from every game): `vite.config.ts:6-9` (`PUBLIC_BUILD=1` refuses a build while `public/packs/real` exists); `docs/BUILD_PLAN.md:92` (D3, "an optional placeholder-only public build fails if real assets are present") and `:143` (the `PUBLIC_BUILD=1` rule). No guard script, no Pages workflow. The `.gitignore` line for `public/packs/real/` stays: it keeps a local copy out of git, it guards nothing at build time.

**RT8 - one batch (M), one Sonnet worker at medium effort, in a worktree of the game:**

1. Branch `rt8-kit-tooling` from the game's `origin/main`; link `node_modules` from the main checkout (not committed).
2. `git -C C:/projects/game-kit fetch --tags`, then from the game's root: `node C:/projects/game-kit/kit.mjs pull C:/projects/game-kit v0.33.0 plan-checker repo-gate check-runner ci-templates bundle-size`. Commit `kit/`.
3. `eslint.config.js`: add `'kit/**'` to `ignores` (the kit's files are not the game's to lint). `tsconfig.json` and `vitest.config.ts` do not include `kit/`: leave them.
4. Plan check: `"plan:check": "node kit/plan-checker/plancheck.ts --sessions-optional"` (the plan path defaults to `docs/BUILD_PLAN.md`). Delete `scripts/plan-check.mjs` and `scripts/plancheck.py`; change the `AGENTS.md` line "scripts/plancheck.py is committed with the plan" to name `kit/plan-checker/`. `ci.yml` keeps its `setup-python` step.
5. Repo gate: copy `kit/repo-gate/repo-gate.config.example.json` to `repo-gate.config.json` with `artFolder: "public/art/"`, `engineFolders: ["src/engine/"]`, `engineAllowed: ["src/engine/types/"]`, `contentDir: "content"`, `skipText: ["docs/"]`, the rest as the example; copy `runners.example.json` to `tools/repogate/runners.json` with the machine name of the repository's runner (`gh api repos/pateta51-ops/under-falling-skies-fan-prototype/actions/runners -q '.runners[].name'`). `"repo-gate": "node kit/repo-gate/repo-gate.ts"`.
6. Size: `"size": "node kit/bundle-size/check-bundle-size.ts --dir dist --initial-budget <n> --chunk-limit <n>"`. Measure once after `npm run build` (`--json`), set each limit to the measured size plus 10 % rounded up to 10 KB, and record the two numbers and the date in a new `docs/decisions/` file.
7. Check runner: `"test:coverage": "vitest run --coverage"`, `"kit:check": "node kit/kit.mjs check"`, `"ci:render": "node kit/ci-templates/render.mjs --check"`; rename the chain to `"check:chain": "npm run lint && npm run typecheck && npm run test:coverage && npm run content:validate && npm run trace && npm run sim:smoke && npm run plan:check && npm run repo-gate && npm run kit:check && npm run ci:render && npm run build && npm run size"` and set `"check": "node kit/check-runner/check-runner.ts"`. `check-runner.config.json`: `{ "checkScript": "check:chain", "first": [], "lanes": [["lint"], ["typecheck", "build", "size"], ["test:coverage"], ["content:validate", "trace", "sim:smoke", "plan:check", "repo-gate", "kit:check", "ci:render"]], "timeoutMinutes": 15 }`. `ci.yml` still runs `npm run check`.
8. Full gate: `ci.config.json` `{ "repo": "pateta51-ops/under-falling-skies-fan-prototype", "runnerLabel": "linux", "workflows": ["full-gate.yml"], "e2eScripts": ["e2e"] }`, then `node kit/ci-templates/render.mjs` and commit `.github/workflows/full-gate.yml`. Keep `ci.yml` as it is (pull requests and by hand only, e2e on every pull request). After K141 merges, a later pull renders `ci.yml` too with `"push": false` and its steps.
9. Traceability stays the game's (`scripts/check-traceability.ts`, `scripts/trace.config.json`) until K172 is tagged. Then pull `traceability` at that tag, with `trace.config.json`: `idPattern` `\b[A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*-\d{2}\b`, `idsAtLineStart: true`, `deferredPrefixes` `CAMP-`, `CH1-` to `CH4-`, `L-` (§3.20 leads), `deferred` `{ "GEN-01": ... }`, `countDescribe`, `countSkipped`, `maxIdsPerTitle: 0`, `reportUnknown: false`, `requireComment: false` (16 ids have no code comment today), `scenarioPrefix: ""` (or `SC` with `scenarioDigits` `2,3`: all 109 are titled, one in two titles), `citeFiles` the three handler folders; `"trace": "node kit/traceability/check-traceability.ts --strict"`; add `IR-32` to the title of the test that proves END-04; delete the game's script.
10. Remove the privacy guard listed above: the `PUBLIC_BUILD` block in `vite.config.ts` and its two plan lines (D3 keeps "Local only").
11. Stays the game's: `content:validate`, `sim*`, `golden*`, `replay`, `real:*`, `proof`, `content:build`, `art:build`, `pack:link`, the e2e suite and its helpers, the engine lint in `eslint.config.js`, `ci.yml`, and everything under `src/`.
12. Gate: CI on the game's runner (label `linux`), then the full gate once at merge. A red finding from a stricter kit tool: Part B's rule (S fixes outside the engine in the same pull request, the rest to the owner).

## Part E - third pass (owner, 16 Nov 2026: "tackle the open questions")

Wave 4 (K135 to K141) and K172 built; each game pulled v0.41.0 (Under Falling Skies v0.42.0) and swapped what now passes and fails as its own did. One pull request per game, merged on green. Port clashes for hand-started gates removed at the same time: Warp's dev server 4199 to 4198 (Rome keeps 4199), STCC 4173 to 4176 (Imperium keeps 4173), Under Falling Skies 4173 to 4177.

| Game | Newly from the kit | Still its own (row in `docs/PLAN.md`) |
|---|---|---|
| Jarl | theme check (icon `d="M` rule accepted as a small loss) | - (K182) |
| Rome | `ci.yml`, `full-gate.yml` rendered | - |
| EBR | traceability | `ci.yml`, `verify.yml` (K190) |
| Imperium | plan checker (TypeScript) | traceability: the kit's finds GEN-02 untested (a card exception, `b605-s10`, has no row in BUILD_PLAN 3.20: a rules question for the game); `ci.yml`, `full-gate.yml` (K190) |
| Warp's Edge | repo gate, `ci.yml` | `full-gate.yml` (K190) |
| STCC | traceability, check runner, `ci.yml` | repo gate (K181), `full-gate.yml` (K190) |
| Unstoppable | plan checker, `ci.yml` | - (its size script already wraps the kit's) |
| Under Falling Skies | traceability (K172; RT8 step 9 done) | - |

A game script a test imports stays in the repo unused by the check chain.

## Not retrofitted

- `engine-core`, `state-machines`, `sim-pool`, random numbers, hashing: nothing a player would see, and a swap changes determinism, so replays, golden files and the every-card programmes would have to be proved again.
- `card-harness`, `motion-frame`, `effect-library`, `sound-player`, `voice`, `saves`, `settings`, `app-frame`, `phone-mode` where the game has its own.
- A feature a game lacks altogether (bug reporter, glossary, offline install, tutorial) is new work for that game, not part of this plan. It is planned by that game's planner as a kit pull when the owner wants the feature.

## Unstoppable (inspected 15 Nov 2026, `origin/main` 9e666b4)

- **State:** version 0.1 done (phases 0 to 10, the Harbinger boss), 285 commits, last commit 14 Oct 2026. No open pull request. The two other bosses sit on unmerged branches (`boss-duomo`, `boss-triumvirate`); about 20 old remote branches. The local clone is 21 commits behind and holds two untracked private pack files, which stay.
- **Tooling it has:** an old plan checker (139 lines, lacks the session plan and id ranges), its own traceability (257 lines) and bundle-size (181) checks, a plain `&&` check chain where the first failure hides the rest, a 99-line CI workflow with no full gate. No repo gate, no theme check.
- **What RT6 gives it:** all failures reported in one run, the repo gate, the current plan checker, the stricter traceability titles, a full gate.
- **What it lacks as features:** bug reporter, glossary, tutorial, offline install. It has settings, saves, a proof sheet, undo and synthesised sound.
- **Engine:** the older line (canonical JSON without the speed change, random numbers without the draw helpers). Left alone.
- **To settle in RT6:** CI runs on `[self-hosted, Linux]` and no runner for this repo is on record, so the batch first finds or installs one from `ci-templates`. `deploy.yml` is a switched-off public Pages workflow; the rule is that project content is never deployed publicly, so the batch deletes it (owner, 15 Nov 2026: delete if needed). The handoff docs name `D:\projects`; the clone is in `C:\projects`.

## Rules for every batch

- One game, one pull request, based on `main`.
- The game's engine folder is not touched.
- A game pins the tag it was retrofitted at and pulls a newer one only when it needs something.
- STCC: no branch from before the 29 Oct history rewrite is merged.
- Worktrees and branches are cleaned up in the same turn as the merge.

## Card parts into the old games (owner, 17 Nov 2026)

STCC, Imperium and Unstoppable are retrofitted onto `card-hand`, `card-pile` and `drag-drop`: Imperium first, then STCC, then Unstoppable. Each keeps its own look through the parts' `data-part` hooks and size tokens; its layout stays its own. Retrofitting the other new parts (counter, token-flights, track, market-row, player-board, card-attachments, token-bag, target-arrow, deck-motions) into those games waits for the owner.

## Motion retrofit (owner, 18 Nov 2026)

Replaces the 15 Nov "tooling only" rule for presentation. Every game's animations are rebuilt on `motion-frame` (ordered beat queue) and `effect-library`; effects first made for one game go into the kit under neutral names with the game's look as settings, and the game's own motion code is deleted, so a fix in one game reaches all. Trigger: STCC plays the animations after End turn grouped by kind, not in the order the cards resolved, and its log jumps ahead. Every retrofitted game plays one beat per event (or chunk) in event order and reveals each log line when its beat starts.

Study: `docs/MOTION_RETROFIT_STUDY.md`. Rows K323-K341 in `docs/PLAN.md`: mechanism gaps first (M1, M2, M5, then M3, M4, M6, M7, M8), then four effect batches, then the games one at a time (STCC, Warp's Edge, Imperium, Unstoppable, 7th Inning Stretch), each after asking its architect and ending with the owner's approval of a before/after recording of a full turn at 4K. Then the same study for EBR, Rome, Radiance, Rise of a Jarl and Under Falling Skies.

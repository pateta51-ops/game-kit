# Retrofit plan (15 Nov 2026)

Status: approved by the owner, 15 Nov 2026. All seven games are active. Workers run on Fable at low effort.

Scope: the recommended retrofit only. Old games take the kit's tooling; the kit takes what the old games do better. Engines, card code and presentation layers stay as they are.

Games: Jarl, Rome, EBR, Warp's Edge, STCC, Unstoppable, Imperium. Each batch pulls the newest kit tag (v0.21.0 on 15 Nov 2026).

## Part A - harvest into the kit (first)

Owner, 15 Nov 2026: enrich the kit first, then retrofit the games.

1. One read-only review per game compares its `origin/main` with every kit component and lists what the game has that the kit lacks or does worse (`docs/evaluation/harvest/<game>.md`). The games have not moved since the 14 Nov selection, so the reviews start from `docs/evaluation/` and look at what was not taken.
2. The candidates are merged into rows in `docs/PLAN.md` with source game and commit. Size S and M are built at once, one worker batch per component, the usual way; size L waits for the owner.
3. A tag after the last batch. The retrofits pull that tag.

Known today:
- Unstoppable: the tested public-build guard (the kit's privacy guard is not built); its browser-synth sound recipes as a no-files fallback (noted in the evaluation, not taken); `enumerateAnswers` (already row K25).
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

Known differences left after wave 3: `traceability` scans text where EBR parses TypeScript; `plan-checker --tsc` takes one section where Unstoppable compiles three; `bundle-size` flag names differ from Unstoppable's.

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

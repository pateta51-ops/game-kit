# Kit build plan

Sources and reasons: `docs/SELECTION.md`. One worker batch per row unless marked. State is updated here as batches land.

## How a batch works

1. Lift the base from the source commit named in `docs/SELECTION.md` into `components/<name>/`.
2. Make it generic: replace every import of game code with a small interface or data the game supplies. Add the grafts.
3. Bring its tests; add a tiny fake game in the tests where the component needs one.
4. Write `component.json`: source game, commit, paths, licence notice, other components it needs. A component a game calls or mounts also gets a `README.md` of 30 lines at most: what the game passes in and, for one that draws, a "Look" section naming the variables a game sets to skin it.
5. Review, CI green on the runner, merge, tag.

Kit code compiles under the strictest TypeScript settings in use (Jarl's), so it compiles in any game.

## Stage 1 - foundation (approved 14 Nov 2026)

| Batch | Content | Effort | State |
|---|---|---|---|
<!-- rows: Stage 1 - foundation (approved 14 Nov 2026) -->

Stage 1 is complete in v0.2.0.

Known limit (engine-core): the single-copy guard stops two copies loaded from two different paths. It does not see one file loaded twice under two module systems; that happens only when a game engine module sits outside a package with `"type": "module"`. A game keeps its engine and its `kit/` folder in one such package.

## Stage 2 - when the next new game starts its build

| Batch | Content | Effort |
|---|---|---|
<!-- rows: Stage 2 - when the next new game starts its build -->

## Stage 3 - with the release ladder

| Batch | Content | Effort | Release |
|---|---|---|---|
<!-- rows: Stage 3 - with the release ladder -->

## Stage 4 - only on the owner's word

| Batch | Content | Effort |
|---|---|---|
<!-- rows: Stage 4 - only on the owner's word -->

## Asked for by a game

A game's build plan lists the kit work it needs as phases named `GK<n>` for the batch `K<n>` here, and its architect runs them as the README's "Changing the kit" says. Work that no row above covers gets a row in this table first. State is `proposed` (a candidate left by a finished build: nobody builds it until a plan asks for it, and the owner still decides size L), `planned` or `done`.

| Batch | Content | Effort | Asked by | State |
|---|---|---|---|---|
<!-- rows: Asked for by a game -->

## Asked for by the owner

| Batch | Content | Effort | Asked by | State |
|---|---|---|---|---|
<!-- rows: Asked for by the owner -->

## Candidates

A candidate is a part some game wants and nobody builds yet. A second game that wants it adds its name to "Wanted by" after a comma; never a second row. Row keys: `wanted-by` (game names, comma-separated), `tags` (plain words, comma-separated) and `sources`, which no table prints; `node kit.mjs search` finds a candidate by its content line and tags.

| Batch | Content | Effort | Wanted by | State |
|---|---|---|---|---|
<!-- rows: Candidates -->

## Harvest from the existing games (owner, 15 Nov 2026)

"Enrich the kit first, then retrofit the games" (`docs/RETROFIT_PLAN.md`). Seven read-only reviews, one per game, are in `docs/evaluation/harvest/` (109 candidates; their evidence is headers, exports and searches, so a worker reads the bodies before lifting). Merged here by theme. Wave 1 is built first and tagged; the retrofits pull that tag. Wave 2 follows. A worker does not edit this file: the rows are marked by whoever merges.

### Wave 1 - tooling and what every game uses

| Batch | Content | Sources | Effort | State |
|---|---|---|---|---|
<!-- rows: Wave 1 - tooling and what every game uses -->

### Wave 2

| Batch | Content | Sources | Effort | State |
|---|---|---|---|---|
<!-- rows: Wave 2 -->

### Wave 3 - gaps found by the retrofits (15 Nov 2026)

What a game's own tool did that the kit's does not; each kept that game on its own tool. Details in the retrofit pull requests (Jarl 25, Rome 55, EBR 249, Imperium 131, STCC 294, Unstoppable 54).

| # | Batch | Found in | Size | State |
|---|---|---|---|---|
<!-- rows: Wave 3 - gaps found by the retrofits (15 Nov 2026) -->

### Wave 4 - gaps left after the second pass (16 Nov 2026)

What still keeps a game on its own tool at kit v0.25.0. Details in the second-pass pull requests (Jarl 27, Rome 57, EBR 251, Imperium 133, Warp's 142, STCC 296, Unstoppable 56).

| # | Batch | Found in | Size | State |
|---|---|---|---|---|
<!-- rows: Wave 4 - gaps left after the second pass (16 Nov 2026) -->

### Wave 5 - Under Falling Skies (16 Nov 2026)

What the eighth game has that the kit lacks, from its assessment at kit v0.33.0 (`docs/RETROFIT_PLAN.md`, Part D). UFS is a solo game: its two-player-only items do not apply.

| # | Batch | Found in | Size | State |
|---|---|---|---|---|
<!-- rows: Wave 5 - Under Falling Skies (16 Nov 2026) -->

### Wave 6 - gaps left after the third pass (16 Nov 2026)

Found by the third retrofit pass (`docs/RETROFIT_PLAN.md`, Part E).

| # | Batch | Found in | Size | State |
|---|---|---|---|---|
<!-- rows: Wave 6 - gaps left after the third pass (16 Nov 2026) -->

### Wave 7 - the gap analysis (`docs/GAPS.md`, 16 Nov 2026)

| # | Batch | Found in | Size | State |
|---|---|---|---|---|
<!-- rows: Wave 7 - the gap analysis (`docs/GAPS.md`, 16 Nov 2026) -->

### Owner's word (size L or stage 4)

Decided by the owner, 16 Nov 2026:
- **Privacy guards: dropped, and removed from the games.** The repositories are private and that is enforced on GitHub, so no build-time guard is needed.
- **Imported content packs: dropped.** A game carries all its cards, code and images in its own private repository; nothing is loaded at runtime from outside it.
- **Scan ingest: build (K164)**, starting from the `scanning-pipeline` repository, compared with the games' copies.
- **Information-set search driver, LLM opponent plumbing, second-engine (Rust) tooling:** only for a game with a competitive two-player mode, built when such a game needs them.
- **Kit enrichment, middle path:** build now what two or more games already do or what is plainly game-independent (wave 4 K135-K141, K25, K28, K29, K30, K33, K35, K36). Single-game visual and sound rows wait for the experience director's release passes; the rest is pulled in by a game's build plan when it needs it.

| Row | Content | Sources | Effort | State |
|---|---|---|---|---|
<!-- rows: Owner's word (size L or stage 4) -->

## Harvest from outside repositories (owner, 15 Nov 2026)

Sixteen public card- and board-game repositories were surveyed read-only; the findings are in `docs/evaluation/outside/` (evidence is docs, headers and excerpts, so a worker reads the bodies before building). Licences: middle-earth-player, netrunner, boardgame.io and netrunnerdb are MIT (code may be lifted with its notice); marvel-champions-digital-game and arkham.build are AGPL-3.0, chiriboga is GPL-3.0, ArkhamHorror, MarvelChampions and marvel-lcg have none: from those take the idea and write it new, never paste code. Second batch: XMage is MIT and the Rally the Troops server is ISC (liftable with the notice); Forge and Terraforming Mars are GPL-3.0, rftg is GPL-2.0 or later, and the Rally the Troops game modules read have no licence: idea only. Rows are built when the first game needs them. Not taken: save-compatibility work (held until a game is complete), the source engines, multiplayer and server parts.

| Batch | Content | Sources | Effort | State |
|---|---|---|---|---|
<!-- rows: Harvest from outside repositories (owner, 15 Nov 2026) -->

### Build order for the outside harvest (owner, 15 Nov 2026)

The owner asked for tiers 1 and 2 to be built now, in this order, without waiting for a game to need them. Tier 3 is built when a game needs the row; tier 4 waits for the owner's word. The order is gain against cost, judged from the survey write-ups, not measured. A row works as "How a batch works" says, with two differences: the base is a design described in `docs/evaluation/outside/`, not a lift from one of the owner's games, and code is copied only from the MIT and ISC sources (middle-earth-player, netrunner, boardgame.io, netrunnerdb, XMage, the Rally the Troops server), with the notice in `component.json`; from every other source the worker reads the write-up, not the repository, and writes new code. The write-ups are excerpts: where a row lifts code, the worker reads the source file in full first. A row marked "compare first" starts by reading the kit component named and is closed as "covered" in this file when the kit already does it.

**Tier 1 - high gain, small cost (one batch per row, in this order)**

| # | Row | Note |
|---|---|---|
| 1 | K110 | |
| 2 | K98 | |
| 3 | K120 | compare first: `sim-pool` fuzz |
| 4 | K83 | compare first: `card-harness` inventory, K26 |
| 5 | K108 | |
| 6 | K121 | |
| 7 | K81 | same pull request as K121 if small |
| 8 | K82 | |
| 9 | K113 | |
| 10 | K91 | |
| 11 | K90 | |
| 12 | K104 | |
| 13 | K102 | |
| 14 | K101 | |
| 15 | K106 | |
| 16 | K116 | lift from the Rally the Troops server tools (ISC) |

**Tier 2 - high gain, medium cost**

| # | Row | Bundle | Note |
|---|---|---|---|
| 17 | K78 | Card testing | the renderer here; the reading-judge step goes to the architect skill master in `C:\projects\_skills` |
| 18 | K77 | Card testing | |
| 19 | K97 | Card testing | |
| 20 | K99 | Card testing | |
| 21 | K86 | What the player sees | new component `game-log` |
| 22 | K79 | What the player sees | |
| 23 | K88 | What the player sees | |
| 24 | K80 | What the player sees | |
| 25 | K93 | Card-language core | rows 25 to 29 share one timing vocabulary: one design note in `docs/patterns/` first (its own pull request), then one batch per row |
| 26 | K111 | Card-language core | |
| 27 | K94 | Card-language core | |
| 28 | K96 | Card-language core | |
| 29 | K95 | Card-language core | |
| 30 | K100 | Tools | |
| 31 | K87 | What the player sees | needs K86 |
| 32 | K89 | What the player sees | |
| 33 | K105 | What the player sees | needs K104 |
| 34 | K118 | Boards | new component `board-model` |

**Story, campaign and achievements (owner, 15 Nov 2026; rows K151 to K163):** from a second pass over the Marvel Champions and Arkham Horror repositories; write-ups `docs/evaluation/outside/story-campaign-marvel.md` and `story-campaign-arkham.md`. Every source here is AGPL or has no licence: ideas only, all code written fresh. The workers read headers, types and samples, not whole files (each write-up lists what was opened). Ranked, not yet agreed by the owner:

| # | Row | Bundle | Note |
|---|---|---|---|
| 35 | K151 | Story | new component `story` |
| 36 | K153 | Story | needs K151 |
| 37 | K156 | Campaign | new component `campaign` |
| 38 | K160 | Achievements | new component `achievements`; compare first with `play-stats` |
| 39 | K162 | Achievements | needs K160; static only; done |

When a game with a campaign or a long story is planned (tier 3): K157, K159, K152, K161, K163. With release 1.1: K154, K155. Owner's word (size L): K158.

**Tier 3 - when a game needs it:** K122, K92, K117, K123 (compare first), K119 (compare first), K112, K84, K114, K109, K124, K85.

**With the release ladder (stage 3; the experience director decides when):** K142 to K146 and K150 with 1.1, K147 and K148 with 1.2, K149 with a game's phone mode (these nine rows were first numbered K126 to K134, which another batch of rows also used; renumbered 15 Nov 2026). K154 and K155 (story panel reader and event splash) with 1.1. Write-up: `docs/evaluation/outside/motion-sound.md`; its "kit lacks" claims were checked against the first part of each README only, so a worker reads the whole README first.

**Tier 4 - owner's word:** K103, K115, K107, K125.

## Motion retrofit (owner, 18 Nov 2026)

Every game's animations are rebuilt on `motion-frame` and `effect-library`; game effects come into the kit under neutral names with each game's look as settings; each game's own motion code is deleted. Study and sources: `docs/MOTION_RETROFIT_STUDY.md`. Every retrofitted game plays one beat per event (or chunk) in event order and reveals each log line when its beat starts.

| Batch | Content | Sources | Effort | State |
|---|---|---|---|---|
<!-- rows: Motion retrofit (owner, 18 Nov 2026) -->

## Parts retrofit (owner, 18 Nov 2026)

The kit holds every game's parts, then every game is retrofitted onto them (owner, 18 Nov 2026). Work list: `docs/INVENTORY.md` section 1, item number in brackets; its paths and commits are the sources. Item 2 (no accessibility, ever), item 5 and pack import (item 4) are dropped.

| Batch | Content | Sources | Effort | State |
|---|---|---|---|---|
<!-- rows: Parts retrofit (owner, 18 Nov 2026) -->

## Audit roadmap (owner, 16 Nov 2026)

Tasks T1-T18 of `docs/evaluation/AUDIT-2026-11-16.md` section 13, run in the phase order of its section 12.

| Batch | Content | Sources | Effort | State |
|---|---|---|---|---|
<!-- rows: Audit roadmap (owner, 16 Nov 2026) -->

## Size

5 small lifts, about 18 worker batches of medium size, 2 large ones. Stage 1 is 4 batches. Work asked for by a game (the table above) comes on top.

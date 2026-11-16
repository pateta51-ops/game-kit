# What game-kit still lacks (16 Nov 2026)

Read-only review. Kit at tag v0.51.0, 55 components, 225 commits made 14-16 Nov.
Evidence tags: **[read]** = I opened the file; **[listed]** = I saw file names or counted lines with a script, but did not read the code; **[guess]** = my judgement.

---

## A. Missing pieces, ranked by value

### 1. Card face and card zoom layer (component, size L; build it as two M pieces)
**What:** One component that draws a card. It loads and caches the card art, writes the printed text with icons inside the text, shows tokens, and opens a zoomed view with the full transcription.
**Why:** Four games built this separately **[listed]**:
- STCC `src/ui/cards/`: CardFace.tsx, IconText.tsx, PrintedText.tsx, ArtProvider.tsx, imageCache.ts, faceLayout.ts
- Imperium `src/ui/cards/`: CardFace.tsx, ViewCard.tsx, ArtProvider.tsx, artContext.ts, Icons.tsx
- EBR `src/ui/cards/`: CardFace.tsx, CardText.tsx, Zoom.tsx, imageCache.ts, scanOverlay.ts
- Unstoppable `src/ui/cards/`: ArtProvider.tsx, artContext.ts, ScanArt.tsx, Icons.tsx

Icons are the biggest recurring topic in the decision files: 606 lines across all games; 65 STCC, 49 EBR and 46 Imperium decision files mention them **[listed]**. In Imperium decision D-303, the owner rejected the icons as "too different" and asked for SVG icons that can sit inside text **[read]**. The owner's rule "zoomed cards = full transcription" applies to every game.
The kit has pieces of this, but no face: icon-with-hidden-word in `small-helpers`, icon codes in `glossary`, errata in K105. **[read: README table]**

### 2. Prompt host and standard question widgets (component, M)
**What:** The screen piece that shows the engine's open question (a "prompt"). It picks a widget for each prompt kind through a typed registry. It comes with the common kinds already built: pick cards, pick an amount, order items, may/yes-no, pay a cost.
**Why:** Every card game rebuilt it **[listed]**:
- STCC and Imperium have the same shape: `registry.ts`, `parts.tsx`, `simple.tsx`, `cards.tsx`, `CardChoice`, `OrderPrompt`. That looks like one was copied from the other.
- Rome has 30 files: `PromptHost.tsx`, `ChooseAmount`, `May`, and more.
- Jarl has `PromptBar`, `autoAnswer`. EBR has `choices.tsx`. UFS has `simple.tsx`, `confirm.tsx`.

The kit has the parts around the host but not the host itself: `prompt-gallery` (fixtures), `prompt-source`, `ghost-card`, `paced-view`. Kit row K123 was closed as "covered by plain TypeScript" **[read]**. My view is that this leaves every game to rebuild the host **[guess]**.

### 3. New-game scaffold (generator, M)
**What:** One command that creates a working, empty game repo: package file, Vite, lint, Vitest projects, tsconfig, dev and phone scripts, CI from `ci-templates`, a `kit/` pull, a store wired to `engine-core`, and a stub `GameRules`.
**Why:**
- The planner's reference file says plainly: "The project shell ... has no component" (`_skills/board-game-build-plan/references/reuse-catalogue.md`) **[read]**.
- The Radiance plan (line 759) therefore ports the shell from the 7th Inning Stretch repo by hand **[read]**.
- The Radiance handoff repeats a known worktree problem: "Worktrees lack node_modules: symlink it" **[read]**.
- Each new game's first batch (S1, run on Opus) re-does this work.

### 4. Card-language starter (generator/template plus a small typed registry, M)
**What:** A skeleton for "card effects as data". It has a verb registry with handler and text-generator slots, a validator, and a test that every verb has a runner. The game then fills in its own verbs.
**Why:** Every card game wrote its own interpreter and text generator **[listed]**:
- STCC: `engine/ops` (14 files), `engine/customs` (27), `engine/text` (9)
- Imperium: `engine/ops` (21), `engine/text` (7)
- Rome: `engine/ops` (17)
- Unstoppable: `engine/effects` (10)
- Jarl and EBR: `engine/effects`, `describe`

`docs/SELECTION.md` keeps this layer as a note on purpose, "welded to its game" **[read via the reuse catalogue]**. My suggestion is to share the shell only, not the verbs **[guess]**.

### 5. Card-data accuracy checks: K168 transcription-check and K169 content gate (check, M)
**What:** Two independent transcriptions of each card with a field-by-field difference report, plus a set of deliberately broken packs that the content gate must catch.
**Why:**
- STCC has about 25 `bNN-...-readings` decision files about reading card text.
- EBR has the c401 to c403 encoding gaps and questions **[listed]**.
- Both rows are still `proposed` in `docs/PLAN.md` **[read]**.

### 6. Tutorial tooling: K36 and K170 coach (component feature, M)
**What:** K36 builds a tutorial script from a seed's line of play, does a seed search, and adds a script-playing browser test. K170 adds first-time tips as data.
**Why:**
- Rome has 7 tutorial decision rounds (tutorial-round3, round5, tutorial-why, and others) **[listed]**.
- 7th Inning Stretch built the K36 scripts itself: `scripts/tutorial-build.ts`, `seed-search.ts` (post-build list, item 14) **[read]**.
- Both rows are still `proposed`.

### 7. Smaller items (S each)
- **Dice tray and roll window:** 7th Inning Stretch post-build list, item 18 **[read]**.
- **K35 glossary printed-words check:** proposed; built in 7th Inning Stretch as `scripts/glossary-check.ts` **[read]**.
- **K33 docked tutorial panel:** proposed **[read]**.

---

## B. Agentic-development gaps

1. **A catalogue agents can query (S, tool).**
   - The worker definition says "see whether `kit/` holds it" (`_skills/game-build-architect/agents/game-worker.md`, line 21) **[read]**.
   - But `kit/` holds only the components that game has pulled. A worker cannot see the other ~30 components, so it may rebuild one.
   - Fix: `kit.mjs list` and `kit.mjs search <word>`, printing each component's one-line purpose, its main exports and its README path, from a generated `catalogue.json`.

2. **A "use it in 10 lines" example for every component (docs, S to M).**
   - Only 19 of 54 READMEs contain a code block **[listed]**.
   - `engine-core` has 3,508 lines and 315 exports behind a 15-line README with no example **[listed/read]**. It does have sub-notes (`undo.md`, `timing.md`) and a fake game.
   - `plan-checker` has no README at all **[listed]**.

3. **A reference mini-game that doubles as a contract test (M).**
   - Build a tiny game in the kit's CI that uses engine-core, app-frame, the prompt host, saves, settings, sim-pool and replay together.
   - Today only `engine-core/fake/counter.ts` exists, and `tests/kit.test.ts` tests only pull and check **[read]**.
   - Nothing proves that the components fit together in a game. Only 7th Inning Stretch does that, and it is a dice game.

4. **Planner reference file is out of date (docs plus a check, S).**
   - `reuse-catalogue.md` still says "tag v0.2.1". It still lists K4 to K9 as unbuilt "Stage 2" work, and lists the theme check and the privacy guard as "stage 4". The privacy guard has since been dropped and the theme check is built **[read]**.
   - Radiance's plan pins v0.9.0 and schedules kit phases GK25, GK27, GK28 and GK29. Those rows are now done **[read]**.
   - Fix: plan-checker warns when the pin is far behind the latest tag, or when a GK phase targets a row marked done.

5. **Kit row-number collisions (tool, S).**
   - Ids K79 and K80 were "taken", and K126 to K134 had to be renumbered (`docs/PLAN.md`) **[read]**.
   - The 7th Inning Stretch handoff lists "K ids collide across sessions" as a mistake not to repeat **[read]**.
   - Fix: a `kit.mjs next-id` command that checks open PRs before handing out an id.

6. **Worker setup script (tool, S).**
   - 7th Inning Stretch handoff **[read]**: isolated `game-worker` agents "cannot run git in WSL"; workers leave edits uncommitted; node_modules must be symlinked.
   - Radiance handoff **[read]**: the node_modules symlink again.
   - Fix: one `worktree-setup` and `worker-finish` script (link node_modules, run the check in a WSL clone, refuse to finish while the worktree has uncommitted changes).

7. **Cost of reading the kit's docs (docs, S).**
   - `docs/PLAN.md` is 9,165 words and `SELECTION.md` is 2,169 **[listed]**.
   - Every planner is told to read them.
   - Fix: a one-page "state of the kit" generated from PLAN.md.

---

## C. Weaknesses in what exists

1. **Most components are not used by any game [listed: every game's kit.lock.json].**
   - Only 7th Inning Stretch pulls the engine and UI components (21 of them).
   - The older games pull tooling only, as the retrofit plan intends. Imperium, Warp's Edge, EBR and UFS have no `kit/` at all.
   - About 30 components are in no game's lock file: achievements, campaign, story, challenges, board-layout, board-model, board-registry, opponent, learned-opponent, game-log, ghost-card, card-query, card-patches, dice-odds, debug-console, prompt-gallery, prompt-source, paced-view, perf, play-stats, plain-text, ui-helpers, small-helpers, scan-ingest, resolution-frame, e2e-helpers, lint-preset, tooling-scripts, boundary-check, picked-state.
   - Many of these were written from outside repositories, some marked "ideas only, no code copied" (achievements' `component.json`) **[read]**.

2. **The card-timing engine is unproven [read PLAN; guess on risk].**
   - Engine-core's card-timing features (K93, K94, K95, K96, K111, K112) were designed from Netrunner, XMage and Arkham ideas.
   - Its only real user, 7th Inning Stretch, is a dice game.
   - Radiance will be the first card game to use them, so expect kit-gap fixes there.

3. **Thin components that could be merged [listed: source line counts].**
   - picked-state (13 lines), challenges (27), boundary-check (30), ghost-card (41), dice-odds (42), paced-view (64), board-model (76), small-helpers (80).
   - Suggested merges **[guess]**:
     - small-helpers, boundary-check and picked-state into ui-helpers;
     - ghost-card, prompt-source and paced-view into the prompt host from A2.

4. **Overlapping components [read: README table].**
   - board-model, board-registry and board-layout: three components for one board, used by no game.
   - play-stats and achievements.
   - tutorial and the proposed K170 coach.
   - opponent, learned-opponent and the sim-pool drivers.

5. **Shallow tests [listed].** Many components have one test file each: board-model, card-query, dice-odds, opponent, learned-opponent (664 lines), traceability (682 lines), scan-ingest (3,882 lines, Python, one test file). All 55 components were built in three days, so the depth of testing is the main risk **[guess]**.

6. **One game's look inside the shared kit [read PLAN].**
   - pieces-3d took seven rows (K174 to K191) of baseball-stitch options for 7th Inning Stretch alone.
   - That goes against README rule 5, "no game's ... look lives here". It does no harm, but it is a precedent.

7. **Known open gap [read].** 7th Inning Stretch's handoff records that sound-player's `playTrack` always plays a cue's first file. The game works around it.

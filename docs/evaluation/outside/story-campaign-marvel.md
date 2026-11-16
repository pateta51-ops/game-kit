# Story, campaign and achievements in three Marvel Champions repos

Survey date 15 Nov 2026, shallow clones of each default branch. All three are ideas only (AGPL, no licence, no licence): nothing below may be copied as code. Type shapes are paraphrased.

**Answer to "which one has the story cutscenes": `quincarter/marvel-champions-digital-game`** (TypeScript, Phaser client, pnpm monorepo: `packages/engine`, `cards`, `content`, `client`). It has a full comic-reader system. The other two have only a text modal (halogenandtoast) or nothing (sdolle1775).

Note: the quincarter working tree did not check out on Windows (git reported a failed checkout), so its files were read from the git objects (`git show HEAD:path`). Paths below are repo paths.

---

## 1. quincarter/marvel-champions-digital-game (AGPL, ideas only)

### 1.1 Story / cutscenes: exists, large

**Files**
- Data model: `packages/client/src/campaign/story.ts`
- Per-campaign story data: `packages/client/src/campaign/stories/{trors,gmw,mts,mojo,mut_gen,next_evol,sm,aoa,aos,fne,shadowland}.ts` (10-27 KB each)
- Beat builders for pre-lettered pages: `packages/client/src/campaign/comic-beats.ts`
- One-off scenario intros: `packages/client/src/campaign/scenario-intros.ts`, scene `packages/client/src/scenes/scenario-intro.ts`
- Renderer: `packages/client/src/ui/comic-reader.ts` (40 KB), pure helpers `packages/client/src/view/comic-reader-model.ts`, `comic-pan.ts`, `comic-crop.ts`, `comic-bubble-tail.ts`
- Campaign scenes (each with a pure `view/campaign-*-model.ts` beside it): `packages/client/src/scenes/campaign/` `cover.ts`, `opener.ts` (issue opener), `briefing*.ts`, `beat.ts` (in-game villain stage splash), `aftermath.ts`, `rewind.ts` (loss screen), `finale.ts`, `saga.ts`, `run.ts`, `issue.ts`, `dossier.ts`
- Stage-flip detection: `packages/client/src/view/campaign-beat-model.ts`
- Extras: `scenes/extras-reader.ts`, `scenes/side-story-reader.ts` (earned mini comics)
- Art convention: `art/campaigns/<id>/pages/`, `art/campaigns/<id>/artboards/`, `art/campaigns/<id>/rulebook/`, `art/scenarios/<id>/intro.*`, each with `CREDITS.md` / `SOURCE.md`
- Design mocks in repo root folder `Marvel Champions game screens/` (`* Comic Reader.dc.html`, `Campaign - Desktop/Tablet/Phone.dc.html`)

**The framing.** A campaign is told as a comic: each scenario is an "issue". Screens are numbered in the design (C03 opener, C04 in-game beat, C05 aftermath, C09 rewind, finale). Story is declared "flavor only": no rule lives in story data, every lookup has a plain fallback, and a missing line never blocks play.

**Data shape (paraphrased)**
- `StorySpeaker`: narrator | villain | hero {identityId, name} | npc {name, optional portrait borrowed from another scenario's villain art}.
- `StoryLine`: {speaker, text, fallback?, placement?}. **Hero lines degrade to narration**: if the named hero is not on the player's roster, the line is shown as a narrator caption using `fallback`; no fallback means the line is dropped. So any roster gets the same beats.
- `StoryPanel` (simple three-panel opener): {art, caption?, lines[], sfx?}. `art` is villain | hero | note (a "Panel art: ..." text placeholder) | artboard {name, text placeholder, focusX/focusY for the crop}.
- `ComicPage`: {file, width, height, beats[], flags}. Width and height are the source image's pixels; every rectangle is in page pixels so the reader scales to any screen.
- `ComicBeat`: {panel rect (camera framing), show? (the exact region to reveal, hiding neighbours), caption?, lines[], sfx?, pan? direction, wideOnly?, narrowOnly?}.
- `BubblePlacement`: {bubble centre, speaker point for the tail} in page pixels; phones ignore it and stack bubbles under the panel.
- `ComicBeatRef`: {page, beatIndex}. An issue's read is an ordered list of refs, so one page can be split across issues and a beat reused elsewhere.
- `IssueStory` per scenario node: title, villain billing, blurb (up next), recap (once finished), `opener` panels, `comicBeats?`, `comicFor?(villain)` (conditional comic chosen from the campaign log), `aftermathBeats?`, `stageLines` {stage number: villain line}, `stageNotes?` (rule reminder under the splash), `stagePanels?` (which comic panel to reuse on a stage flip), `briefing` line, `aftermath` line, `rewindTaunt` (villain's line on a loss), `teaser`, `rewindPanel?`.
- `CampaignStory`: tagline, blurb, roster banner, `castIdentityIds` (heroes with written lines), `issues[]`, `pages?[]`, `campaignLost` {headline, line}, `finale` {caption, headline, sfx, villainLine, heroLines[] per seat, page?, comicBeats?, stats? (declarative finale stat boxes: rewinds, cardListTotal, numberTotal, sharedNumber over log fields), crewLines?}.
- Extra copy slots that turn engine-log wording into plain sentences: `handledWords(fact)`, `setupCalls`, `aftermathCalls`, `poolCopy`.

**Three reader modes, chosen by page flags (never by campaign id)**
1. **Spotlight** (default, unlettered page): whole page cover-fit and recentred on the current panel, that panel lit, the rest dimmed; the reader draws its own caption box, speech bubbles (with tails to `speaker` point on wide screens) and SFX lettering. If a panel overflows the crop, an automatic within-beat pan runs (3200 ms).
2. **Guided / lettered** (`lettered: true`, official rulebook comic pages with printed balloons): the reader draws no lettering, zooms to each panel contain-fit (never crops art), and pans/zooms panel to panel on the player's advance.
3. **Cinematic** (`cinematic: true`, dense collage spreads): the current panel always fills the reading area; the camera tweens from one framing to the next, crossfades across page turns (settle 700 ms, crossfade 450 ms), plus a slow pan inside an overflowing beat.
- `artboard: true` pages are single clean pictures the reader letters itself; `note` is the placeholder text drawn until the picture file exists. `credit` prints a credit line under the page counter for found art.
- `comic-beats.ts` builds, from one panel rectangle, a wide beat and a phone beat framed to each reading-area aspect (1440x705 and 390x680) with a 4% margin, clamped inside the page; plus a closing "whole page" pull-back beat that is wide-only.

**Sequencing and controls**
- Issue opener (`opener.ts`): header (issue number, title, "SKIP" button), then either three tap-through panels or the comic reader over `comicBeats`; bottom button reveals the next beat, and the last one leaves for the Briefing. Back steps one beat back (clamped at the first). Same scene is reused for "reread a finished issue" and "read from Extras" with a `returnTo` route. Opening an issue starts that villain's music theme.
- Scenario intro (`scenario-intro.ts`): same reader over a one-page comic before the deal; camera pan slower than a campaign page's 450 ms; lettering appears after the camera settles; tap on the picture, arrows, D-pad or the button advance; SKIP, Escape, Start or B leave. Last beat's button starts the game.
- In-game beat (`beat.ts` + `campaign-beat-model.ts`): a pure function looks at the engine events of the fresh command for a villain-stage-advanced/revealed event, only in a campaign game, only if the story has a line for that stage; the scene is a static overlay (splash with stage roman numeral, villain line, optional reused comic panel, optional rule note). Dismissed by tap anywhere, any key, or automatically after 4000 ms.
- Loss (`rewind.ts`): villain taunt over the issue's last-read panel, retry. Win (`aftermath.ts`): optional guided read of `aftermathBeats`, then reward choices and campaign-log deltas. `finale.ts`: full-bleed page or grid, per-seat hero lines, stat boxes.
- **Reduced motion**: every tween is dropped (instant cut, contain-fit, no auto-dismiss of the splash), not played faster.
- No typewriter text effect was found; text appears per beat.

### 1.2 Campaign: exists, the most complete of the three

**Files**
- Vocabulary (data only, plain JSON): `packages/engine/src/campaign.ts` (93 KB)
- In-game reads of the frozen log: `packages/engine/src/campaign-state.ts`, `packages/engine/src/resolve/campaign.ts`
- Per-box definitions: `packages/cards/src/campaigns/*.ts`
- A JSON example in a content pack: `content-packs/sample-scenario/campaigns/sample-scenario-crisis.json`
- Client service and storage: `packages/client/src/campaign/campaign-service.ts`, `packages/client/src/engine/campaign-storage.ts`, `idb-campaign-storage.ts`
- Log views: `packages/client/src/view/campaign-log-model.ts`, `campaign-log-deltas.ts`
- Design docs: `docs/campaign-mode-design.md` (145 KB), `docs/campaign-client-per-box.md`

**How it works**
- `CampaignDefinition`: {campaignId, version, logFields[], graph, loss policy, everyNodeSetup?, everyNodeVictory?, conditionalInstructions? (instructions the log itself can switch on), elimination?}. The engine never names a campaign; adding a box adds data, not union members.
- `CampaignGraph`: `linear` {nodes[]} or `choice` {nodes[], beforeChoice instructions, `available` predicate, optional `finale` {nodeId, when}, `progressToFail` count}.
- `CampaignNode`: {id (a scenario slot, not a scenario), label, scenario ref (fixed or composed), composition? instructions, requiredModularSetIds?, setup[], victory[], defeat...}.
- `CampaignInstruction`: {id, printed text, citation (rulebook page), step}. A step is either `betweenGames` (ops on the log: setField, add, append, strike, choices, random draws) or `inGame` {window (default "afterScenarioSetup"), effects in the normal card-effect language}.
- Log field types (typed, each with label, scope shared/per-seat, citation, optional hidden): number {min, max, clampAtZero}, flag, cardList (duplicates kept), cardRef {withFace}, choice {options}, strikeList {options}, cardState (counters and face that ride a card across scenarios), instructionList, text (notes).
- Predicates/values over the log are available inside card effects: `campaignLog` field isSet / contains / number / count, so a scenario setup can say "if X was recorded, draw N".
- `CampaignLog` (save shape): {schema, id, campaignId, definitionVersion, poolVersion, modes, seats[], shared{}, hidden{}, removedFromCampaign[], position {nextNodeId, resolved{node: completed|failed}, progress{}}, seed, rng state, history[], status (active|won|lost|abandoned|incompatible), attempt?}.
- `attempt`: the composed, unfinished game: nodeId, modes, `logBefore` snapshot, steps resolved so far, the frozen `CampaignGameInput`. This is what makes a campaign resumable from storage alone.
- History entry per attempted game: nodeId, modes, outcome, gameId (link to the saved game for replay), `logBefore` snapshot, step trace (every write), timestamp, seed (to replay the same deal).
- **Boundary rule**: the game receives a frozen copy of the log view at setup (`GameState.campaign`); it never reads live campaign storage. A saved campaign game replays without the campaign existing. All reads are total (missing field reads as nothing).
- Loss policy: `retry: free | byInstruction`, `retryBaseline: nodeStart` restores the log to the snapshot taken when the node began.
- Version stamps: a definition version mismatch marks the log `incompatible` instead of misreading it.
- Storage: its own IndexedDB database separate from saves and decks; one record written whole; `CampaignRecord` = log + name, box code, createdAt, updatedAt and a few per-run options (table rules fixed at run start).
- Log deltas view: cumulative writes (add, append) must be converted to per-step deltas before display, otherwise they double-count.
- Screens: Saga shelf (campaign select), Cover, Roster, Run (issue list with blurbs/teasers), Issue detail (recap, reread), Briefing ("Handled for you" list of automated setup in plain words), Market, Deck edit, Dossier (log sheet), Aftermath, Rewind, Finale.

### 1.3 Achievements: exists, large

**Files**
- Spec: `docs/achievements.md`; definitions `packages/client/src/progression/achievements.ts` (37 KB), `mod-achievements.ts`, `team-up-trophies.ts`, `deck-feats.ts`
- Unlock path and points: `packages/client/src/progression/unlocks.ts`, `progression.ts`, `custom-unlock.ts`, `extras.ts`
- Per-game summary feeding them: `packages/client/src/engine/game-summary.ts`, `game-record.ts`
- Toast: `packages/client/src/view/achievement-toast.ts` (pure), `scenes/achievement-toast.ts`, seen-set `platform/achievements-seen.ts`, sounds `audio/sfx/achievement-unlocked.mp3`, `extras-unlocked.mp3`
- List screen: `scenes/trophy-room.ts`, `platform/trophy-room-view.ts`; stats `scenes/player-stats.ts`, `progression/stats-backfill.ts`; opt-in global stats `packages/client/src/global-stats/`

**How it works**
- **Nothing is stored.** Every achievement is derived from the finished-game save rows and campaign records. One pass folds the history into a `Facts` object (wins, losses, sets of won scenarios/heroes/aspects/campaigns, expert sets, solo sets, fast wins, round-1 losses, hero-pair tables, matchups, heroes defeated...). Tutorial games never count.
- `AchievementDef`: {id, name, description, family, points, rewardPackId?, tracked, needs?, showProgress, measure(facts) -> {current, target} | null, pack?}. Definitions are generated in bulk by mapping over content (one "beat X" per scenario, tiers from a table).
- Families (list-screen grouping): wins, villains, doppelgangers, arch-enemies, campaigns, heroes, expert, feats, deck building, team-ups, funny (losses count: lose 10/50/100, lose in round 1), mods.
- A `GameSummary` is written on the save row when a game ends (loss reason, defeat cause, per-seat plays/activations, HP at end...), with a `SUMMARY_VERSION` and a backfill that replays older games to fill new fields.
- Points and rank: achievement points join "champion points" (first win 100, etc.); rank (9 titles) reads lifetime points, not the balance after spending. Points can be spent to open content by hand; "Unlock everything" is free and turns points off.
- Unlock path: content gated by release wave; next wave opens by finishing the previous campaign; heroes are rewards for beating specific villains. Also derived, never stored twice.
- Toast: polls once a second for newly earned ids against a stored seen-set; **first run records what is already earned and announces nothing**; ids stay seen forever. Gold trophy badge pops in, a bar opens with name and reward, holds for a user-set time, folds away; several at once stack into one counted toast that opens on tap into a list with Collapse and Dismiss. Newly opened Extras (songs, art) use the same toast afterwards with a different badge and sound. Settings: hold time, position, off.
- Trophy Room: header with rank, lifetime points, bar to next rank; families as foldable headings (all start folded, state remembered); sort by category, completion, points or name; each row EARNED / LOCKED / SOON as a word; a locked row says how to earn it; tapping opens a detail sheet.
- Team-up stories: winning with a specific hero pair unlocks a short comic in Extras, read in the same comic reader, with a bibliography line.
- Stats screen: tabbed dashboard (overview, heroes, villains, matchups grid, side schemes, cards by hero), folded in a worker.

---

## 2. halogenandtoast/MarvelChampions (no licence, ideas only; Haskell server, Vue 3 client)

### 2.1 Story: a plain text reading modal, no cutscenes
- `frontend/src/components/StoryReading.vue`: modal dialog showing a list of sections; each section is an i18n key with `title`, `text[]` (paragraphs) and `bullets[]`. First section styled as the lead (larger amber title, italic text). Footer: link to the local rulebook PDF, and either Close (reference mode), Continue (the asked player), or "waiting on <name>".
- `frontend/src/locales/en/story.json` (184 KB): the rulebook's story, new rules and campaign instructions per scenario, keyed e.g. `story.<namespace>.<section>`.
- `frontend/src/campaigns.ts`: per campaign {namespace, overview section keys, rulebook PDF}; the between-games guide shows only overview sections so later scenario stories are not spoiled.
- Sequencing is server-driven: `src/Marvel/Campaign/Steps.hs` sends the first player a "read then continue" question holding the story keys at the campaign-choices step (briefing) and at victory (victory instructions). Used in `frontend/src/views/Game.vue` and `Campaign.vue`.
- No portraits, panels, typed text, timing or skip beyond Close/Continue.
- `src/Marvel/Log/Narrator.hs`: not story. It derives the whole game log from the message stream in one place (silence by default, runs before the message is applied, read-only).

### 2.2 Campaign: exists, hand-coded per box
- `src/Marvel/Campaign.hs` (39 KB): `CampaignMode` (standard/expert), `CampaignPlayer` (identity, number, hitPoints, obligations, upgrades, rescued allies, pending choices), one `CampaignLog` record with a typed sub-log per box (GalaxyLog, TitanLog as a list of checked marks, SinisterLog with reputation, ShieldLog with hidden evidence redacted by the API, ApocalypseLog, NextEvolutionLog...). Older saves default missing sections to empty.
- `src/Marvel/Campaign/*.hs`: one step runner per box; `Steps.hs` dispatches by campaign kind over step kinds (choices, setup, victory).
- Pending choices: a victory choice for a player absent from that game is asked when the next game is set up.
- The campaign lives outside the game: the server keeps it between games and deals each game a copy to read at setup and write at victory.
- Client: `frontend/src/views/Campaign.vue` (log sheet per box), `frontend/src/components/CampaignBar.vue`, `docs/rules/campaign-*.md` (rules transcriptions), e2e `campaign-guides.spec.ts`, `campaign-rows.spec.ts`.
- No branching model beyond what each box's module codes.

### 2.3 Achievements: not found
- `src/Marvel/Stats.hs` is card stat newtypes (ATK/THW/DEF), not statistics. "Trophy" hits are an icon import. "Challenge" files are game cards.

---

## 3. sdolle1775/marvel-lcg (no licence, ideas only; Python server, TypeScript browser client)

### 3.1 Story: not found
No story, cutscene, intro or narrative code. Grep for cutscene/story/narrative/intro text/typewriter found nothing.

### 3.2 Campaign: exists, minimal
- `game/operate/campaign_logs.py`: the log is string-keyed by the printed log-sheet labels, typed by literal key groups (player list / player string / player int / log list / log int keys such as "Remaining hit points", "Reputation Track").
- `game/game_run/campaign_settings.py`: one JSON file `{campaignId: {key: string}}`, atomic write through a temp file, lock, tolerant load.
- `cards/pack/<box>/campaign.py` (9 boxes) and `game/ability/factory/campaign.py`: campaign rules are ordinary abilities registered on a `WhenCampaignSetup` trigger filtered by campaign id, reading the log.
- `game/scene/replay/campaign.py`, `unit_test/test_campaign_*.py` (settings endpoint, persistence, setup UI, remaining health).
- No scenario graph, history or campaign select screen seen; the player edits the log values as settings.

### 3.3 Achievements: exists, tiny (kill streak call-outs)
- `game/rule/achievement.py`: achievements are abilities of type "Statistics" listening to engine messages with condition lambdas: first blood (first defeat by a player, then unregisters itself), double/triple/ultra kill/rampage from a per-phase kill counter, plus a hidden easter egg.
- `game/statistics/statistics.py`, `game_statistics.py`: counters per achievement and `RecordMaximum('max_phase_kill')`; `RecordAchievement` sends a notify text prefixed "Achievement: ".
- Client: `public/js/marvel/client.ts` strips the prefix and calls `Notify.showAchievement`; `public/css/marvel/achievement-bar.css` is one centred big outlined red text line that fades in and out, pointer-events none; off unless `?show_achievement` or debug (`public/js/marvel/settings.ts`).
- `cards/pack/challenges/24xx_*.py`: the official weekly Challenge cards as ability files (a deck-building restriction plus a triggered penalty), e.g. "only heroes with trait X" plus "after a form change deal 2 damage". A challenge is data in the same ability language as cards.
- `public/js/marvel/history.ts`: game history panel, not records.

---

## Kit candidates (game-agnostic, to be written fresh)

| # | Name | What it does | Source idea | Effort | Gain |
|---|------|--------------|-------------|--------|------|
| 1 | **Panel reader** | Reads one picture as ordered beats: each beat is a rectangle in image pixels plus optional caption, lines and SFX word. Camera pans/zooms beat to beat, contain-fit, with next/back/skip, tap, keys, and reduced-motion cut. Works on any rulebook page, box art or story spread the owner already has as a scan. | quincarter `comic-reader.ts`, `story.ts` (guided/lettered mode) | M | High. One component gives scenario intro, outro, villain reveal and epilogue for every game from existing scans, no new art. |
| 2 | **Story data schema** | Data-only story file per game: speakers (narrator, enemy, player character, npc), lines with roster fallback, panels, pages, beat refs, and named slots per scenario: intro beats, stage/phase lines, win line, loss taunt, teaser, recap, finale. Every lookup has a fallback; story never holds a rule. | quincarter `story.ts` | S | High. Fixes where story text lives and lets the director write it without touching the engine. |
| 3 | **Roster-aware line** | A line written for a specific character shows as a speech bubble if that character is in play, otherwise as a narrator caption from `fallback`, or is dropped. | quincarter `StoryLine.fallback`, `lineForRoster` | S | Medium. Lets story mention the player's own hero or faction without breaking other choices. |
| 4 | **Event beat splash** | Pure function over the engine's event list decides whether a story splash opens (once per event, only if the story has a line); overlay with picture, one line, optional rule note; tap, any key or 4 s auto-close; no auto-close under reduced motion. | quincarter `campaign-beat-model.ts`, `beat.ts` | S | High. Cheap mid-game drama (boss phase change, act advance, deck exhausted) in every game. |
| 5 | **Dual-aspect beat builder** | From one panel rectangle, makes a wide beat and a phone beat framed to each reading area with a margin and clamped to the page; marks beats wide-only or narrow-only. | quincarter `comic-beats.ts` | S | Medium. Makes item 1 usable in the phone ports without re-authoring. |
| 6 | **Placeholder-first art slots** | A panel can be a text note ("Panel art: ...") that the reader draws until the picture file exists, then swaps automatically; credit line per page. | quincarter `PanelArt.note`, `ComicPage.note/credit` | S | Medium. Fits the wireframes-before-themed-mocks rule: story flow can be accepted before any art. |
| 7 | **Text story modal** | Simplest story element: modal of sections (title, paragraphs, bullets) from text keys, lead section styled, Continue/Close, link to the rulebook page; overview sections only between games so later story is not spoiled. | halogenandtoast `StoryReading.vue`, `campaigns.ts` | S | Medium. Good 1.0 fallback (no animation) and for rules-heavy scenario briefings. |
| 8 | **Campaign log schema** | Typed log fields declared as data: number (min/max), flag, card list, card ref with face, choice, strike list, card state (counters riding a card), text note; each with label, scope (shared or per player), rulebook citation, hidden flag. Total read helpers (number, isSet, contains). | quincarter `campaign.ts` LogFieldType, `campaign-state.ts` | M | High. One log sheet model and one log-sheet screen for every campaign game. |
| 9 | **Campaign graph and runner** | Definition = nodes with setup/victory/defeat instructions (each with printed text and citation); graph is linear or player-choice with availability predicate, mandatory finale and fail-after-N marks; steps run either between games (log ops) or in game (normal effects in a named window). | quincarter `campaign.ts`, sample pack JSON | L | High for games with campaigns; the instruction-with-printed-text shape matches the owner's "quote the printed clause" rule. |
| 10 | **Frozen campaign input** | The game gets a frozen copy of the log at setup and returns writes at the end; it never reads campaign storage. Saved games replay without the campaign. | quincarter `campaign-state.ts`, `CampaignAttempt` | S (as a rule) | High. Keeps the engine pure and replays deterministic. |
| 11 | **Campaign save shape** | Log + position (next node, resolved, progress) + seed and RNG state + history (per attempt: outcome, game id, log-before snapshot, step trace, seed) + in-flight attempt + status + definition version stamp (mismatch marks it incompatible). Retry restores the node-start snapshot. | quincarter `CampaignLog`, `LossPolicy` | M | High. Gives retry, replay of a lost deal, and a readable "what changed" trace. |
| 12 | **Log delta view** | Turns the step trace into per-instruction rows ("spent 4, earned 3") by diffing cumulative writes against the previous step. | quincarter `campaign-log-deltas.ts` | S | Medium. Makes the between-scenario screen show what the engine did, in plain words. |
| 13 | **"Handled for you" briefing list** | Before each scenario, lists the automated setup steps as plain sentences (story file can reword a log fact; printed rule shown under it). | quincarter `HandledFact`, briefing model | S | Medium. Matches "screen text matches engine". |
| 14 | **Derived achievements** | Achievements are pure functions over finished-game records: fold history once into a facts object; each definition = id, name, description, family, points, progress `measure(facts)`; bulk-generate from content (one per enemy, tiers from a table). Nothing stored, so no save migration. | quincarter `achievements.ts` | M | High. Fits "no save fixing"; new achievements apply to old games at once. |
| 15 | **Game summary on the save row** | Small versioned summary written when a game ends (result, loss reason, rounds, per-player counts), with a backfill that replays old games when the version rises. | quincarter `game-summary.ts`, `stats-backfill.ts` | M | High. Common source for achievements, records and a stats screen. |
| 16 | **Achievement toast with stack** | Seen-set in storage; first run records silently; badge pops, bar opens with name and reward, holds, folds; several stack into one counted toast that opens into a list; hold time, position and off in settings; second kind for unlocked extras. | quincarter `view/achievement-toast.ts`, `scenes/achievement-toast.ts` | M | Medium (1.1 effect, 1.2 sound). |
| 17 | **Trophy list screen** | Families as foldable headings, progress bars, sort options, state as a word (earned/locked), locked rows say how to earn, rank title and bar from lifetime points. | quincarter `trophy-room.ts` | M | Medium. |
| 18 | **Engine-event call-outs** | In-game feats declared as listeners with condition functions on engine messages (first defeat, streak of N in one phase, record maximum); shown as a brief centred text. | sdolle1775 `game/rule/achievement.py`, `achievement-bar.css` | S | Low to medium. Cheap liveliness; pairs with item 14 for in-game detection of feats the summary cannot derive. |
| 19 | **Challenge as content** | A challenge is a content item in the card-effect language: a setup restriction plus triggered penalties, selectable before a game. | sdolle1775 `cards/pack/challenges/` | S | Medium. Adds replay value with no new engine code where a game has official variants. |
| 20 | **Earned mini stories** | A specific achievement unlocks a short comic or picture in an Extras screen, read in the same panel reader, with a credit line. | quincarter `docs/achievements.md` team-up stories, `side-story-reader.ts` | S (after 1 and 14) | Medium. |

Suggested order: 2 and 7 (data and text modal, fit 1.0), then 1, 4, 5, 6 (panel reader, 1.1), then 14, 15, 16, 17; 8 to 13 only when a game with a campaign is planned.

---

## What was read

Read in part means the header comments, type declarations and the listed line ranges only.

**quincarter** (via `git show`)
- `packages/client/src/campaign/story.ts` (lines 1-420 and export list)
- `packages/client/src/campaign/comic-beats.ts` (whole)
- `packages/client/src/campaign/stories/mts.ts` (lines 1-70)
- `packages/client/src/campaign/scenario-intros.ts` (lines 1-60)
- `packages/client/src/scenes/scenario-intro.ts` (comments and control lines only)
- `packages/client/src/ui/comic-reader.ts` (lines 1-75, declaration list, timing constants)
- `packages/client/src/scenes/campaign/beat.ts` (lines 1-60, timing lines)
- `packages/client/src/scenes/campaign/opener.ts` (lines 1-50, skip/music lines)
- `packages/client/src/view/campaign-beat-model.ts` (whole)
- `packages/engine/src/campaign-state.ts` (lines 1-170)
- `packages/engine/src/campaign.ts` (lines 1-135, 178-212, 995-1010, 1209-1310, declaration list)
- `packages/client/src/engine/campaign-storage.ts` (lines 1-70)
- `content-packs/sample-scenario/campaigns/sample-scenario-crisis.json` (lines 1-80)
- `packages/client/src/view/campaign-log-deltas.ts` (lines 1-25)
- `docs/achievements.md` (lines 1-70)
- `packages/client/src/progression/achievements.ts` (lines 1-216, 358-385, export list)
- `packages/client/src/view/achievement-toast.ts` (lines 1-60)
- `packages/client/src/scenes/achievement-toast.ts` (lines 1-40)
- `packages/client/src/progression/unlocks.ts` (lines 1-60)
- `packages/client/src/engine/game-summary.ts` (lines 1-60)
- `packages/client/src/scenes/trophy-room.ts` (lines 1-22), `scenes/player-stats.ts` (lines 1-25)
- File listing of the whole tree (names only)

Not opened in quincarter (described from names or from references in the files above): `view/comic-reader-model.ts`, `view/comic-pan.ts`, `campaign-service.ts`, `aftermath.ts`, `rewind.ts`, `finale.ts`, `saga.ts`, `run.ts`, `side-story-reader.ts`, `extras-reader.ts`, `docs/campaign-mode-design.md`, `docs/campaign-client-per-box.md`, the other ten `stories/*.ts`, `packages/cards/src/campaigns/*.ts`, `global-stats/`.

**halogenandtoast**
- `frontend/src/components/StoryReading.vue` (whole), `frontend/src/locales/en/story.json` (first 1500 characters), `frontend/src/campaigns.ts` (whole), `src/Marvel/Campaign.hs` (lines 1-40 and declaration list), `src/Marvel/Campaign/Steps.hs` (lines 1-70), `src/Marvel/Stats.hs` (whole), `src/Marvel/Log/Narrator.hs` (lines 1-30), grep hits in `Game.vue` and `Campaign.vue`.
- Not opened: `Campaign.vue` body, `CampaignBar.vue`, per-box `Campaign/*.hs`.

**sdolle1775**
- `game/rule/achievement.py` (whole), `cards/pack/challenges/2401_the_ground_is_lava.py` (whole), `game/game_run/campaign_settings.py` (lines 1-80), `game/operate/campaign_logs.py` (lines 1-60), `cards/pack/trors/campaign.py` (lines 1-40), `public/css/marvel/achievement-bar.css` (lines 1-40), grep lines from `game/statistics/*.py`, `public/js/marvel/client.ts`, `notify.ts`, `settings.ts`, `marvel.html`.
- Not opened: `game/ability/factory/campaign.py`, `game/scene/replay/campaign.py`, `public/js/marvel/history.ts`, unit tests.

## Not found

- Typewriter / typed-text effect: in none of the three.
- Voiced or timed auto-advancing dialogue: none (quincarter advances on the player's input; only the stage splash auto-closes).
- quincarter: no branching story text beyond `comicFor(villain)`; campaign branching is the `choice` graph.
- halogenandtoast: no cutscenes, no achievements, no statistics or records, no campaign select beyond a list with box art.
- sdolle1775: no story of any kind, no scenario graph, no campaign history, no achievement list screen, no persistent unlocks.
- Nothing was run or installed from any repo.

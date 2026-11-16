# Campaign, story and achievements: survey of three public repos

Read-only survey, 15 Nov 2026. Shallow clones, nothing run or installed. Licences: ArkhamHorror has none, LordOfTheRings is treated as none (ideas only, as briefed), arkham.build is AGPL. Everything below is ideas described in words; no code was copied.

Paths are relative to each repo root. `L/` = `backend/arkham-api/library/`, `F/` = `frontend/src/`.

---

## 1. halogenandtoast/ArkhamHorror

### 1.1 Campaign

**What exists**

- `L/Arkham/CampaignStep.hs` - the step type and the "continuation" wrapper.
- `L/Arkham/CampaignLog.hs` - the campaign log shape and its pure update functions.
- `L/Arkham/Campaign/Types.hs` - the campaign state record and the per-campaign interface.
- `L/Arkham/Campaign/Runner.hs` - one shared runner handling every generic campaign message.
- `L/Arkham/Campaign/Campaigns/<Name>.hs` - one file per campaign (flow + interludes); `StandaloneCampaign.hs` for single scenarios.
- `L/Arkham/Campaigns/<Name>/Key.hs`, `CampaignSteps.hs` - per-campaign log keys and named step aliases.
- `L/Arkham/Campaign/Option.hs`, `ContinueOption.hs`, `Overlay.hs` - options, extra continue-screen actions, side-story offers.
- `F/arkham/types/Campaign.ts`, `Log.ts`, `CampaignStep.ts`, `CampaignSettings.ts`; `F/arkham/components/CampaignLog*.vue` (12 parts), `ContinueCampaign.vue`, `UpgradeDeck.vue`, `NewCampaign/*`; `F/arkham/data/<campaign>.json`.
- `L/Api/Handler/Arkham/Undo.hs` - undo, including "undo to start of scenario".

**How it works**

- **Step as a tagged value.** A campaign step is one of: prologue (optionally "part n"), scenario(id), scenario with options, interlude(number, optional variant key), interlude part, choose decks(then step), upgrade deck(then step), epilogue, a per-investigator step, resupply point, checkpoint(n), a free-form "campaign specific" step (text key + optional argument), a "campaign option" step (key + step to return to), a standalone side scenario(id, step to return to), and the *continuation* wrapper. Steps that are detours (upgrade, choose decks, side scenario, option) carry the step to return to inside themselves, so no separate stack is needed.
- **Continuation screen.** After each step the campaign does not jump to the next step: it wraps it as `continue(nextStep)` with flags (can upgrade decks, can choose a side story, lead player). The runner turns this into a single question to the lead player, shown by `ContinueCampaign.vue` as the between-scenarios hub: next step name and kind, Continue, Upgrade decks, pick a side story (with XP cost), roster changes (retire/add investigator), and any campaign-specific extra buttons (`ContinueOption`: key, label, available). Choosing an extra option runs it and lands back on the same screen.
- **Flow is a pure function.** Each campaign implements `nextStep(state) -> step | none`. Linear campaigns are a three-line mapping (Night of the Zealot). Branching reads only campaign state: completed steps ("has played X"), the stored resolution per scenario, the log, and options (Dunwich: play the two opening scenarios in either order; skip Interlude 2 when Blood on the Altar ended with no resolution; insert an optional interlude when an option is set). `none` means game over.
- **Normalised step.** A helper strips parts, options and wrappers so flow and history compare "which step is this" without caring about sub-parts. Completed steps are stored normalised.
- **Campaign log shape.** Seven fields: set of recorded keys; set of crossed-out keys; map key -> count; map key -> list of recorded entries (each entry is "recorded value" or "crossed-out value", typed as card code, trait, etc.); the keys in the order they were recorded (for display); the set of chosen campaign options; a partners map (card -> damage, horror, status). Crossing out moves a key from recorded to crossed-out and removes it from the order list. "Forget" removes a key everywhere. Killed and insane investigators are just two well-known record sets.
- **Log keys.** Each campaign declares its own closed list of keys (11 for Night of the Zealot); a wrapper type unions them. Display names live in the locale files (`campaignLog.json`: key in camelCase -> printed sentence), not in the engine.
- **Campaign state record** (what is saved between scenarios): id, name, difficulty, decks per investigator, story cards per investigator, chaos bag, current step, completed steps, resolution reached per scenario, the log, XP breakdown per step (who gained/lost what and why), modifiers per investigator and for all, a free JSON `meta`, a free key-value `store` (text -> JSON, used for trackers), per-campaign used abilities, plus two **history lists**: chaos-bag changes (step, full bag before, full bag after) and count changes (step, key, before, after) so the log screen can show how a total was reached.
- **Runner.** One function handles all generic messages: record / cross out / forget / set insert / set replace / cross out set entries / count set-increment-decrement; store set/increment/insert; scenario resolution (stored by scenario id); killed and insane (appended to the two sets, then a replacement-deck prompt before the next step); add/remove campaign card to a deck; spend/report XP (grouped under the current step); next step (ask `nextStep`, push the step, mark the old one completed); deck upgrade and deck choice steps. Campaign files only handle their own prologue/interludes/epilogue/options and fall through to the runner.
- **Scenario side.** A scenario's resolution handler is a switch on resolution number; each branch shows the resolution text with XP, then calls `record(key)`, trauma, add story card with a choice, etc. (seen in The Gathering). The same calls work in standalone because a scenario without a campaign gets a throwaway "Standalone campaign" (id "00") whose `nextStep` is always none, and the frontend reads `scenario.standaloneCampaignLog` as the log.
- **Standalone setup as data.** `F/arkham/data/<campaign>.json` lists each scenario with `settings` that let the player pre-fill the log when starting mid-campaign: toggle a key, pick one of several keys, toggle crossed-out entries in a set, pick a number, toggle an option. Settings can be conditional on other settings through a small condition language (key, inSet, crossedOut, count with lte/gte, option, and/or/not/nor), and a chosen resolution can force settings. Types are in `CampaignSettings.ts`.
- **Campaign log screen.** Tabs for log / achievements; sections for recorded keys, crossed-out keys (struck through), recorded sets, counts with history, chaos bag with change history, XP breakdown per step, per-investigator sections (trauma, supplies, story cards), partners, special rules, an "about" panel, and campaign-specific widgets (calendar, map, key status) driven by the free `meta`. A debug editor can edit the log.
- **Options.** Campaign options are a set of tags stored in the log (e.g. "perform intro", a campaign variant, a narrative variant, "add story asset X"). The campaign handles each when it is applied.
- **Undo.** The server stores numbered steps of the whole game (campaign state included, since the campaign is part of game state). Undo endpoints: one step, to start of action / turn / phase / round, and "to start of scenario" (rolls back to scenario step 1). Whether undo can cross back into the previous scenario or the continuation screen was not verified.
- **Trauma.** Applied by helpers called from resolutions (`sufferMentalTrauma`); "Purchase Trauma" exists as a runner case. The trauma storage itself was not opened.

### 1.2 Story / cutscene

**What exists**

- `L/Arkham/Text.hs` - the flavour-text document type.
- `L/Arkham/FlavorText.hs` - a small builder vocabulary over it.
- `L/Arkham/Helpers/Narrative.hs` - narrative variants (alternative prose).
- `F/arkham/types/FlavorText.ts`, `F/arkham/components/StoryQuestion.vue`, `StoryEntry.vue`, `Story.vue`.
- `F/locales/<lang>/<campaign>/base.json` and `.../scenarios/<scenario>.json`; `F/locales/en/narratives/`.

**How it works**

- **Story text is a small document tree, not a string.** A flavour text = optional title + list of entries. Entry kinds: plain text; i18n key with variables; header (level, key); list with nested items; columns; composite; card image (with small / remove / select modifiers); token image and token "morph" (from -> to); tarot; numbered footnote; horizontal split; and "modify(entry, modifiers)". Modifiers are presentation tags: blue, green, red, bordered, right-aligned, centred, nested, plain, resolution, checkpoint, interlude, codex, haunted, by-difficulty, "return-to" change marker, and **valid / invalid**.
- **Valid/invalid branches.** An interlude that says "if X, read A; otherwise read B" is shown whole, with the branch that applies marked valid and the other invalid (greyed), computed from the log. The player sees why they got the outcome. Same device for setup lists (lines that apply at this difficulty).
- **Engine holds keys only.** The engine sends i18n keys under a scope (`campaign.scenario.intro.title` / `.body`, `resolutions.resolution1`), plus variables such as `{xp}`. All prose is in locale JSON, as HTML-ish strings (`<h1>`, `<p>`, `*italics*`, inline icon images through a path variable). Five languages share one engine.
- **Sequencing.** A story beat is a question sent to the player ("read this"), so the game waits until it is answered; several beats in a row are several questions. Parts (`PrologueStepPart n`, `InterludeStepPart`) split long beats into resumable steps. No timed cutscenes, typewriter or skip-all were seen; advance is the answer button.
- **Story choices.** "Story with choose one": the flavour body followed by labelled choices, each mapped to an effect (Dunwich prologue: pick which scenario to play first -> sets the next step). The story panel can also show cards to pick (including face-down, flippable ones), token choices, portrait choices (which investigator), and scenario box images.
- **Scenario intro on demand.** "Perform intro" is a campaign option, so the intro can be skipped at setup.
- **Narrative variants.** A community rewrite of a campaign's prose is selected at creation and stored as an option; it is a locale namespace merged over the original plus per-beat overrides (replace a block, replace a resolution's flavour while keeping its mechanics, pick a different key, add an extra beat, omit a beat). Mechanics never change.
- **"Return to" deltas.** Setup lists for the remixed version show the original line and mark the changed/added lines, using a `returnTo` sub-block in the same locale file.
- `Story.vue` is a different thing: story *cards* on the table (flip, abilities, crossed-off marks), not narrative flow.

### 1.3 Achievements

**What exists**

- `L/Arkham/Achievement.hs`, `L/Arkham/Achievement/Types.hs` - ids, lists per campaign, checklists, earn helpers.
- `L/Arkham/Campaign/Campaigns/<Name>/Achievements.hs` - detection, one module per campaign (13 present).
- `L/Arkham/Homebrew/AchievementDefs.hs` - open-ended ids for add-on campaigns.
- `L/Api/Handler/Arkham/Achievements.hs`, `L/Api/Handler/Arkham/Games/Shared.hs` - storage, list, clear, toast.
- `F/arkham/achievements.ts`, `types/Achievement.ts`, `components/AchievementToast.vue`, `components/CampaignLogAchievements.vue`, `views/Achievements.vue`, `F/locales/en/gameBoard/achievements.json`.
- `L/Api/Handler/Arkham/Admin/GameStats.hs`, `F/views/AdminGameStats.vue` exist (admin statistics) but were not opened.

**How it works**

- **Declared as ids only.** Each campaign has a closed list of achievement ids (the printed official lists; names like "Line in the Sand" disambiguated per campaign because the stored name is the flat id). A catalogue on the frontend maps id -> campaign (and optional sub-part); name and description live in i18n (`entries.<id>.name` / `.text`). Add-on campaigns use ids of the form `:<campaign>:<key>` so the campaign can be read off the id without a registry.
- **Detected by observing the message stream.** Each campaign's detection module is a function "given the message being processed, maybe earn". It is called before anything else handles the message, so the pre-state is still visible (a defeated enemy can still be queried). Patterns seen: earn on a specific log key being recorded; earn on a win record if a tracker is still 0 ("no ghouls defeated"); earn on a count threshold; earn on a set reaching N distinct entries; earn when difficulty is Expert on a win; earn when N handicaps are active; earn when a choice is declined (hooked at the choice site).
- **Trackers live in campaign state.** Counters and flags go in the campaign's key-value store under prefixed names, so they persist across scenarios and are rewound by undo. A "bump then check" pair avoids lost increments: the increment is a message, and the threshold check runs when that message has landed.
- **Engine never stores earns.** Earning pushes an "earned" message, gated on a per-game "achievement tracking" setting and on the campaign being eligible. The layer outside the engine watches the messages of one action, and after the game state is committed inserts one row per player per achievement (unique, so re-fires are harmless), then sends an unlock toast.
- **Row shape:** user, achievement id, earned-at (null while only progress), game id (kept for a "view game" link, null if the game was deleted), progress (JSON).
- **Checklist achievements across playthroughs.** Some achievements are "do each of these N things over several campaigns". The declaration is a list of stable item keys; detection reports completed items; storage merges them into the row's progress and sets earned-at when all are present. The screen shows the checklist with ticks.
- **Shown** in three places: a toast (title, name, text); a tab in the campaign log (this campaign's list, earned ones dated, checklists expanded); a global page grouped by campaign with "x of y earned" and a percentage bar, official/homebrew tabs, and clear buttons (one, a campaign, all) with confirmation.
- **Challenge scenarios / unlocks:** not found as a distinct feature. The closest are "Ultimatums and Boons" (optional handicaps/bonuses chosen at setup, some achievements require N of them) and difficulty levels.

---

## 2. halogenandtoast/LordOfTheRings (quick check)

**Campaign** - exists. `src/LordOfTheRings/Campaign.hs`, `src/LordOfTheRings/Helpers/Campaign.hs`, `frontend/src/campaigns.ts`, `frontend/src/views/Campaign.vue`, `frontend/src/components/CampaignRow.vue`.

- **Chain as plain data.** A campaign definition is id, name, and an ordered list of (scenario id, optional campaign card). `nextScenario(log)` is the first one not yet completed; each scenario unlocks only when the previous one is won. A campaign can also be declared as "parts 4-5 of another".
- **Log is a value handed to each game.** The server keeps the log with the campaign between games and gives a copy to each scenario; the scenario reads it in setup and writes it on a "resolve campaign" step run only after a win. Shape: campaign id; heroes per seat; fallen heroes; threat penalty (global and per seat); the campaign pool (card, optional seat, optional hero it is permanently attached to); notes (key -> cards); counts (key -> card -> number); completed scenarios with score; unspent XP; marked checkboxes per upgradable card.
- **Pure helper set over the log:** record / recorded, recordCount / recordedCount, gain/spend XP, mark, add to pool, record fallen, locked heroes, seat deck (deck plus pool cards), next scenario. All log changes are pure functions, easy to test.
- **Campaign screen** prints the log like the paper sheet: completed scenarios with scores and total, pool grouped into boons and burdens by seat or attached hero, fallen heroes, and the button to the next scenario.

**Story** - exists, simpler than Arkham. `frontend/src/components/StoryModal.vue`, `frontend/src/locales/en/story.json` (4,440 lines).

- Story is frontend-only data keyed by scenario slug: `intro`, `campaignIntro` (replaces intro in campaign play), `setup`, `rules` (title + text), `tips`, `easy` / `nightmare` (shown only in that mode), `resolution`, `campaignResolution`. Each is a list of paragraphs; a paragraph of `---` is a divider.
- One modal with two parts, "intro" (before play: flavour, setup, special rules, tips, mode rules) and "resolution" (after a win). The engine does not sequence it.

**Achievements** - do not exist (0 matches).

---

## 3. arkham-build/arkham.build (AGPL, check only)

- **Campaign log, trauma tracking, achievements: do not exist.** The only "trauma" hit is deck description text in a test; "achievement" appears only in rules text.
- **What exists** is reference data, not play state: `shared/src/schemas/campaign.schema.ts` (campaign = code, cycle, name, ordered scenario codes, optional `variant_of_code`, optional campaign guide URL, with a translation overlay holding only name and URL); `shared/src/schemas/scenario.schema.ts`; `frontend/src/pages/campaign/campaign.tsx` and `campaign.helpers.ts` (resolve which encounter cards a campaign uses from its scenarios' encounter sets); `frontend/src/components/content-guide-link.tsx` (link out to the official guide PDF).
- Deck upgrades between scenarios exist as deck history (test fixtures `test/fixtures/decks/upgrades/`), not opened.
- Usable idea: a campaign variant declared as "variant of X" with its own scenario list; translation as a thin overlay of only the translatable fields.

---

## Kit candidates

Effort: S = under a day, M = a few days, L = a week or more. All game-agnostic, TypeScript, single player.

| # | Name | What it does | Source | Effort | Gain |
|---|------|--------------|--------|--------|------|
| 1 | **CampaignLog** | Pure data + functions: recorded keys, crossed-out keys, counts, record sets with per-entry crossed-out, record order, options. `record`, `crossOut`, `forget`, `setInsert`, `crossOutEntry`, `count`, `has`. Keys are strings typed per game; printed sentences come from i18n. | Arkham `CampaignLog.hs`, Runner; LOTR `Campaign.hs` | S | Every campaign game needs it; pure, so trivially testable and undoable. |
| 2 | **CampaignStep + flow function** | Tagged step union (prologue, scenario, interlude, upgrade, epilogue, custom, side scenario) where detour steps carry their return step; per-game `nextStep(state)`; `normalise(step)`; completed-steps and resolution-per-scenario history. Linear campaigns are an ordered list (LOTR style); branching ones a function over state. | Arkham `CampaignStep.hs`, `Campaigns/*.hs`; LOTR `CampaignDef` | M | One runner for all games; branching is data-readable and unit-testable without playing. |
| 3 | **Continuation hub** | The between-scenarios screen as one engine question: next step name/kind, Continue, Upgrade, side content, plus game-declared extra actions (key, label, available) that return to the same screen. | Arkham `ContinueCampaignStep`, `ContinueOption.hs`, `ContinueCampaign.vue` | M | A single stable place for everything that happens between scenarios; natural save point and undo boundary. |
| 4 | **Campaign save shape** | Standard record: id, difficulty, step, completed steps, resolutions, log, carried cards/decks, XP ledger per step, free `meta`, key-value `store`. Campaign is part of game state, so step-snapshot undo covers it. | Arkham `Campaign/Types.hs` | S | One save format across games; trackers and odd per-game state have a home (`store`, `meta`). |
| 5 | **Standalone = degenerate campaign** | A scenario started alone gets a throwaway campaign whose `nextStep` is always "end", so `record`, XP and story calls work unchanged. | Arkham `StandaloneCampaign.hs` | S | No "if campaign" branches in scenario code. |
| 6 | **Mid-campaign start settings** | Per-scenario data describing what the player may pre-set when starting at that scenario (toggle key, pick one key, toggle crossed-out entries, number, option) with a small condition language (key, inSet, count, and/or/not). Generic form renderer. | Arkham `CampaignSettings.ts`, `data/<campaign>.json` | M | Play any scenario with a chosen history; doubles as a test fixture builder for branches. |
| 7 | **Change history for log values** | For each count or tracked pool (bag, deck), store (step, before, after) so the log screen shows how a total was reached. | Arkham `ChaosBagChange`, `RecordCountChange` | S | Answers "why is this 5?"; cheap, and the kind of thing a digital version does better than paper. |
| 8 | **XP / reward ledger** | Rewards reported as entries (who, source, label, amount) grouped by campaign step; spent amounts are negative entries. | Arkham `XpBreakdownStep`, `ReportXp` | S | Clear per-scenario breakdown screen; no hidden totals. |
| 9 | **StoryDoc** | Story text as a small tree: title + entries (i18n paragraph with variables, header, list, columns, card image, icon/token, footnote, divider) with presentation modifiers (resolution, interlude, boxed, colour). Engine emits keys only; prose in locale JSON. One renderer component. | Arkham `Text.hs`, `FlavorText.hs`, `FlavorText.ts`, `StoryEntry.vue` | M | One themed story panel for intros, interludes, resolutions, setup lists in every game; translation-ready. |
| 10 | **Valid / invalid branches** | In a story or setup list, show all "if ... / otherwise ..." branches and mark the one that applied (others greyed), computed from the log. | Arkham `validate` modifier | S (on top of 9) | The player sees why the story went this way; mirrors the printed guide exactly, which fits "screen text matches engine". |
| 11 | **Story beat as a question** | A story beat is an engine question the player answers to advance; variants: read-only, choose one label, pick a card (face-up or face-down), pick a character. Long beats split into numbered parts that are separate, resumable steps. | Arkham `storyWithChooseOne`, `StoryQuestion.vue`, `*StepPart` | S | Story choices use the same decision/undo machinery as gameplay; save mid-interlude works. |
| 12 | **Scenario story sheet** | Simple per-scenario JSON: intro, campaignIntro, setup, special rules (title + text), tips, per-mode rules, resolution, campaignResolution; one modal with "before" and "after" parts, reopenable any time. | LOTR `StoryModal.vue`, `story.json` | S | Cheapest way to give every scenario its book text; good fit for games with no interludes. |
| 13 | **Narrative overlay** | Alternative prose (variant or remix) as a locale namespace merged over the base plus optional per-beat overrides; mechanics untouched. Same device marks "changed lines" for remixed setups. | Arkham `Helpers/Narrative.hs`, `returnTo` blocks; arkham.build `variant_of_code` | M | Designer's-latest vs first-printing text, or expansions that rewrite a scenario, without forking scenario code. |
| 14 | **Achievement catalogue** | Ids grouped by campaign/game (optional sub-part); name and text in i18n; optional checklist of stable item keys. | Arkham `Achievement/Types.hs`, `achievements.ts`, `achievements.json` | S | Declares the whole list as data; screen and tests read the same list. |
| 15 | **Achievement observer** | Detection as a function over the engine's event/message stream, run before the event is applied; earns are emitted as events and stored outside the game state, once, after the state is saved. Trackers (counters, flags, seen-sets) live in the campaign store so undo rewinds them; "bump then check" for thresholds. | Arkham `Campaigns/*/Achievements.hs`, `Achievement.hs`, `Games/Shared.hs` | M | Achievements never touch rules code (fits an engine freeze); undo-safe; idempotent. |
| 16 | **Cross-playthrough checklist** | Progress row per achievement (earned-at or null, progress items, source game); items merge across games; earned when complete. | Arkham `achievementChecklist`, `applyAchievementProgress` | S (on top of 15) | "Win with every character" style goals with visible ticks. |
| 17 | **Achievement screens** | Unlock toast; a tab in the campaign log for this campaign; a global page grouped by game with x-of-y and a bar; clear one / group / all with confirmation; per-game on/off setting. | Arkham `AchievementToast.vue`, `CampaignLogAchievements.vue`, `views/Achievements.vue` | M | Complete, reusable presentation; only theming differs per game. |
| 18 | **Campaign log screen sections** | Section components: recorded/crossed-out keys, sets, counts with history, rewards per step, per-character carry-over (trauma, story cards), completed scenarios with scores, pool of boons/burdens, plus a slot for game-specific widgets fed by `meta`. | Arkham `CampaignLog*.vue`; LOTR `views/Campaign.vue` | M-L | Mirrors the paper log sheet; most sections identical across games. |

Suggested order: 1, 2, 4, 5 (the campaign core, small), then 9-11 (story), then 14-15 (achievements); 3 and 18 when the first campaign game reaches its between-scenarios screens.

---

## What was read

Opened in part or in full (code lines only, comments and imports mostly filtered; long files sampled):

ArkhamHorror, backend: `Arkham/CampaignStep.hs` (full), `Arkham/CampaignLog.hs` (full), `Arkham/Campaign/Option.hs`, `ContinueOption.hs`, `Overlay.hs` (full), `Arkham/Campaign/Types.hs` (first ~170 lines), `Arkham/Campaign/Runner.hs` (case list, lines 85-98, 120-160, 477-625), `Arkham/Campaign/Campaigns/NightOfTheZealot.hs` (full), `TheDunwichLegacy.hs` (first ~170 lines), `StandaloneCampaign.hs` (full), `Arkham/Campaigns/NightOfTheZealot/CampaignSteps.hs` and `Key.hs` (full), `Arkham/Campaign/Campaigns/NightOfTheZealot/Achievements.hs` (full), `Arkham/Achievement.hs` (full), `Arkham/Achievement/Types.hs` (about two thirds), `Arkham/Homebrew/AchievementDefs.hs` (type only), `Arkham/Text.hs` (first ~110 lines), `Arkham/FlavorText.hs` (full), `Arkham/Helpers/Narrative.hs` (first ~70 lines), `Arkham/Scenario/Scenarios/.../TheGathering.hs` (intro and resolution parts), `Api/Handler/Arkham/Achievements.hs` (full), `Api/Handler/Arkham/Games/Shared.hs` (achievement lines only), `Api/Handler/Arkham/Undo.hs` (grep of headers, scenario-undo part).

ArkhamHorror, frontend: `arkham/types/FlavorText.ts`, `types/Campaign.ts`, `types/Log.ts`, `types/CampaignSettings.ts`, `types/Achievement.ts`, `arkham/achievements.ts` (first ~90 lines), `components/StoryQuestion.vue` (script, part), `components/StoryEntry.vue` (template, top), `components/Story.vue` (script, top), `components/CampaignLog.vue` (declaration headlines only), `components/ContinueCampaign.vue` (declaration headlines only), `components/CampaignLogAchievements.vue` (script), `views/Achievements.vue` (script, top), `components/AchievementToast.vue` (props), `data/nightOfTheZealot.json`, `data/campaigns.json` (head), `locales/en/nightOfTheZealot/base.json` and `scenarios/theGathering.json` (heads), `locales/en/campaignLog.json` (head), `locales/en/gameBoard/achievements.json` (head).

LordOfTheRings: `src/LordOfTheRings/Campaign.hs` (first ~130 code lines, the log and definition types, function signature list), `frontend/src/campaigns.ts` (top), `frontend/src/components/StoryModal.vue` (script, top), `frontend/src/locales/en/story.json` (head), `frontend/src/views/Campaign.vue` (script, top).

arkham.build: `shared/src/schemas/campaign.schema.ts` (full), `frontend/src/pages/campaign/campaign.helpers.ts` (top); file-name and term search over `frontend/src`, `backend`, `shared`, `functions`.

## Not found / not verified

- **Achievements:** none in LordOfTheRings; none in arkham.build.
- **Campaign log / play state / trauma tracking:** none in arkham.build (reference data and deck history only).
- **Challenge scenarios and unlockable content** as a distinct system: not found in any repo. Arkham has optional handicaps ("Ultimatums and Boons") and difficulty only.
- **Player statistics / records** (win rates, best scores): not found for players. Arkham has an admin stats page (`AdminGameStats.vue`, `Admin/GameStats.hs`), not opened. LOTR stores a score per completed scenario in the campaign log.
- **Cutscene features** (timed sequences, typewriter text, skip-all, voice): not found. Story is read-and-confirm panels.
- **Undo across scenario boundaries:** Arkham has "undo to start of scenario" and step undo; whether a step undo can go back through the continuation screen into the previous scenario was not verified. LOTR undo was not checked.
- **Trauma storage and deck-upgrade internals** in Arkham (`UpgradeDeck.vue`, `Helpers/Xp.hs`, `Helpers/Campaign.hs`, `CampaignLogKey.hs`): located, not opened.
- Arkham's `README` and docs folder were not read; the other 12 campaigns' flow files were not opened (only Night of the Zealot and Dunwich).

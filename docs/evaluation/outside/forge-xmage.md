# Forge and XMage survey for game-kit (15 Nov 2026)

Read-only survey. Nothing was built or run. Both URLs worked as given.

| Repo | Head read | Licence (LICENSE file read) | What it allows |
|---|---|---|---|
| Card-Forge/forge | `50b6a8f` (2026-11-15) | GPL-3.0 (`LICENSE`) | Ideas only. Write new; never paste code or card scripts. |
| magefree/mage (XMage) | `cb1a4ee` (2026-11-15) | MIT (`LICENSE.txt`, "Copyright (c) 2010 betasteward@gmail.com") | Code may be lifted with its notice. It is Java, so in practice it is a port anyway. |

Paths below are relative to each repo root. Sizes: S = under a day, M = a few days, L = more.

## Coverage: what was actually read

Evidence is excerpts: method lists by grep, and selected bodies. A worker must read the bodies before building.

**Forge, read in full or nearly:** `docs/AI.md`; `docs/Card-scripting-API/Card-scripting-API.md`, `Costs.md`, `Replacements.md`, `Restrictions.md`, `Statics.md`, `Targeting.md` (lines cut at 300-400 characters); first 90 lines of `AbilityFactory.md`, first 60 of `Triggers.md`; `forge-ai/.../AiPlayDecision.java`; `forge-game/.../replacement/ReplacementLayer.java`; 3 card scripts (`abzan_charm`, `aetherflux_reservoir`, `ajani_goldmane`) plus hint counts by script over the 1,962 scripts in `forge-gui/res/cardsfolder/a/`; first 70 lines of `forge-gui/res/ai/Default.ai` and its diff against `Reckless.ai`.
**Forge, excerpts only (signatures, selected line ranges):** `AiController.java`, `SpellAbilityAi.java` (lines 40-110 read), `SpellApiToAi.java`, `AiCardMemory.java`, `ComputerUtilAbility.java`, `ComputerUtil.java` (runaway guard), `AiAttackController.java` (aggression levels only), `simulation/GameSimulator.java`, `GameCopier.java`, `GameStateEvaluator.java`, `SimulationController.java`, `forge-game/.../ability/ApiType.java`, `AbilityFactory.java`, `replacement/ReplacementHandler.java`, `forge-core/.../card/CardRules.java`, test `AITest.java` (signatures), `attacking/BasicAttackTests.java` (first 60 lines), headings of `docs/Development/DevMode.md`, top of `docs/Missing-Cards-in-Forge.md`.
**Forge, not read:** `AiBlockController`, `ComputerUtilCombat`, `ComputerUtilCard`, `ComputerUtilMana`, `SpecialCardAi`, every `forge-ai/.../ability/*Ai.java` body, every `FlatMonteCarlo*`/combo file, trigger and static-ability handlers, `forge-game/.../player/PlayerController.java` (not checked out), any script lint tool, the body of the AbilityFactory.md factories list.

**XMage, read in full or nearly:** `Mage/.../constants/Layer.java`, `SubLayer.java`, `DependencyType.java`; `ContinuousEffects.java` lines 189-256, 850-1010, 1167-1228; `ContinuousEffect.java` (interface); `BatchEvent.java` lines 1-60; `MageObjectReference.java` lines 1-60; `CardTestPlayerAPIImpl.java` lines 252-292 and 1695-1800 plus its public method names and constants; `lki/LastKnownInformationTest.java` lines 20-80; `testapi/PlayerExpectedErrorsApiTest.java` lines 30-75; `VerifyCardDataTest.java` lines 2008-2060 plus its test and check names; `ComputerPlayer6.java` lines 1185-1212 plus signatures and constants.
**XMage, excerpts only:** `Game.java`, `GameImpl.java` (LKI fields and line numbers), `GameState.java` (batch section), `TestPlayer.java` (strict-mode lines), `Duration.java`, `Outcome.java`, tree optimizer class comments, scoring class signatures.
**XMage, not read:** the stack and priority loop (`GameImpl` play loop, `SpellStack`, `Turn`, `Phase`), `PreventionEffectImpl`, triggered-ability collection and ordering, `ComputerPlayer.java`, the MCTS player, `SerializationTest`, `CopyGameStatePerformanceTest`, watcher copy test body, rollback tests, any single-card test. Findings on stack/priority are therefore absent, not negative.

## Findings

Each says which existing row it extends, so nothing in K77-K109 is repeated.

### F1. Unused-answer check and strict-choose mode in the card harness (XMage) - S/M
A test queues actions by turn and step, plus separate queues of choices and targets. After the run, `assertAllCommandsUsed` fails if any queued action, choice or target was not consumed, and prints what is left. In strict mode, a prompt the test did not answer fails at once (`chooseStrictModeFailed`) and prints the unused choices, the table and the available abilities; without strict mode a built-in player answers. Explicit `[choice_skip]` / `[target_skip]` tokens say "stop choosing here", and a skip that no prompt ever met also fails.
- Verified in: `Mage.Tests/src/test/java/org/mage/test/serverside/base/impl/CardTestPlayerAPIImpl.java` (lines 1697-1741, constants 76-141), `Mage.Tests/src/test/java/org/mage/test/player/TestPlayer.java` (lines 77-78, 120, 2159-2190 and the callers listed at 2243-2903).
- Why: K102 has "no prompt left open". This is the other half: no scripted answer left unused, and no prompt silently auto-answered. It catches tests that pass for the wrong reason, the same aim as K77.
- Also there: a pre-run check that no action is queued after the stop point (lines 264-283), and inline `check:` / `show:` commands that assert or print state at a given step in the middle of the run, not only at the end (constants 77-138).

### F2. Tests for the test API itself (XMage) - S
A small folder tests the harness: a wrong card name, an index out of range, or a blocker the player does not control must fail with an exact, readable message.
- Verified in: `Mage.Tests/src/test/java/org/mage/test/testapi/PlayerExpectedErrorsApiTest.java` (lines 30-75); siblings `AliasesApiTest.java`, `CastApiTest.java`, `AddCardApiTest.java`, `WaitStackResolvedApiTest.java` seen by name only.
- Why: `card-harness` messages are what workers read; pinning them stops silent harness regressions.

### F3. No-duplicate-effects check after every test (XMage) - S
After each run the harness groups live continuous effects by effect kind + ability + source and fails when a group has more than one member, i.e. a duration that never ended or an effect added twice.
- Verified in: `CardTestPlayerAPIImpl.java` lines 1744-1795 (`assertNoDuplicatedEffects`).
- Why: a free invariant for K96's registry; add to `card-harness` teardown and to `sim-pool` runs.

### F4. Replacement loop with an applied-set, a chooser and result codes (XMage + Forge) - M
XMage: loop { collect applicable replacement and prevention effects for the event; drop the ones already applied to this event; none left = stop; exactly one = apply; several = the affected player picks by index from a labelled list; record it on the event; if it replaced the event fully, stop; a one-use effect is discarded }. Forge adds two things: fixed ordering classes tried in order (`CantHappen, Control, Copy, Transform, Other`), and a result enum (`NotReplaced, Replaced, Updated, Prevented, Skipped`) where `Updated` means "the event still happens, with changed numbers".
- Verified in: `Mage/src/main/java/mage/abilities/effects/ContinuousEffects.java` lines 850-970; `forge-game/src/main/java/forge/game/replacement/ReplacementLayer.java` (whole), `ReplacementHandler.java` lines 58, 246-320 (excerpt), `docs/Card-scripting-API/Replacements.md`.
- Why: K93 gives cancel/instead and prevention windows as data, but not the generic "several apply, who chooses, each at most once per event" loop. Maps directly onto a reducer: the event carries `appliedIds`, the choice is an ordinary prompt.

### F5. Layered recompute with timestamp order and a wait-for-dependency pass (XMage) - M
Derived values are recomputed from scratch: drop inactive effects, then apply in fixed layers, each layer sorted by a timestamp that is assigned when the effect first becomes active (not when the card was created). Inside a layer, an effect that declares it depends on another not yet applied is parked and applied once its dependencies are done. Control-changing effects loop until control stops changing.
- Verified in: `ContinuousEffects.java` lines 189-256 (timestamps), 971-1010 (`apply`), 1167-1228 (`applyLayer`); `constants/Layer.java`, `SubLayer.java`, `DependencyType.java`; `ContinuousEffect.java` (interface: `getOrder`, `isDependentTo`, `hasLayer`, `isInactive`).
- Why: extends K96 (registry with durations) and K95 (recompute until stable) with the ordering rule. Take: game-declared ordered layers + timestamp-on-activation + optional `after: [tag]`. Do not take the seven MTG layers.
- Maturity: the dependency part is, in its own author's words, "a workaround solution" with a hand-kept enum of 13 dependency kinds.

### F6. Object reference = id + zone-change counter, and last-known snapshots (XMage) - S/M
Every reference to an object stores its id and the number of times it has changed zone; a reference goes stale by itself when the object moves. When an object leaves a zone a snapshot is stored per zone, per id, and per (id, counter); a second "short-living" set is cleared after each action.
- Verified in: `Mage/src/main/java/mage/MageObjectReference.java` lines 1-60; `Mage/src/main/java/mage/game/GameImpl.java` lines 125-129, 3750-3857 (line numbers and field use only); `Mage/src/main/java/mage/game/Game.java` lines 92-156, 315-337; test `Mage.Tests/src/test/java/org/mage/test/lki/LastKnownInformationTest.java`.
- Why: K92 (ghost card) needs exactly this underneath. The counter is a plain integer in state: cheap in a pure reducer, and it removes a whole class of "effect hits the returned copy of the card" bugs.

### F7. Batch events with declared single keys (XMage) - S
Simultaneous events are also wrapped in batch events; a batch declares at construction whether all members share one target, one source or one player, and one event may sit in several batches (all damage / per player / per source). Nesting batches is refused.
- Verified in: `Mage/src/main/java/mage/game/events/BatchEvent.java` lines 1-60; `Mage/src/main/java/mage/game/GameState.java` lines 836-897.
- Why: a concrete data shape for K94's "one or more" triggers. Forge names the same idea "Once" trigger variants (`docs/Card-scripting-API/Triggers.md`, one line).

### F8. Outcome tag on every choice (XMage) - S
Each effect and each prompt carries an `Outcome` (Damage, DrawCard, Sacrifice, Benefit, Detriment, `AIDontUseIt`, ...) with a good-or-bad flag for the chooser. A basic automated player answers any prompt from the tag alone; one pruning pass drops actions tagged `AIDontUseIt`.
- Verified in: `Mage/src/main/java/mage/constants/Outcome.java` (enum list); `Mage.Server.Plugins/Mage.Player.AI.MAD/src/mage/player/ai/mad/optimizers/impl/OutcomeOptimizer.java` (class comment only).
- Why: a one-field addition to prompts that gives `sim-pool` bots, harness auto-answers and K103 opponents a sane default without per-card code.

### F9. Opponent handler per effect verb, with one fixed decision pipeline (Forge) - M
A second registry, parallel to the effect registry, maps every effect verb to an AI handler (157 handler files for 212 effects; trivial verbs share `AlwaysPlayAi`). The base class runs a fixed pipeline: card hint check, timing check, runaway guard, the verb's own logic, "is the cost acceptable", then the chained sub-effects ("drawback" check). The handler also answers that verb's prompts (confirm, choose one, choose number).
- Verified in: `forge-ai/src/main/java/forge/ai/SpellApiToAi.java` lines 1-45; `forge-ai/src/main/java/forge/ai/SpellAbilityAi.java` lines 40-110 and signatures; `forge-game/src/main/java/forge/game/ability/ApiType.java` lines 1-40.
- Why: fits the kit's `OPS` registry exactly: an optional `ai` row per op kind, and a conformance test that every op kind has one or is listed as "always" / "never". K103 has advice per card; this is advice per verb, which covers most cards with no per-card work.

### F10. Reason-coded play decisions (Forge) - S
Every "should I play this" answer is a `(rating, reason)` pair from one enum in three classes: play (`WillPlay`, `Removal`, `ImpactCombat`...), play later (`WaitForCombat`, `WaitForMain2`, `WaitForEndOfTurn`...), do not play (`CantAfford`, `TargetingFailed`, `MissingLogic`, `CurseEffects`, `StopRunawayActivations`...).
- Verified in: `forge-ai/src/main/java/forge/ai/AiPlayDecision.java` (whole), `AiAbilityDecision.java` (record signature).
- Why: gives K103's decision record a fixed vocabulary; `MissingLogic` counts per card become a to-do list, and tests can assert on the reason instead of the move.

### F11. Opponent profiles as data files (Forge) - S
Six profiles (`Default`, `Cautious`, `Reckless`, `Hard`, `Hardest`, `Experimental`) are flat key=value files of about 350 lines, each key commented; behaviour differs only by these values (booleans, thresholds, percentage chances). Code reads them through a typed key enum.
- Verified in: `forge-gui/res/ai/Default.ai` (first 70 lines), diff against `Reckless.ai`; `forge-ai/src/main/java/forge/ai/AiController.java` lines 1515-1523 (getters by signature); `AiProps.java` seen by name only.
- Why: difficulty levels and personalities without code forks; chance values need the seeded random of K108.

### F12. Card-side hint vocabulary and the "opponent cannot use this" flag (Forge) - S
Scripts carry hints in three places: a card line (`AI:RemoveDeck:All|Random|NonCommander`, 237 of 1,962 sampled scripts), hint variables (`PlayMain1` 108, `BuffedBy` 69, `HasAttackEffect` 62, `NonStackingEffect` 25, `NeedsToPlayVar` 10 with a comparator, `SacMe:1-6` 12, `AIPriorityModifier`, `AIEvaluationModifier`), and per-ability parameters (`AILogic$ <name>`, `AITgts$`, `IsCurse$ True`, `AIXMax$`). A deck check lists the cards the opponent cannot play well (`complainCardsCantPlayWell`).
- Verified in: `docs/Card-scripting-API/Card-scripting-API.md` ("Common AI specific SVars"), `AbilityFactory.md` ("Generic AI params"), counts by script over `forge-gui/res/cardsfolder/a/*.txt`, `AiController.java` lines 3520-3527.
- Why: K103 says "advice data beside the records" without a vocabulary. Useful generic kinds: timing (`when: before-combat | end-of-turn`), needs (`playOnlyIf: <count expr> >= n`), inverted polarity (`isCurse`), no-stack (`nonStacking`), sacrifice/discard priority, priority offset, and `aiCannotUse` with a report.
- Maturity warning: `AILogic` is an open string set (25 distinct names in one letter of the alphabet) read by `equals` checks scattered through handlers; take the closed kinds, not the open string.

### F13. Opponent memory sets and runaway guard (Forge) - S
Named sets of cards the opponent remembers between prompts within a turn (mana held for later, "pays this cost already", revealed cards, chosen plan card), cleared on a schedule. A guard stops repeated activation: under 10 is fine, above that the chance to continue is 0.95^n.
- Verified in: `forge-ai/src/main/java/forge/ai/AiCardMemory.java` lines 53-97; `forge-ai/src/main/java/forge/ai/ComputerUtil.java` lines 1442-1459.
- Why: concrete content for K103's "plan record across prompts"; the "already reserved for another cost" set fixes a common double-booking bug.

### F14. Copy-fidelity check and bounded look-ahead (Forge + XMage) - M
Forge: before simulating, score the original and the copy with an evaluator that emits one explain line per term; unequal scores throw, printing the line diff. Look-ahead depth is capped at 3 and results per (host, target) are cached. XMage: alpha-beta minimax over copied games with caps (5,000 nodes, depth = skill, think time = skill x 3 s), a list of pruning passes applied to the action list before expansion, and a repeated-action guard (same action again and the score did not improve = cut).
- Verified in: `forge-ai/src/main/java/forge/ai/simulation/GameSimulator.java` lines 30-58, 131-145 (excerpt); `SimulationController.java` (signatures, `DEFAULT_MAX_DEPTH = 3`); `GameStateEvaluator.java` (signatures); `Mage.Server.Plugins/Mage.Player.AI.MAD/src/mage/player/ai/ComputerPlayer6.java` lines 52-98, 1185-1212; `mad/optimizers/` class comments; `Mage.Server.Plugins/Mage.Player.AI/src/mage/player/ai/score/ArtificialScoringSystem.java` (constants).
- Why: with a pure reducer the copy is free, so the kit can go straight to: evaluator returning `{total, lines[]}`, K89's probe as the simulator, fixed caps as part of behaviour (as the dry-run pattern already says), pruning passes as a list. The explain lines feed K103's decision record.

### F15. Every-card copy / round-trip check (XMage) - S
One test walks every card, copies it and compares original and copy recursively, field by field, with a readable path in the failure. Others in the same file compare every card's data and generated rules text against a reference database, with skip lists where every entry has a reason comment.
- Verified in: `Mage.Verify/src/test/java/mage/verify/VerifyCardDataTest.java` lines 2008-2060 (copy), 155-206 (skip lists), test names at 333-3573.
- Why: kit version = per card, put it in play in a minimal state, `JSON.parse(JSON.stringify(state))` deep-equals the state and the reducer gives the same result from both. Catches non-plain values in state. The data and text comparison parts are already covered by the describe gate, K97 and K109.

### F16. Script format ideas for the card-language pattern note (Forge) - S (docs only)
- One line per ability, `Key$ value | Key$ value`; sub-effects are named variables chained with `SubAbility$` (`docs/Card-scripting-API/AbilityFactory.md`, `abzan_charm.txt`).
- Two ways to name who is affected, never mixed up: `Defined$` (described, not targeted) and `ValidTgts$` (targeted), with `Targeted` / `Remembered` / `Triggered<Name>` to refer back (`Targeting.md`, `Triggers.md`).
- Restrictions (checked when the ability is started) kept apart from Conditions (checked when it resolves) (`Restrictions.md`).
- A cost mini-grammar `Part<amount/type/description>` where the third slot is display text, plus `CostDesc$` to override the whole text (`Costs.md`).
- Convention "do not write default parameters", and `Secondary$ True` for a helper line that must not show in the card's text (`Card-scripting-API.md`, `Triggers.md`).
- A selector grammar `Type.restriction+restriction`, `!` to negate, `,` for or (`Targeting.md`).
- Why: wording for `docs/patterns/card-language.md`. The kit's typed JSON ops are stricter; do not adopt the string format.

## Not worth taking

- **Forge's parser and validation.** Parsing throws a `RuntimeException` at load with the card name (`AbilityFactory.java` lines 138-215, `ApiType.smartValueOf` line 248); parameters are untyped string maps read ad hoc. In the folders read there is no static check for unknown keys. The kit's zod schema + K97 is already better. An unsupported card becomes a placeholder with a warning text (`CardRules.java` 892-902): K109 has that.
- **Forge combat, mana and per-card AI code** (`AiAttackController` 1,938 lines, `ComputerUtilCombat` 2,674, `ComputerUtilMana` 2,255, `SpecialCardAi` 2,177): MTG-specific, and Forge's own doc calls per-card logic "not a healthy approach". The six numbered attack-aggression levels (lines 1621-1657) are the only portable idea, and only for a game with attack/block.
- **Forge's Monte Carlo and combo-plan modules** (`FlatMonteCarloPicker` 2,994 lines, `ComboPlan` 4,143, about 60 test files): deck-archetype knowledge, thread timeouts; not read.
- **XMage class-per-card, `copy()` constructors, synchronized lists, UUIDs**: Java object-model costs a pure reducer does not have.
- **XMage's seven layers and `DependencyType` enum**: MTG rules.
- **XMage MCTS player**: not read; the main AI file itself carries open TODOs on node limits.
- **String-addressed tests** (`"Polis Crusher:2"`, `"activate:Cast "` prefixes): the kit's typed helpers are safer. One check in `execute()` is switched off with `if (true) break; // TODO` (line 287).
- **Reference-database verify, set/booster/image checks**: MTG data plumbing.
- **Forge's setup-state file and headless `sim` command** (`docs/Development/DevMode.md`, `docs/AI.md`): the kit has scenario literals (K102), debug edits (K100) and `sim-pool`.

## Maturity, honestly

- Forge AI: about 82,600 lines in `forge-ai`; broad, old, heuristic. Its own doc: best with aggressive decks, "pretty bad for most combo decks". Kept apart from the rules by one seam (`PlayerControllerAi extends PlayerController`, 119 overrides); no `forge.ai` import was found in the `forge-game` folders checked out (ability, replacement, trigger, cost, staticability only). AI tests set up a board by card name and assert on the predicted move (`forge-gui-desktop/src/test/java/forge/ai/attacking/BasicAttackTests.java`).
- XMage test framework: the most mature thing seen (harness 2,594 lines + test player 4,825), used by thousands of card tests; the checks in F1-F3 are battle-tested.
- XMage engine: replacement loop and layer code are long-lived but carry workaround comments (commented-out `applyEffects` call at 964-968, dependency workaround).
- XMage AI: small (about 3,000 lines), simple minimax with a static score table; fine as a shape, not as a strong player.

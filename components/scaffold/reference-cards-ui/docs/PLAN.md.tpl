# {{name}} bounded card implementation and acceptance plan

## 1. Scope

The original rules are in CARD_RULES.md. game-spec.json declares executable records, independently supplied printed expectations and setup. The shared reference-cards overlay supplies one engine, store, simulator and UI composition. Generation is not evidence of bootstrap or browser acceptance. Additional mechanics require explicit adapters and independent rules.

## 2. Shared preamble

Read AGENTS.md and the pinned component README for each touched contract. Keep kit/ unchanged. Run focused checks locally and reserve full heavy checks for the configured game runner. Changed player flows require actual e2e execution; a build or jsdom does not replace Chromium. Python 3 is required for plancheck. Report unavailable capabilities as not run.

## 3. Rules

CARD_RULE_INVENTORY
- **PLAY-01** Only a card in the acting hand may be played. Illegal and stale choices leave authoritative state unchanged and emit no events.

The inventory and expectations are authored separately from executable effects. tests/acceptance.ts loads the configured records through content-pack, observes real clause resolutions with card-harness, and executes independent traceability assertions. Tests inspect damage, ownership, duration expiry, physical discard, optional refusal and repeated-resolution controls. The game is an original synthetic fixture; no external game's card text or rules are asserted.

## 4. Scenario catalogue

| Scenario | Rules | Expected outcome |
| --- | --- | --- |
| SC-001 | PLAY-01 | Configured content, life, round limit and human/automa setup are applied; illegal and stale choices are refused atomically. |
| SC-002 | PLAY-01 | An open card decision saves, restores and continues with the same full state; one undo and replay preserve the trace. |
| SC-003 | PLAY-01 | Matched-seed live/store and simulation runs reach the same terminal state and answer trace. |
| SC-004 | PLAY-01 | Mounted and native browser flows execute actual human choices, automated responses and undo; the browser reaches a terminal game. |
| SC-005 | CARD_RULE_IDS | Actual loaded-card acceptance proves each independent printed amount or delayed rich rule, rejects semantic mutants and requires declared hidden-world coverage. |

## 5. Layers

Independent card runtime cases and semantic mutants use the real engine. Rule assertions retain complete authoritative state in the refusal control. Paired hidden-world checks compare matched-seed legal-answer payloads and pure-policy decisions while preserving own cards and public history. Store tests cover save/restore, undo/replay and simulation parity. Mounted-content checks require meaningful text and controls. Theme checking checks declared tokens. Browser acceptance exercises actual gameplay; receipt verification cannot replace these oracles.

## 6. Implementation phases

### Phase C1: Configured card and rule evidence

Read CARD_RULES.md and the pinned card-language, card-zones, engine-core, game-store, card-harness and traceability contracts. Run SC-001, SC-002, SC-003 and SC-005. Run cards:check and cards:whole-game. Keep unsupported effect shapes rejected and independent expectations separate from the effects.

### Phase U1: Card presentation and player flow

Read the Rules and the pinned screens, saves, prompt-host, plain-text and theme-check contracts. Run SC-004 through mounted content and the native browser suite. Missing browser execution remains an open gate.

## 7. Session plan

Confidence is a planning estimate, not an observed result. One task observation is counted once even when it supplies several kinds of evidence.

| Batch | Phases | Model | Confidence | Worker | Touches | Gate | Owner | Clauses | Patterns |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | C1 | repository default | 80% | codex | configured content and independent acceptance | npm run check | game maintainer | CLAUSE_COUNT | P-01 |
| S2 | U1 | repository default | 80% | codex | game UI and presentation acceptance | full browser check | game maintainer | 0 | - |

## 8. Reuse map

The exact pin is kit/kit.lock.json's ref. Pull entries must be checked against that installed revision. The current scope review is plan-review/kit-fit.md; no external steward response is invented.

| Layer | Kind | Source |
| --- | --- | --- |
| Engine and state | Pull | `engine-core`, `game-store` |
| Cards and timing | Pull | `card-language`, `card-zones`, `turn-flow` |
| Opponent and simulation | Pull | `automa`, `opponent`, `sim-pool` |
| Screens and persistence | Pull | `app-frame`, `screens`, `settings`, `saves`, `prompt-host` |
| Evidence | Pull | `card-harness`, `traceability`, `plan-checker`, `plain-text`, `theme-check`, `check-runner` |
| Card configuration and synthetic rules | New | build-own: supported records, independent expectations and setup over the shared scaffold adapter |
| Screen: card table | New | build-own: card prompts, status, hand text and log composed over existing kit screens |

| Game sheet | Answer | Kit part or game ownership |
| --- | --- | --- |
| Who the player controls | One human seat against an automa | `game-store`, `automa` |
| What can run out | Life and the shared deck | `engine-core`, `card-zones` |
| Clocks and tracks | A bounded round count and turn phases | `turn-flow` |
| The phase list | Optional draw, one main card, end strike | `turn-flow`, `card-language` |
| Where the opposition comes from | A public-view automa priority table | `automa`, `opponent` |
| Dice | Not in this game | No dice |
| Positions | Not in this game | No board |
| Numbers several cards change | Life and the temporary owned hit boost | `engine-core` |
| Costs and payment | One card moves from hand to discard or play | `card-zones` |
| May an effect be offered | Current legal card options and optional draw/heal | `prompt-host`, `card-language` |
| Lasting effects and status | Rally ends at the acting turn boundary | `engine-core` |
| Triggers and windows | Ward replaces damage and Mend follows actual damage | `card-language`, `engine-core` |
| Cards as data | Validated single hits and the three fixed rich shapes | `content-pack`, `card-language` |
| Hidden information | Deck and the opposing hand | `card-zones`, `sim-pool` |
| Objectives and scoring | Survive or have more life after the round limit | build-own synthetic terminal policy |
| Set-up picks | Fixed human/automa seats, supported difficulty | `screens`, `game-store` |
| Between games | Not in this game | The broader reference campaign is not exposed by this composition |
| Loading the content | The configured pack is parsed and validated | `content-pack` |
| Attacks and damage | Explicit hit and end-strike occurrences | `engine-core`, `card-language` |
| Tokens and markers | Life and physical card locations | `engine-core`, `card-zones` |
| Levels and upgrades | Not in this game | No progression |
| Markets and rows | Not in this game | No market |

| What the game builds | Phrasings searched | Nearest kit part | Verdict | Register id/refusal |
| --- | --- | --- | --- | --- |
| Card configuration and synthetic rules | reference card composition; executable card assembly | `scaffold`, `card-language` | game code | Supported synthetic data and independent expectations compose the existing adapter; steward not asked |
| Game verbs | owned hit boost; optional damage heal | `card-language`, `engine-core` | game code | The canonical reference adapter owns these original rules and calls existing timing APIs; steward not asked |
| Screen: card table | card decision screen; card prompt host | `screens`, `prompt-host` | game code | The shared view arranges game-specific status and card text over existing screens; steward not asked |

## 9. Card-language test programme

The runnable entrypoint is runCardSuite, followed by runRuleAssertions and runClauseMutations, in tests/acceptance.ts. It is the declarative runtime alternative to cardCase; no direct cardCase call is claimed. Its legal-action refusal and not-fired cases supply the evidence expected by expectNotOffered and expectNotFired; those helper names do not stand in for an execution result. Interaction checks cover Rally followed by a strike, Ward followed by another damage occurrence, and accepted/declined Mend after damage.

| Family | Full resolve | Poor setup |
| --- | --- | --- |
| Single hit | Actual card handler and independent damage amount | Illegal card-outside-hand action; expectNotOffered contract through full-state refusal assertions |
| Rally | Owned boost, real follow-up, other-owner isolation and expiry | Card-outside-hand refusal; expectNotOffered contract through full-state refusal assertions |
| Ward | Actual play, replacement and physical discard once | Hand/discard/wrong-owner cases; expectNotFired contract through runtime and rule assertions |
| Mend | Offered yes heals exactly once, no heals zero | Hand/discard/wrong-owner and declined choices; expectNotFired contract through runtime and rule assertions |

The independent catalogue is cards/catalogue.json; cards-ar-map.md records the original ordering rule, and is this composition's ar-map.md. New supported hit records enter the same loader and family without a new handler or test-family list.

## 10. Modifier order

| Order | Rule | Kit function |
| --- | --- | --- |
| Add owned boost before damage, apply replacement, then offer damage triggers; expire at turn end | IR-01 in cards-ar-map.md | build-own Game verbs over existing timing and duration APIs |

## 11. Screen-text scan

cards:screen mounts actual routes and requires nonempty text; it rejects exposed rule IDs. theme-check requires declared font tokens. The native browser command additionally requires visible playable choices and a terminal game, with human and automated plays in the log. A disconnected button must fail the browser acceptance.

## 12. Definition of Done

Run plancheck, cards:check, cards:screen, cards:whole-game, theme-check and the declared check chain on the exact source. The expectNotOffered and expectNotFired contracts require real refusal evidence. Cheats and undeclared autoplay stay default-off. Independently review the supplied expectations and all semantic failure controls. Run test:bootstrap only as non-browser evidence; run test:acceptance with Chromium for a game slice, then acceptance:verify against the unchanged source and declared inputs. Missing, failed, stopped, truncated or stale checks do not become accepted games. Matching receipts do not prove rule quality or unbound environmental dependencies.

# Campaign continuation reference

Generate and execute a bounded four-card campaign variant that connects calendar choices, roster attendance, shared physical copies and retry snapshots to the real reference card engine.

## Rules for agents

**You must:**
1. Read the independently authored `template/docs/CAMPAIGN_RULES.md.tpl` before changing this fixture. The supported variant deals all four allocated copies into each active player's hand, uses an empty shared draw pile and ends after two rounds or an earlier actual terminal result. It does not change the canonical reference card rules.
2. Use `generate.mjs` from this checkout with a new directory and an existing temporary port registry entry for `campaign-compat`. It uses the exact local HEAD for the locked kit and this checkout's reference templates. Dependencies must already be installed; generation does not install or claim acceptance.
3. Execute `node tests/campaign-acceptance.ts` inside the generated consumer. The generated `tests/campaign.test.ts` also invokes this real command in its normal test lane. Preserve exit-code assertions and both configurations. The outer component test checks generation, two semantic source controls, generated types, scoped lint and the unchanged kit lock.
4. Keep the stock, required route choice and ready instructions ordered. Assign `startCalendarDay` only after all choices resolve; apply the whole roster batch and call `begin` before starting gameplay. Keep the previous save if any step refuses.
5. Map the active lead to human seat 0 and the other active player to automated seat 1. Exclude sitting-out, retired and free box cards from scenario content; preserve exactly eight distinct active instances across engine zones. Sitting-out cards remain reserved until a retirement releases them.
6. Use the declared first-legal public-view bot, preferring yes for optional choices. This variant does not claim parity with the canonical reference automa's priority table. A campaign opponent sees only its own view and the legal answer list supplied by `botOpponent`.
7. Bind archives to the variant and chosen configuration. Supply the save timestamp from the caller for an active scenario. Validate canonical arrival→crossing progress before serialization and restore: status, current step, completed-step prefix, resolutions, active attempt and ordered history must agree. Retried completed attempts remain in history while their step is absent from the current completed prefix. Validate the calendar schedule, cursor and ordered effects for all logs and retry snapshots. Restore their allocations against the selected box, check the active snapshot/setup match and replay the engine archive. Retry uses the scenario-start snapshot, including game-owned fields, and does not retain later scenario effects or process the day again.
8. Keep actual project records separate from this synthetic reference. A passing command proves the declared bounded continuation, not arbitrary campaign generation, hosted verification, production adoption or development savings.

## Use it in 10 lines

```js
import { generateCampaign } from './generate.mjs';

// The temporary registry already contains campaign-compat, allocated by the port helper.
const made = generateCampaign({ dir: 'tmp/campaign', ports: 'tmp/ports.json' });
console.log(made.ref);
// From tmp/campaign: node tests/campaign-acceptance.ts
```

The adapter exposes `newContinuation`, `editContinuationRoster`, `continueCampaign`, `finishScenario`, `retryContinuation`, `serializeContinuation` and `restoreContinuation`. `continueCampaign` returns a required choice without changing the save, or a real game store plus explicit processed/noop calendar status. A scenario must reach an actual terminal result before `finishScenario` advances it. `serializeContinuation(config, campaign, session?, savedAt?)` stores an idle campaign alone or its matching active scenario; `savedAt` is required with a session. Restoration validates current and retry-snapshot allocations, preserves the journal and game-owned `betweenSessions` field, and rejects a different variant/configuration or mismatched live setup.

The maintained acceptance runs arrival to terminal in both configurations, changes attendance, checks retained sitting-out copies, refuses a one-sided exchange, applies the Ward/Mend batch swap, resolves the calendar choice with retirement and a released-card upgrade, then plays crossing through a human action and automated response. It saves/restores the pending continuation and live scenario, completes crossing and retries it. Independent expected hands, live starting life, remaining box counts, calendar order and snapshot fields catch consumer failures. In separate generated source controls, dropping the live life bonus or bypassing roster edits makes the same command exit 1. The canonical reference reducers and locked kit remain unchanged.

`node tests/campaign-progress.ts` is the focused archive regression, also invoked by the generated test lane and the outer generator test. It round-trips new, active, pending, completed and retried campaigns in both configurations, including repeated completed attempts at both stages. Corrupt completed prefixes, resolutions, status, active steps/seeds, detours and missing/reordered history must fail before an archive is emitted or a restored session is returned. Completion after a legitimate crossing retry still ends the campaign; retained retry history never restarts arrival.

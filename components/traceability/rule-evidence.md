# Executable rule evidence

The [token game arbiter suite](examples/arbiter.ts) uses the real engine to check that an affordable purchase debits two tokens and an unaffordable purchase is refused. The repository tests run this exact module directly and through the release gate.

Copy `trace.config.example.json` and set the discovery options for your build plan. For the token game, put `PAY-01` in the rules section and start with these settings.

```json
{
  "plan": "BUILD_PLAN.md",
  "ruleSection": 3,
  "families": ["PAY"],
  "executableRuleIds": ["PAY-01"],
  "executableSuite": "kit/traceability/examples/arbiter.ts"
}
```

Add a test title citing `PAY-01` and satisfy the existing citation settings, then run `node kit/traceability/check-traceability.ts --strict --release` from the game root. The configured module exports `{ adapter, cases, rules? }` as its default. `rules` classifies discovered IDs and can require a refusal control. By default each due rule needs passing action evidence.

Maintain `executableRuleIds` independently of discovery and include recognized deferred IDs. The gate compares this optional exact inventory with the plan before deferrals, so a partial match fails too. Zero recognized rules fails when the suite is configured. Set `allowEmptyExecutableReason` to a nonblank reason only for an intentionally empty inventory. Configured deferrals can leave zero due rules, and the gate reports both counts. Use nonblank values in `deferredPrefixes`. The separate pending-file release check still applies.

The adapter's `setup(fixture, seed)` builds a fresh engine state per case. `act(state, action)` returns `{ accepted, state, events }`. Catch only the engine's illegal-action rejection. Let unexpected errors fail the case. `observe(state)` returns JSON containing relevant rule state, including the action queue, pending prompt and RNG when verifying rejection. A refusal that changes observed state or emits events fails even if its field assertion passes.

Each case names its rule IDs and maps them to executed checks. Use `{ rule: 'PAY-01', kind: 'action', step: 0, assertion: 0 }` for the first assertion on the first action. Use `{ rule: 'SET-01', kind: 'setup', assertion: 0 }` for a setup-only rule. If a rule requires both acceptance and refusal evidence, declare `{ id: 'PAY-01', kind: 'action', requireRefusal: true }`. Each required rule without passing evidence fails the release gate. Use `assertRuleCoverage(runRuleAssertions(adapter, requiredRules, cases))` for the direct API.

The arbiter owns the rule inventory, case inputs, expected outcomes and evidence bindings. Review those against the rule text. The runner verifies execution and outcomes against those bindings.

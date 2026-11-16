# Pattern: card-language validator, registry, text generator, dry run

No component: every interpreter is welded to its game's state, zones and phases (SELECTION.md, "Cards"). Build the grammar's shape, not a shared interpreter.

## Example (read, never edit)
- jarl `pateta51-ops/rise-of-a-jarl-fan-prototype` @ `6f006a2` (C:\projects\rise-of-a-jarl-fan-prototype):
  - `src/engine/effects/ops.ts`: registry + validator.
  - `src/engine/effects/describe.ts`: text generator.
  - `scripts/describe-check.ts`, `tests/scripts/describe-check.test.ts`: the gate.
  - `src/content/schema/conformance.test.ts`: schema equals types.
- ebr `earthborne-rangers-fan-prototype` @ `33b5abd3`: `src/engine/dryRun.ts` (would this do anything now).
- Custom-step escape hatch registries: stcc `9fc59643`, rome `1d0fd2e`, warps `2af6937` (`customs.ts`).

## Shape
1. **Ops are data.** A card's encoding is a non-empty list of `{ op: "<kind>", ...fields }` objects. A discriminated union in the engine types; a zod schema in the content layer mirrors it.
2. **One registry row per op kind** (`OPS`): `readBy` (the rules module that reads it, through one query module) and `fields: Record<name, (v) => string | null>` (null = valid, else what the field must be). Adding an op = a row, a union member, a read in a rules module. The engine never branches on a card id or name.
3. **Validator** `validateOp(op): string[]`: unknown kind (`Object.hasOwn`), missing field, extra field, ill-typed field, and "no describe function". `validateEffect`: an empty list is an error. Small field checkers: `posInt`, `int`, `oneOf(set)`, `listOf(set)`.
4. **Text generator** `DESCRIBE: { [kind]: (op) => string }`, typed so a missing kind fails to compile. One sentence per op, `[TOKEN]` for icons, a serial-comma helper `list(items, "and"|"or")`, a rule-id comment above each entry. `describeEffect` joins the sentences in encoding order. `tokensOf(text)` pulls the `[A-Z_0-9]` tokens.
5. **Describe gate** (`npm run describe:check`, exit 0/1): per card, validate; then the generated text must equal the printed text word for word; token differences are reported both ways to show where. Never show generated text to the player where printed text exists; the proof sheet shows both side by side.
6. **Conformance test**: one valid example per op (`satisfies { [K in Op["op"]]: ... }`), the kinds list equals the examples, invalid ones are refused, the committed pack parses, a fresh build equals the committed files (stale check).
7. **Handlers**: the engine calls a handler table passed in (jarl runner: LIFO task stack, runaway guard of 50,000 tasks). A `custom` op names a registered handler; the loader checks every `custom` id exists.

## Dry run (ebr, optional)
Clone the state, run the steps, fork once per enabled option at each prompt, breadth first, at most 32 branches and 2,000 tasks each, drop the events; "yes" if any branch marks the frame `did`. `whole` mode counts a branch only when every step was performed (a cost paid in full). The caps are part of behaviour: keep them fixed. Alternatives: stcc `Eval.dryRun` flag (no cloning), unst static `canResolve`.

## Pitfalls
- Keep the engine free of content imports: the validator mirrors the schema by hand and a content check runs both.
- Coverage of the printed texts decides whether the language is enough: write the inventory (card, op list) before the interpreter.
- A choice is not an effect (ebr fix): prompts are asked by the runner, not simulated as ops.

## Mechanic-family manifests (middle-earth-player, MIT; `src/rules/interpret/family-manifest.ts`, excerpt not verified)
- Group ops by mechanic family (draw, damage, tokens, movement...). Each family has one manifest: `vocabulary` (the verbs it owns), `runner` (verb to function), `records` (the card records that use them). A verb belongs to exactly one family.
- Test in the game: for every family, every declared verb has a runner, every runner is a declared verb, and no verb is declared by two families. Add a family = one manifest file plus its runners; the interpreter never lists verbs itself.
- Same idea as the `OPS` registry above, split per family so a family can be read, tested and removed alone. The test is a few lines over the manifests; write it in the game, not in the kit.

## Results cached by immutable state
- When the engine never mutates a state object (a new object per step), a `WeakMap<State, Result>` caches a pure derived value (constant records, legal actions, a table view) with no invalidation: a changed state is a new key, and the entry goes with the state.
- Only for pure functions of that state; a key that is cloned or mutated in place makes it wrong. Measure first (`perf`); add it where a profile shows the same state read many times per step.

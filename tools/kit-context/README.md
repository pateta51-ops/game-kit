# kit-context

Produce a bounded machine-readable context packet for a public component export, from the actual declarations, README agent rules and tests.

## Rules for agents

**What it does:** Lets an agent resolve a named API from the checkout's installed TypeScript compiler rather than reading a whole component README or source tree into model context.

**You must:**
1. Use `kit.mjs search` to choose the component first. Run this tool from a game-kit checkout with its dependencies installed.
2. Select the public entrypoint explicitly if it is not `index.ts` (for example `--entry browser.ts`). A symbol must be exported by that entrypoint.
3. Check `status`. For an `incomplete` packet, follow every path in `requiredReads` or request a larger budget. Follow re-exports from the entrypoint if a contract is unavailable within the component.
4. Read the complete component Rules for agents before modifying or using it. A `complete` packet contains that section and the requested local contracts. Read repository policy and game-specific rules separately. Treat test excerpts as usage examples. They do not establish that a test passed.
5. To inspect the version vendored into a game, pass `--root <game>/kit`; do not use newer checkout APIs to implement against an older locked game.
6. The tool reads the requested component, does not edit files and does not execute tests or game rules.

## Use it

```sh
node tools/kit-context/context.mjs engine-core preview --entry kernel.ts --max-chars 10000
node tools/kit-context/context.mjs dice-odds chance
```

The compact JSON contains component dependencies, type contracts with file and line references, the Rules for agents section, and optional test excerpts and export listings. A named-symbol query requests that symbol's contracts. A whole-component query requests the contracts of every export from the chosen entrypoint. `omitted` counts items dropped to fit the budget. `requiredReads` gives paths relative to the component for essential material the packet could not supply. Those paths point to the README for rules and to the public entrypoint for API declarations. Missing essential content produces `status: "incomplete"` even if optional excerpts fit.

The `--max-chars` limit applies to the serialized JSON string, excluding the trailing newline. It accepts 500–100000 characters and defaults to 6000. The tool does not measure tokens. CLI exit 0 means complete, exit 2 means an incomplete JSON packet was printed, and exit 1 means the request or inputs were invalid or unreadable.

When updating an existing caller, check `status` before using the packet and handle exit 2 as a request to read the listed paths. `omitted` alone does not tell you whether essential material is available.

The manifest, README, entrypoint and test excerpts are confined to canonical paths in the component. The compiler can resolve local re-exports and use its installed TypeScript standard library declarations. It does not inspect dependent package or sibling component source. If a local contract is unavailable or TypeScript can only infer `any` for the export itself, follow its declaration and dependencies manually. The command runs from the kit checkout and can inspect a locked copy through `--root`. Shipping the command itself inside the locked copy remains a separate deliverable.

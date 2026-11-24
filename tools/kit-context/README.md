# kit-context

Produce a bounded machine-readable context packet for a public component export, from the actual declarations, README agent rules and tests.

## Rules for agents

**What it does:** Lets an agent resolve a named API from the checkout's installed TypeScript compiler rather than reading a whole component README or source tree into model context.

**You must:**
1. Use `kit.mjs search` to choose the component first. Run this tool from a game-kit checkout with its dependencies installed.
2. Select the public entrypoint explicitly if it is not `index.ts` (for example `--entry browser.ts`). A symbol must be exported by that entrypoint.
3. Read the matching declaration, rules and test excerpts; an omitted count above zero means context was dropped for the character budget. A test excerpt is evidence of usage, not proof of a complete test.
4. Read the complete Rules for agents section before modifying or using a component. This command only retrieves matching lines for a symbol query and is not a substitute for repository policy or game-specific rules.
5. To inspect the version vendored into a game, pass `--root <game>/kit`; do not use newer checkout APIs to implement against an older locked game.
6. The tool reads the requested component, does not edit files and does not execute tests or game rules.

## Use it

```sh
node tools/kit-context/context.mjs engine-core preview --entry kernel.ts --max-chars 6000
node tools/kit-context/context.mjs card-language --max-chars 4000
```

Output is compact JSON with component dependencies, exported names (whole-component mode), type contracts with file/line references, matching rule lines, test excerpts and an omitted count. The serialized packet is bounded by `--max-chars` (500–100000, default 6000); the trailing CLI newline is not counted. It is not a token count. The TypeScript checker resolves re-exports; declarations outside the requested component are not included. Unknown symbols and invalid paths exit 1. CLI integration into the vendored kit and the plan-row registration are follow-up tasks.

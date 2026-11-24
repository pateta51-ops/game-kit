# kit-context

Produce a bounded machine-readable context packet for a public component export, including its supporting types and usage constraints.

## Rules for agents

**What it does:** Collects the declarations and usage instructions for a public API using the checkout's TypeScript compiler.

**You must:**
1. Use `kit.mjs search` to choose the component first. Run this tool from a game-kit checkout with its dependencies installed.
2. Select the public entrypoint explicitly if it is not `index.ts` (for example `--entry browser.ts`). A symbol must be exported by that entrypoint.
3. Check `status`. For an `incomplete` packet, follow every path in `requiredReads` or request a larger budget. Follow imports and re-exports from source paths and linked usage guides from the README. Read dependencies in the corresponding locked version.
4. Read the complete component rules and usage instructions before using its API. A `complete` packet includes `rules`, `usage` and the requested local contracts. Read repository policy and game-specific rules separately. Test excerpts illustrate usage.
5. To inspect the version vendored into a game, pass `--root <game>/kit`; do not use newer checkout APIs to implement against an older locked game.
6. The tool reads the requested component, does not edit files and does not execute tests or game rules.

## Use it

```sh
node tools/kit-context/context.mjs engine-core preview --entry kernel.ts --max-chars 10000
node tools/kit-context/context.mjs dice-odds chance
```

Use `entry` and `symbol` to import the requested API. Each `contracts` row gives a declaration or alias binding, grouped by its source `file` and anchored to the original declaration where available. Supporting declarations may be private to that file, so import only exports from the public entry. The declaration graph includes local aliases, overloads, generic constraints, class members, and recursive types. Querying without a symbol requests all exports of the specified entrypoint.

`rules` contains the README's Rules for agents. `usage` contains other README sections and local Markdown guides linked from those rules or from a matching usage section. Local guide links are followed transitively from each guide's canonical location. The packet treats these sections and the requested declarations as essential. Test excerpts and export listings are optional. `omitted` counts items dropped for the budget. `requiredReads` names the local source files or guides needed for a continuation. At very tight budgets, the public entrypoint and README give the starting paths for longer continuations.

The `--max-chars` limit applies to the serialized JSON string, excluding the trailing newline. It accepts 500–100000 characters and defaults to 6000. The tool does not measure tokens. CLI exit 0 means complete, exit 2 means an incomplete JSON packet was printed, and exit 1 means the request or inputs were invalid or unreadable.

When updating an existing caller, check `status` before using the packet and handle exit 2 as a request to read the listed paths. `omitted` alone does not tell you whether essential material is available.

The manifest, README, linked guides, source, and test excerpts are confined to canonical paths in the component. Type checking also uses the installed TypeScript standard library. Unresolved declarations and potentially error-derived inferred `any` return `incomplete` with the source path. Explicit `any` is preserved in valid contracts. A component that relies on a package or sibling type may therefore require a manual read. The checkout command can inspect a locked component through `--root`.

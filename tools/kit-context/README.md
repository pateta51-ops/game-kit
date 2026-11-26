# kit-context

Produce a bounded machine-readable context packet for a public component export, including its supporting types and usage constraints.

## Rules for agents

**What it does:** Collects the declarations and usage instructions for a public API using the checkout's TypeScript compiler.

**You must:**
1. Use `kit.mjs search` to choose the component first. Run this tool from a game-kit checkout with its dependencies installed.
2. Select the public entrypoint explicitly if it is not `index.ts` (for example `--entry browser.ts`). A symbol must be exported by that entrypoint.
3. Check `status`. For an `incomplete` packet, follow every path in `requiredReads` or request a larger budget. Follow imports and re-exports from source paths and guide links from every README section. Read dependencies in the corresponding locked version.
4. Read the complete component rules and usage instructions before using its API. A `complete` packet includes `rules`, `usage` and the requested local contracts. Visible rules after leading HTML comments retain their README line references and their guide requirements. Guide discovery parses that visible text separately from adjacent Markdown blocks and uses the README's reference definitions. Read repository policy and game-specific rules separately. Test excerpts illustrate usage.
5. To inspect the version vendored into a game, pass `--root <game>/kit`; do not use newer checkout APIs to implement against an older locked game.
6. The tool reads the requested component, does not edit files and does not execute tests or game rules.
7. For source provenance, pass `--root <game>/kit --source <trusted game-kit checkout>`. This invokes the tool checkout's `kit.mjs check --source` from the requesting game. The installed `kit` directory cannot be a symbolic link or junction. A supplied source path is not an authenticity guarantee: choose a checkout you trust and make the pinned Git objects available beforehand. Verification failure stops the request; there is no fallback to a newer pin or an installed verifier.
8. `status: complete` covers the requested API contract only. Provenance does not establish whole-task readiness, purity, maturity, adoption, or successful game validation. Follow `requiredReads` even when the installed kit's provenance is verified.
9. For a worker brief, supply the decisions in the existing [briefing checklist](../../docs/recipes/agent-workflow.md#brief-a-worker) as the explicit task JSON below. Use a reserved task id and an authorized scope. The generator checks references and the kit pin; it does not reserve ids, authorize work, answer rules/look questions, or run acceptance scripts. Read the named policies, recipe and line ranges before starting.

## Use it

```sh
node tools/kit-context/context.mjs engine-core preview --entry kernel.ts --max-chars 10000
node tools/kit-context/context.mjs dice-odds chance
node tools/kit-context/context.mjs dice-odds chance --root ../my-game/kit --source .
```

Use `entry` and `symbol` to import the requested API. Each `contracts` row gives a declaration or alias binding, grouped by its source `file` and anchored to the original declaration where available. Supporting declarations may be private to that file, so import only exports from the public entry. The declaration graph includes local aliases, overloads, generic constraints, class members, and recursive types. Querying without a symbol requests all exports of the specified entrypoint.

`rules` contains the README's Rules for agents with original line references. Visible rules on the closing line of a leading HTML comment keep their text, and literal comment markers in code examples retain their Markdown syntax. `usage` contains the other README sections and their component-local Markdown guides. CommonMark inline and reference links in any section count, including links after leading comments in Rules and reference definitions elsewhere in the same document. Stand-alone definitions at the end of a top-level prose paragraph also count. Relative links in a guide are followed from its canonical location, and each guide is included once. Code, comments, image sources, raw HTML, and destinations outside the component are outside this traversal. Missing, unreadable, non-UTF-8, or escaping guide files fail with a diagnostic.

The packet treats these sections, local guides, and the requested declarations as essential. Test excerpts and export listings are optional. `omitted` counts items dropped for the budget. `requiredReads` names the local source files or guides needed for a continuation. At very tight budgets, the public entrypoint and README give the starting paths for longer continuations.

The `--max-chars` limit applies to the serialized JSON string, excluding the trailing newline. It accepts 500–100000 characters and defaults to 6000. The tool does not measure tokens. CLI exit 0 means complete, exit 2 means an incomplete JSON packet was printed, and exit 1 means the request or inputs were invalid or unreadable.

When updating an existing caller, check `status` before using the packet and handle exit 2 as a request to read the listed paths. `omitted` alone does not tell you whether essential material is available.

The manifest, README, linked guides, source, and test excerpts are confined to canonical paths in the component. Type checking also uses the installed TypeScript standard library. Unresolved declarations and potentially error-derived inferred `any` return `incomplete` with the source path. Explicit `any` is preserved in valid contracts. A component that relies on a package or sibling type may therefore require a manual read. The checkout command can inspect a locked component through `--root`.

## Source provenance

`--source <checkout>` opts into schema version 1 metadata and requires the usual `<game>/kit` installation layout. The packet names the producing tool checkout's commit, whether its tool or verifier files are modified, and the TypeScript version. A copied tool without Git metadata reports a null commit and modification state. `scope: api-contract` and `taskReadiness: not-assessed` distinguish API completeness from the information needed to finish a game task.

The provenance method is `kit.mjs check --source`. For a versioned support manifest its scope is `installed-kit-against-source`; a legacy lock instead reports `status: partial` and `scope: recorded-files-against-source`. It reuses that command's lock, ref/commit, source-content and installed-document checks, including its normal game-side bypass checks, and preserves its warnings. A legacy check can succeed while installed CLI/catalog changes remain outside its coverage; it does not verify all support files or managed worker rules. API completeness remains separate from that coverage. The source checkout's working tree does not supply the contracts or guides: the requested installed component does. The result records the target ref and commit, a SHA-256 fingerprint of the checked lock bytes, the component's Git tree identity, and the JSON pointer to its existing file-hash map in that lock. The lock fingerprint labels the checked snapshot; it is not a second verification mechanism. No source repository is fetched, no installed CLI is executed, and no game validation suite runs.

Use `--provenance` without `--source` to include the same scope and tool metadata with `provenance.status: unverified`. A lock declaration alone never yields `verified`. Calls without either flag retain their earlier packet format and budget behavior and have no source-verification claim. Provenance metadata counts toward `--max-chars`; a budget too small for metadata and continuation paths is an input error. A verified but incomplete packet still exits 2 and requires every listed continuation. Outputs describe the observed snapshot; regenerate after a pull, source edit, or lock change.

## Bounded worker brief

```sh
node tools/kit-context/brief.mjs task.json --game ../my-game --source . --max-chars 24000
```

The version 1 input names one task, one game pin, and one to four public APIs. For example, after replacing the commit, file ranges, recipe, API and acceptance script with the game's actual decisions:

```json
{
  "version": 1,
  "id": "B1",
  "repo": "my-game",
  "branch": "b1-wire-api",
  "kitCommit": "<exact commit from the game lock>",
  "goal": "Wire the selected public API.",
  "reads": [{"file": "docs/PLAN.md", "from": 10, "to": 20}],
  "recipe": "kit/recipes/game-systems.md",
  "files": [{"file": "src/engine/adapter.ts", "action": "create"}],
  "apis": [{"component": "dice-odds", "symbol": "chance", "mustUse": true}],
  "acceptance": [{"script": "test:slice", "proves": "The adapter handles the selected game case."}],
  "outOfScope": ["Art decisions"],
  "escalation": {"owner": "architect", "stop": "Stop before changing the public contract."},
  "questions": [],
  "completion": "Run the game finish workflow and report its PR-head evidence."
}
```

All shown fields are required. A question is `{ "question": "the unresolved decision", "owner": "arbiter or director" }`; nonempty questions keep the brief incomplete. API `entry` and `maxChars` use the context command's defaults and bounds; `mustUse` is optional and defaults to false. Set it only for the value exports the task requires: the output lists the qualified `component:export` obligations, while the existing game finish gate remains responsible for proving actual use. The tool does not infer purity from filenames or imports.

The JSON brief preserves task decisions, includes the selected API packets, and lists the required game policy (`AGENTS.md`), supplied reads and recipe. Reads carry whole-file SHA-256 fingerprints to identify the observed bytes; they are instructions to read, not claims that those instructions have been followed. Plan, catalog and selection references require explicit `from`/`to` line ranges. The same applies when the file has multiple hardlinks. Read paths and owned files must stay inside the game even through symlinks. Owned files use `create` or `edit`, must match their current existence, and cannot target the installed kit. Edit ownership requires a single hardlink to prevent writes through another name. Acceptance currently supports registered npm scripts only: the brief prints `npm run <script>` and the caller's intended proof, with `executed: false` and no validation evidence. Repository labels, branch names, task reservations and the sufficiency of the supplied scope remain the caller's decisions.

`inputs` identifies the task definition (SHA-256 of `JSON.stringify(task)`), the complete `package.json` bytes including script definitions, and every owned file. Existing edit files have content fingerprints; create files explicitly have `status: missing` and a null fingerprint. `inputFingerprint` combines those identities with the read references/fingerprints and kit-lock fingerprint. To check a saved brief, regenerate it with the same task and flags and compare `inputFingerprint`; any difference, failed regeneration, or newly incomplete result invalidates reuse of the old inputs. Creating a planned new file requires updating its task action before regeneration. JSON key-order changes may also change the task fingerprint. These fields identify local inputs, not authenticate them or certify command execution. They do not cover undeclared files, environment or installed dependencies. After changing the generator, compare the new complete brief and its tool/schema metadata as well; an input fingerprint alone does not identify modified tool code.

Brief metadata, supplied decisions and continuation references are never silently cut. API packets that do not fit are replaced with required continuation paths relative to `kit/<component>/`; follow the public entrypoint, README and their dependencies/guides, or request that API directly with a larger context budget. `--max-chars` bounds the entire serialized JSON string, excluding its newline (2000–100000; default 24000). If the fixed decisions/references cannot fit, the request fails rather than dropping them. Exit 0 means the supplied brief has verified provenance, no omitted/incomplete API packets and no unresolved questions; exit 2 prints an incomplete brief, including partial legacy provenance; exit 1 means invalid inputs or failed source verification. `taskReadiness: not-assessed` always applies: a complete brief does not prove a complete game slice. Regenerate after changing the task, game reads, source, or lock. The requested `kitCommit` must match the checked installed pin.

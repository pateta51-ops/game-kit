# Plan a pinned game's npm declarations

Compare one consumer's declared package ranges with the requirements of its locked components.

## Rules for agents

1. Run `node tools/package-plan/plan.mjs <game-dir>` from a trusted game-kit checkout with its dependencies installed. The checkout needs the commit and its package metadata objects from the game's `kit/kit.lock.json`. In a partial clone, fetch missing metadata separately. Check lock integrity separately with `kit.mjs check --source`.
2. Read the package's originating components, their READMEs and the pinned declaration role before planning a change. A kit dependency can support an optional feature such as paid playtesting. The plan lists all declared packages of the locked components.
3. Treat `compatible` as a declaration comparison. Verify the installed modules and the enabled feature with the game's package manager and targeted checks.
4. Leave changes to manifests and lockfiles to the game. Review unresolved declarations and retain `kit.old` when recovering from an interrupted pull.
5. Before a planned upgrade, obtain the expected release commit independently and run the upgrade preview from a trusted checkout. Read the reported migration notes and run relevant game checks after the pull. Keep private game output local.

## Use it

```sh
node tools/package-plan/plan.mjs ../my-game
```

The JSON result includes the lock's label and exact commit, package-manager and lockfile evidence from the consumer, possible workspace or override indicators, the recovery-backup flag, and packages sorted by name. Each package lists its requesting components, pinned declarations (`expected`) and game declarations (`declared`). Both declaration fields are arrays, including when a declaration is absent.

| Status | Meaning |
|---|---|
| `missing` | The game's manifest has no declaration in a dependency section. |
| `conflict` | The two ranges admit no common stable version. |
| `wrong-role` | The game declares a kit runtime package only in devDependencies and the ranges have a common version. A runtime declaration can also satisfy a kit dev requirement. |
| `compatible` | The declared range is contained within the kit range, with a suitable package role. |
| `overlap` | The two ranges share versions and the comparison did not establish containment. Review the range before resolving packages. |
| `unresolved` | Review the indicated role, range, workspace or override. Includes peer and optional declarations, multiply declared packages, aliases, prerelease ranges and other non-comparable constraints. |

The comparison handles stable semver declarations for one ordinary manifest. A parent manifest or lockfile inside the inspected Git boundary can signal a workspace. The tool records that ambiguity without resolving workspace inheritance. It reports package-manager declarations and recognized lockfile names as evidence. Exit 0 means a plan was printed, including when it contains conflicts or unresolved packages. Invalid inputs or an unavailable pin exit 1. Invalid argument count exits 2. The CLI reads only and performs no fetch or package installation.

## Preview a specific upgrade

```sh
node tools/package-plan/upgrade.mjs <game-dir> <release-tag> <full-release-commit>
```

The preview verifies the base lock with the trusted source checker, checks the exact target tag and ancestry, and reports both Git trees. Component entries cover changed source trees and newly required dependencies. A pull keeps already installed components, even when the target no longer requires them. Package changes compare declaration plans before and after closure over the target dependencies. Existing package warnings may remain after the upgrade.

Review the breaking commit subjects for the exact range, added breaking lines, and added or revised sections with migration or breaking headings in affected READMEs. Subjects can describe uninstalled components. Source-tree changes can include tests or documentation. Application and test references cover literal relative imports and re-exports found by the reuse-metrics scanner. Missing or ambiguous references remain unknown. The preview reports execution as unknown and lists recognized check scripts that exist in the game. Choose the scenario, simulation, browser and other checks that exercise the affected behavior. Exit 0 means the preview was generated.

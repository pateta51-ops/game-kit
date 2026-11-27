# Upgrade a game's kit

1. `node kit/kit.mjs outdated [../game-kit]`: your tag, the latest, the PLAN rows between, and any marked `breaking`.
2. Upgrade only if a row you need is there. Read each README note marked breaking.
   For a specific release, use the [upgrade preview](../../tools/package-plan/README.md#preview-a-specific-upgrade) before pulling. Inspect changed component trees, package declarations and available checks against the independently verified release commit.
3. `node ../game-kit/kit.mjs pull ../game-kit <tag>`: one tag per game; this moves the whole kit, not one component.
4. If the selected components change npm requirements, run `node ../game-kit/tools/package-plan/plan.mjs .` to compare the pinned package declarations with the game's manifest. Review each conflict or unresolved item before changing a package. See the [package plan](../../tools/package-plan/README.md).
5. `node kit/kit.mjs check`, then the game's `npm run check`; fix what a breaking row lists.
   From the game root, use `node ../game-kit/kit.mjs check --source ../game-kit` with a trusted checkout. It checks the locked commit, verifies the tracked source, and reconstructs the installed Markdown. It can detect missing or changed `kit/kit.mjs`. The installed CLI can run the same check when you trust it. Tag releases with annotated tags.
6. Commit `kit/` and any updated kit-managed block in `AGENTS.md` together, with the tag in the message. Never edit `kit/` by hand.

If an interrupted upgrade leaves `kit.old/`, keep it as the recovery copy and inspect the pull error before retrying. Pull refuses to overwrite that backup.

## Support files and legacy locks

New locks cover the CLI, worker script, catalog, recipes, component files, and the managed worker-rules block in `AGENTS.md` when the pin provides one. Game instructions outside that block are editable. The support manifest records source paths, source and installed SHA-256 digests, and the renderer version. Installed text hashes tolerate CRLF checkouts. Links to installed files use their game paths, and links to available components and checkout-only docs use the pinned source commit. The renderer handles simple relative Markdown link destinations and reference definitions. The checkout files keep their original links.

A lock catches accidental edits. Trusted source checking also rejects an edit paired with a recomputed local hash. For integrity against a malicious change to both the files and the selected pin, obtain the expected pin independently and verify it with a trusted checkout and checker.

Older pins keep their files and legacy locks. The current checker reports that their coverage is limited to the recorded files, and `--source` checks those recorded files against the pin. Very old per-component locks support the ordinary check and need an explicit pull to select a single pin before source checking. An old installer may copy a new pin's CLI and produce an incomplete lock. Re-pull that same ref using the checkout CLI from the new pin or later, for example `node ../game-kit/kit.mjs pull ../game-kit <same-ref>`. Games remaining on older pins can retain their legacy lock and apply a new pin when they need it.

[Earlier breaking migrations](../upgrade-history.md) covers the Node and effect-module transitions.

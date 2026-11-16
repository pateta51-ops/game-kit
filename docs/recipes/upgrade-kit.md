# Upgrade a game's kit

1. `node kit/kit.mjs outdated [../game-kit]`: your tag, the latest, the PLAN rows between, and any marked `breaking`.
2. Upgrade only if a row you need is there. Read each README note marked breaking.
3. `node kit/kit.mjs pull ../game-kit <tag>`: one tag per game; this moves the whole kit, not one component.
4. `node kit/kit.mjs check`, then the game's `npm run check`; fix what a breaking row lists.
5. Commit `kit/` alone, with the tag in the message. Never edit `kit/` by hand.

## Upgrading past K229 (breaking: the kit runs on plain node)

After the pull, a game must:
1. Use Node 22.18+ (`engines.node`).
2. Set `allowImportingTsExtensions` (with `noEmit`) and `erasableSyntaxOnly` in its tsconfig: the `kit/` copy now imports `.ts`/`.tsx` files by name.
3. Name `.ts`/`.tsx` in its own relative imports of every module a kit CLI or sim worker loads (`--game`, `--engine`, `--module`, `simGame`). No kit codemod exists; a one-off script that appends the resolved extension to each relative `from '...'` / `import('...')` does it.
4. Keep those files free of enums, namespaces and parameter properties.
5. Run kit CLIs as `node kit/<component>/<script>.ts` and drop `tsx` from `package.json` and CI.

## Upgrading past K235 (breaking: effect code split from the 1.0 path)

- `placements`, `movements` and their option types: were `../kit/board-registry/index`, now `../kit/effect-library/index` (file `movement.ts`). board-registry no longer needs effect-library.
- `registerPieceVerbs`, `copyPieces`, `dice3d`, `PieceVerbOptions`: were `../kit/pieces-3d/index`, now `../kit/pieces-3d-verbs/index`. pieces-3d no longer needs effect-library or motion-frame.
- Add `pieces-3d-verbs` to the pull list if the game animates dice or balls (release 1.1+): `node kit/kit.mjs pull ../game-kit <tag> pieces-3d-verbs`. A 1.0 game adds nothing.

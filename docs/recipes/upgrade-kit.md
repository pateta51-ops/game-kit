# Upgrade a game's kit

1. `node kit/kit.mjs outdated [../game-kit]`: your tag, the latest, the PLAN rows between, and any marked `breaking`.
2. Upgrade only if a row you need is there. Read each README note marked breaking.
3. `node kit/kit.mjs pull ../game-kit <tag>`: one tag per game; this moves the whole kit, not one component.
4. `node kit/kit.mjs check`, then the game's `npm run check`; fix what a breaking row lists.
5. Commit `kit/` alone, with the tag in the message. Never edit `kit/` by hand.

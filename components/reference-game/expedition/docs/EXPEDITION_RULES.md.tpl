# Expedition — original bounded tactical reference

## Reviewed rules

You control one explorer on a straight route. Initially only the approach and one guard's space are revealed. Choose one legal action at a time; each accepted action costs exactly one point. An invalid action consumes nothing and preserves the authoritative state.

1. Move to an adjacent revealed space for one point. You cannot enter the living guard's space. There is no diagonal, multi-space or zero-cost movement.
2. Attack the living guard only from an adjacent space, for one point. Deal attack power minus the guard's fixed armor; configurations with no possible damage are unsupported. Health stops at zero. Defeat removes the guard once. This example has no prevention, reactions, retaliation or other enemies.
3. Once the guard is defeated, stand at the current frontier and spend one point to explore. Reveal the top physical tile from the order shuffled during setup. A passage adds one space; a gallery adds two. Join the first new space to the chosen frontier, link new spaces in order, close that marker, and open one new marker at the far end unless the tile deck is now empty. Coordinates increase eastward by one, with stable `cN` space IDs and reciprocal adjacency. An invalid placement preserves the board, tile deck, frontier, points and RNG.
4. The far endpoint of the final tile is the exit. Entering it wins, including on your last point. Otherwise reaching zero points loses. The exit cannot be known before the final tile is explored.
5. The public view contains the revealed board, explorer, guard, prompt, revealed tiles and remaining tile count. It excludes the hidden tile order and RNG. The deterministic public-view pilot chooses an attack, then an available exploration, then the eastmost legal move. It is a pilot for the solo explorer, not an automated opponent.

## Two configurations, one integration

| Configuration | Guard space | Health | Attack power | Armor | Physical tiles | Points | Independent expected route |
| --- | --- | ---: | ---: | ---: | --- | ---: | --- |
| Short passage | c1 | 3 | 3 | 1 | passage-a (1 space), gallery-a (2) | 8 | First hit leaves 1 health; two hits defeat; exit c4; 8 accepted actions |
| Long gallery | c2 | 4 | 5 | 2 | gallery-b (2), gallery-c (2), passage-b (1) | 12 | First hit leaves 1 health; two hits defeat; exit c7; 12 accepted actions |

Both configurations use the same `createExpedition` factory and `defineGame` object for the live store, manual UI and simulation. The tile order varies with seed; neither the pilot nor the UI reads it. There is one physical instance of each named tile. Rule expectations above are original and are separately transcribed into `tests/expedition-acceptance.ts`; they are not calculated from executable damage or placement callbacks.

## Execute the consumer evidence

Run `node tests/expedition-acceptance.ts` for the bounded engine/store/simulation result, or `npx vitest run tests/expedition.test.ts` for that result plus three isolated source controls. The controls increase damage, omit the selected join, or retain a consumed tile. Each must fail its independent acceptance or strict physical-instance invariant. The placement-failure path also compares the entire authoritative input before and after the exception.

Acceptance plays four seeds for each configuration, checks actual refusals and fixed damage, consumes every tile, restores a pending exploration save, repeats deterministic actions, compares real live-store and simulation histories/views, and checks last-point victory versus a shorter-budget loss. These results do not certify browser rendering or any external game's rules. Browser and hosted execution need their own recorded results.

This reference does not add a universal geometry adapter, general combat policy, narrative campaign or new shared mechanic.
